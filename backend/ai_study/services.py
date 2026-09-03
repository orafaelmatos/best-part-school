import base64
import json
import mimetypes
import os
import re
import uuid
from difflib import SequenceMatcher
from django.conf import settings
from django.db import transaction
from django.db.models import Count, Max, Q
from django.utils import timezone
from django.utils.html import escape, strip_tags
from openai import OpenAI
from lessons.models import (
    Homework,
    Lesson,
    LessonSummary,
    LessonSummaryMistake,
    LessonSummaryNextTopic,
    LessonSummaryWord,
    VocabularyCard,
    VocabularyCategory,
)
from .models import (
    AIContextLesson,
    AIConversationMessage,
    PronunciationReview,
    SpeakingAudio,
    SpeakingFeedback,
    WritingFeedback,
)
from .guided_tutor import (
    LEVEL_ASSESSMENT_QUESTIONS,
    action_instruction_for_value,
    build_listening_journey,
    build_default_guided_state,
    build_guided_metadata,
    custom_scenario_prompt_message,
    default_session_objective,
    feedback_choices_for_mode,
    find_scenario_option,
    follow_up_choices_for_mode,
    guided_session_title,
    kickoff_message,
    level_assessment_message,
    level_prompt_message,
    normalize_guided_state,
    normalize_listening_journey,
    normalize_level_choice,
    parse_level_choice,
    placeholder_for_expected_input,
    scenario_prompt_message,
    scenario_task_for_mode,
    summary_message_text,
    SUMMARY_ACTIONS,
    unique_items,
)

client = OpenAI()


def media_url(path):
    base = settings.MEDIA_URL if settings.MEDIA_URL.endswith('/') else f"{settings.MEDIA_URL}/"
    return f"{base}{path}"


def html_to_text(value):
    text = str(value or '')
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<li\b[^>]*>', '- ', text, flags=re.IGNORECASE)
    text = re.sub(r'</(p|div|h[1-6]|li|ul|ol|blockquote)>', '\n', text, flags=re.IGNORECASE)
    text = strip_tags(text).replace('\xa0', ' ')
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n+', '\n', text)
    return text.strip()


def clean_context_text(value, limit=None):
    text = html_to_text(value)
    if limit and len(text) > limit:
        return f"{text[:limit].rstrip()}..."
    return text


def normalize_score(value):
    try:
        return max(0, min(100, int(round(float(value or 0)))))
    except (TypeError, ValueError):
        return 0


def normalize_level(value, fallback='A2'):
    normalized = clean_context_text(value, limit=10).upper()
    return normalized if normalized in {'A1', 'A2', 'B1', 'B2', 'C1', 'C2'} else fallback


def normalize_string_list(value, limit=12):
    items = value if isinstance(value, list) else []
    cleaned = []
    for item in items:
        text = clean_context_text(item, limit=220)
        if text:
            cleaned.append(text)
        if len(cleaned) >= limit:
            break
    return cleaned


def normalize_dict_list(value, limit=12):
    items = value if isinstance(value, list) else []
    cleaned = []
    for item in items:
        if not isinstance(item, dict):
            continue
        normalized = {}
        for key, item_value in item.items():
            normalized[key] = clean_context_text(item_value, limit=320)
        if normalized:
            cleaned.append(normalized)
        if len(cleaned) >= limit:
            break
    return cleaned


def normalize_rewrites(value):
    base = value if isinstance(value, dict) else {}
    return {
        level: clean_context_text(base.get(level), limit=4000)
        for level in ['B1', 'B2', 'C1', 'C2']
        if clean_context_text(base.get(level), limit=4000)
    }


def normalize_comparison_text(value):
    normalized = re.sub(r"[^a-z0-9\s]", "", clean_context_text(value, limit=4000).lower())
    return re.sub(r"\s+", " ", normalized).strip()


def similarity_ratio(left, right):
    left_text = normalize_comparison_text(left)
    right_text = normalize_comparison_text(right)
    if not left_text or not right_text:
        return 0
    return SequenceMatcher(None, left_text, right_text).ratio()


def mode_display_name(mode):
    return {
        'review': 'Lesson Review',
        'speaking': 'Speaking Practice',
        'listening': 'Interprete IA',
        'writing': 'Writing Lab',
    }.get(mode, 'AI Practice')


def get_lesson_summary_text(lesson):
    try:
        summary = lesson.summary
    except LessonSummary.DoesNotExist:
        return ''
    return summary.summary or ''


def get_lesson_ai_context_text(lesson):
    try:
        summary = lesson.summary
    except LessonSummary.DoesNotExist:
        return ''
    raw_summary = summary.raw_ai_response.get('summary') if isinstance(summary.raw_ai_response, dict) else ''
    return raw_summary or summary.summary or ''


def get_lesson_summary_details(lesson):
    try:
        summary = lesson.summary
    except LessonSummary.DoesNotExist:
        return {
            'teacher_summary': '',
            'ai_context_summary': '',
            'homework': '',
            'observations': '',
            'words': [],
            'mistakes': [],
            'next_topics': [],
        }

    raw_summary = summary.raw_ai_response if isinstance(summary.raw_ai_response, dict) else {}
    return {
        'teacher_summary': clean_context_text(summary.summary, limit=2200),
        'ai_context_summary': clean_context_text(raw_summary.get('summary') or summary.summary, limit=2200),
        'homework': clean_context_text(summary.homework, limit=1200),
        'observations': clean_context_text(summary.observations, limit=1200),
        'words': [
            {'word': word.word, 'meaning': word.meaning}
            for word in summary.words.all()[:20]
            if word.word
        ],
        'mistakes': [
            {'mistake': item.mistake, 'correction': item.correction}
            for item in summary.mistakes.all()[:12]
            if item.mistake
        ],
        'next_topics': [
            item.topic
            for item in summary.next_topics.all()[:8]
            if item.topic
        ],
    }


def lesson_image_references(lesson, limit=None):
    references = []
    attachments = getattr(lesson, 'attachments', None)
    items = attachments.all() if attachments is not None else []
    for attachment in items:
        mime_type, _ = mimetypes.guess_type(attachment.file.name)
        if not mime_type or not mime_type.startswith('image/'):
            continue
        references.append({
            'name': os.path.basename(attachment.file.name),
            'url': media_url(attachment.file.name),
            'mime_type': mime_type,
        })
        if limit and len(references) >= limit:
            break
    return references


def openai_image_blocks(lesson, limit=4):
    blocks = []
    references = []
    attachments = getattr(lesson, 'attachments', None)
    items = attachments.all() if attachments is not None else []
    for attachment in items:
        mime_type, _ = mimetypes.guess_type(attachment.file.name)
        if not mime_type or not mime_type.startswith('image/'):
            continue
        try:
            attachment.file.open('rb')
            encoded = base64.b64encode(attachment.file.read()).decode('ascii')
        except Exception:
            continue
        finally:
            try:
                attachment.file.close()
            except Exception:
                pass
        blocks.append({
            'type': 'image_url',
            'image_url': {'url': f"data:{mime_type};base64,{encoded}"},
        })
        references.append({
            'name': os.path.basename(attachment.file.name),
            'mime_type': mime_type,
        })
        if len(references) >= limit:
            break
    return blocks, references


def lesson_flashcard_references(lesson, limit=20):
    cards = []
    queryset = getattr(lesson, 'vocabulary_cards', None)
    items = queryset.all() if queryset is not None else VocabularyCard.objects.filter(lesson=lesson)
    for card in items[:limit]:
        word = clean_context_text(card.word, limit=120)
        translation = clean_context_text(card.translation, limit=220)
        if not word:
            continue
        cards.append({
            'word': word,
            'translation': translation,
            'explanation': clean_context_text(card.explanation, limit=320),
            'example_sentence': clean_context_text(card.example_sentence, limit=240),
            'pronunciation': clean_context_text(card.pronunciation, limit=120),
            'difficulty_level': card.difficulty_level,
            'tags': card.tags[:6] if isinstance(card.tags, list) else [],
        })
    return cards


class AIStudyContextService:
    @staticmethod
    def accessible_lessons(user, student=None):
        qs = Lesson.objects.filter(is_template=False).select_related('teacher', 'student', 'summary').prefetch_related(
            'new_words',
            'attachments',
            'vocabulary_cards',
            'summary__words',
            'summary__mistakes',
            'summary__next_topics',
            'homework_items',
            'homework_items__answers__question',
        )
        if user.role == 'admin':
            return qs.filter(student=student) if student else qs
        if user.role == 'teacher':
            qs = qs.filter(teacher=user)
            return qs.filter(student=student) if student else qs
        return qs.filter(student=user)

    @staticmethod
    def filter_lessons(user, params):
        qs = AIStudyContextService.accessible_lessons(user).annotate(
            new_words_count=Count('new_words', distinct=True),
            flashcard_count=Count('vocabulary_cards', distinct=True),
            pending_homework_count=Count(
                'homework_items',
                filter=Q(homework_items__status__in=['pending', 'sent']),
                distinct=True,
            ),
            last_ai_interaction_at=Max('ai_study_sessions__last_interaction_at'),
        )
        teacher = params.get('teacher')
        date_from = params.get('date_from')
        date_to = params.get('date_to')
        category = params.get('category')
        tag = params.get('tag')
        if teacher:
            qs = qs.filter(teacher_id=teacher)
        if date_from:
            qs = qs.filter(date__date__gte=date_from)
        if date_to:
            qs = qs.filter(date__date__lte=date_to)
        if category:
            qs = qs.filter(Q(level__icontains=category) | Q(title__icontains=category))
        if tag:
            qs = qs.filter(Q(level__icontains=tag) | Q(title__icontains=tag) | Q(notes__icontains=tag))
        return qs.order_by('-date')

    @staticmethod
    def primary_lesson(session):
        if session.lesson_id:
            return session.lesson
        first_context = session.context_lessons.select_related('lesson').first()
        return first_context.lesson if first_context else None

    @staticmethod
    def default_session_title(lesson):
        return clean_context_text(f"{lesson.title} Practice", limit=80) if lesson else 'AI Practice'

    @staticmethod
    def touch_session(session, timestamp=None):
        now = timestamp or timezone.now()
        session.last_interaction_at = now
        session.updated_at = now
        session.save(update_fields=['last_interaction_at', 'updated_at'])
        return session

    @staticmethod
    def lesson_snapshot(lesson):
        summary_details = get_lesson_summary_details(lesson)
        homework = Homework.objects.filter(lesson=lesson).prefetch_related('questions', 'answers__question')
        return {
            'lesson_id': str(lesson.id),
            'title': lesson.title,
            'date': lesson.date.isoformat() if lesson.date else None,
            'level': lesson.level,
            'notes': clean_context_text(lesson.notes, limit=3000),
            'summary_context': summary_details['teacher_summary'],
            'ai_context_summary': summary_details['ai_context_summary'],
            'summary_homework': summary_details['homework'],
            'summary_observations': summary_details['observations'],
            'summary_words': summary_details['words'],
            'summary_mistakes': summary_details['mistakes'],
            'summary_next_topics': summary_details['next_topics'],
            'vocabulary': [
                {'word': word.word, 'meaning': word.meaning, 'status': word.status}
                for word in lesson.new_words.all()
            ],
            'flashcards': lesson_flashcard_references(lesson, limit=20),
            'visual_references': lesson_image_references(lesson, limit=6),
            'homework': [
                {
                    'title': item.title,
                    'status': item.status,
                    'classification': item.classification,
                    'teacher_feedback': item.teacher_feedback,
                    'answers': [
                        {
                            'question': answer.question.prompt,
                            'answer': answer.answer_text if answer.answer_text else (
                                answer.question.options[answer.selected_option_index]
                                if answer.selected_option_index is not None and answer.selected_option_index < len(answer.question.options)
                                else ''
                            ),
                            'teacher_feedback': answer.teacher_feedback,
                        }
                        for answer in item.answers.all()
                    ],
                }
                for item in homework
            ],
        }

    @staticmethod
    def sync_session_lesson(session, lesson):
        AIContextLesson.objects.filter(session=session).exclude(lesson=lesson).delete()
        AIContextLesson.objects.update_or_create(
            session=session,
            lesson=lesson,
            defaults={'snapshot': AIStudyContextService.lesson_snapshot(lesson)},
        )
        now = timezone.now()
        session.lesson = lesson
        session.auto_context = AIStudyContextService.build_auto_context(session)
        session.last_interaction_at = now
        session.updated_at = now
        session.save(update_fields=['lesson', 'auto_context', 'last_interaction_at', 'updated_at'])
        return session

    @staticmethod
    def set_context_lessons(session, lesson_ids):
        if len(lesson_ids) != 1:
            raise ValueError('Exactly one lesson must be selected.')
        lesson = AIStudyContextService.accessible_lessons(session.student).filter(id=lesson_ids[0]).first()
        if not lesson:
            raise ValueError('Selected lesson is not available.')
        AIStudyContextService.sync_session_lesson(session, lesson)
        return session

    @staticmethod
    def build_auto_context(session):
        lessons = Lesson.objects.filter(student=session.student, is_template=False).select_related('summary').order_by('-date').prefetch_related(
            'new_words',
            'attachments',
            'vocabulary_cards',
            'summary__words',
            'summary__mistakes',
            'summary__next_topics',
        )[:8]
        homework = Homework.objects.filter(student=session.student).prefetch_related('questions', 'answers').order_by('-created_at')[:12]
        hardest_vocabulary = []
        recent_topics = []
        recent_contexts = []
        for lesson in lessons:
            recent_topics.append(lesson.title)
            summary_text = get_lesson_ai_context_text(lesson)
            if summary_text:
                recent_contexts.append({
                    'lesson': lesson.title,
                    'summary': clean_context_text(summary_text, limit=1200),
                })
            hardest_vocabulary.extend([
                {'word': word.word, 'meaning': word.meaning, 'status': word.status, 'lesson': lesson.title}
                for word in lesson.new_words.all()
                if word.status in ['hard', 'medium']
            ])
            hardest_vocabulary.extend([
                {
                    'word': card.word,
                    'meaning': card.translation,
                    'status': card.difficulty_level,
                    'lesson': lesson.title,
                }
                for card in lesson.vocabulary_cards.all()
                if card.word and card.difficulty_level in ['new', 'weak', 'learning']
            ])
        homework_gaps = []
        for item in homework:
            if item.status in ['pending', 'sent']:
                homework_gaps.append({'title': item.title, 'status': item.status, 'classification': item.classification})
            for answer in item.answers.all():
                if answer.teacher_feedback:
                    homework_gaps.append({
                        'title': item.title,
                        'question': answer.question.prompt,
                        'answer': answer.answer_text,
                        'feedback': answer.teacher_feedback,
                    })
        student = session.student
        low_skills = [
            name for name, value in {
                'listening': student.listening,
                'speaking': student.speaking,
                'reading': student.reading,
                'writing': student.writing,
            }.items()
            if value <= 4
        ]
        return {
            'recent_lessons': recent_topics,
            'recent_contexts': recent_contexts[:8],
            'hardest_vocabulary': hardest_vocabulary[:30],
            'homework_gaps': homework_gaps[:30],
            'weak_grammar_topics': [gap.get('classification') for gap in homework_gaps if gap.get('classification')],
            'student_weaknesses': low_skills,
            'level': student.level,
        }

    @staticmethod
    def guided_session_payload(session):
        mode = getattr(session, 'mode', '')
        if mode not in ['speaking', 'writing']:
            return {}
        guided_state = AIStudyWorkflowService.ensure_guided_state(session)
        return {
            'enabled': True,
            'stage': guided_state.get('stage'),
            'scenario': guided_state.get('scenario_label'),
            'level': guided_state.get('level') or normalize_level_choice(getattr(session.student, 'level', 'A2')),
            'level_source': guided_state.get('level_source'),
            'objective': guided_state.get('objective'),
            'difficulty': guided_state.get('difficulty'),
            'progress_summary': guided_state.get('progress_summary'),
            'learned_words': guided_state.get('learned_words') or [],
            'recurring_errors': guided_state.get('recurring_errors') or [],
            'completed_activities': guided_state.get('completed_activities') or [],
            'current_task': guided_state.get('current_task'),
            'expected_input': guided_state.get('expected_input'),
            'session_status': guided_state.get('session_status'),
            'summary_items': guided_state.get('summary_items') or [],
        }

    @staticmethod
    def active_level(session):
        guided_payload = AIStudyContextService.guided_session_payload(session)
        return guided_payload.get('level') or normalize_level_choice(getattr(session.student, 'level', 'A2'))

    @staticmethod
    def _compact_snapshot(snapshot):
        return {
            'lesson_id': snapshot.get('lesson_id'),
            'title': snapshot.get('title'),
            'date': snapshot.get('date'),
            'level': snapshot.get('level'),
            'notes': clean_context_text(snapshot.get('notes'), limit=2500),
            'teacher_summary': clean_context_text(snapshot.get('summary_context'), limit=1800),
            'ai_context_summary': clean_context_text(snapshot.get('ai_context_summary'), limit=1800),
            'summary_homework': clean_context_text(snapshot.get('summary_homework'), limit=900),
            'summary_observations': clean_context_text(snapshot.get('summary_observations'), limit=900),
            'summary_words': (snapshot.get('summary_words') or [])[:20],
            'summary_mistakes': (snapshot.get('summary_mistakes') or [])[:12],
            'summary_next_topics': (snapshot.get('summary_next_topics') or [])[:8],
            'new_words': (snapshot.get('vocabulary') or [])[:20],
            'flashcards': (snapshot.get('flashcards') or [])[:20],
            'visual_references': (snapshot.get('visual_references') or [])[:6],
            'homework': (snapshot.get('homework') or [])[:4],
        }

    @staticmethod
    def selected_context_payload(session, include_images=True):
        selected = []
        image_blocks = []
        remaining_images = 6
        contexts = list(session.context_lessons.select_related('lesson').all())
        if not contexts:
            lesson = AIStudyContextService.primary_lesson(session)
            contexts = [type('ContextWrapper', (), {'lesson': lesson})] if lesson else []
        for context in contexts:
            lesson = context.lesson
            if not lesson:
                continue
            snapshot = AIStudyContextService.lesson_snapshot(lesson)
            selected.append(AIStudyContextService._compact_snapshot(snapshot))
            if not include_images or remaining_images <= 0:
                continue
            lesson_blocks, _ = openai_image_blocks(lesson, limit=min(2, remaining_images))
            image_blocks.extend(lesson_blocks)
            remaining_images -= len(lesson_blocks)
        return selected, image_blocks

    @staticmethod
    def prompt_context(session):
        selected, _ = AIStudyContextService.selected_context_payload(session, include_images=False)
        auto_context = session.auto_context or AIStudyContextService.build_auto_context(session)
        guided_session = AIStudyContextService.guided_session_payload(session)
        selected_titles = [item.get('title') for item in selected if item.get('title')]
        priority_rules = [
            'Use selected_lessons as the primary source of truth whenever they exist.',
            'Use the current lesson as the primary source of truth whenever it exists.',
            'If the student asks about "this lesson", assume they mean the linked lesson context.',
            'Use these lesson materials in this order: ai_context_summary, teacher_summary, lesson notes, flashcards/new words, attached images, homework and corrections.',
            'Do not mix unrelated topics from auto_context when a selected lesson already answers the question.',
            'If the selected lesson does not contain enough evidence, say that clearly instead of inventing details.',
        ]
        payload = {
            'current_lesson': selected[0] if selected else None,
            'selected_lessons_present': bool(selected),
            'selected_lesson_titles': selected_titles,
            'selected_lessons_priority': 'primary' if selected else 'none',
            'selected_lessons': selected,
            'auto_context': auto_context,
            'guided_session': guided_session,
        }
        instruction_block = "CONTEXT USAGE RULES:\n- " + "\n- ".join(priority_rules)
        if selected_titles:
            instruction_block += f"\n\nCURRENT SELECTED LESSONS: {', '.join(selected_titles)}"
        return f"{instruction_block}\n\nCONTEXT JSON:\n{json.dumps(payload, ensure_ascii=False)}"[:22000]

    @staticmethod
    def tutor_system_prompt(session):
        lesson = AIStudyContextService.primary_lesson(session)
        lesson_title = lesson.title if lesson else 'No lesson selected'
        active_level = AIStudyContextService.active_level(session)
        guided_payload = AIStudyContextService.guided_session_payload(session)
        guided_rules = ''
        if guided_payload:
            guided_rules = (
                f" Guided session scenario: {guided_payload.get('scenario') or 'Free conversation'}. "
                f" Guided session objective: {guided_payload.get('objective') or ''}. "
                ' You must lead the lesson proactively, alternate between practice, correction and explanation, '
                'and always finish with clear next steps.'
            )
        common_prefix = (
            'You are an English tutor inside an English school SaaS. '
            'Teach with precision and keep feedback practical, structured and pedagogical. '
            f'Student level: {active_level or "A2"}. Current lesson: {lesson_title}. '
        )
        lesson_rules = (
            'Selected lesson context is primary when it exists. '
            'Ground every answer in the linked lesson first and use broader student history only as fallback. '
            'When lesson context exists, answer based on its notes, summaries, flashcards, attached images, homework and corrections. '
            'Do not invent what happened in class. If the context is incomplete, say so explicitly. '
        )
        if session.mode == 'review':
            return (
                common_prefix +
                'The active mode is lesson review. '
                'Focus on revision of vocabulary, grammar, comprehension and exercises connected to the selected lesson. '
                + lesson_rules +
                'Keep answers concise, helpful and pedagogical, and end with one natural follow-up question when it fits.'
            )
        if session.mode == 'speaking':
            return (
                common_prefix +
                'The active mode is speaking practice. '
                'Act as a pronunciation coach. Text replies should reinforce pronunciation, fluency, intonation and clarity, and propose short targeted drills based on the student mistakes when relevant. '
                + lesson_rules + guided_rules +
                'Keep the reply concise and actionable.'
            )
        if session.mode == 'writing':
            return (
                common_prefix +
                'The active mode is writing practice. '
                'If the student sends short follow-up questions, answer as a writing coach using the latest corrections as reference. '
                'Prefer concrete explanations, CEFR-oriented guidance and examples over generic motivation. '
                + lesson_rules + guided_rules
            )
        return common_prefix + lesson_rules


class AIStudyOpenAIService:
    lesson_summary_schema = {
        'name': 'lesson_summary',
        'schema': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                'summary': {'type': 'string'},
                'newWords': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'additionalProperties': False,
                        'properties': {
                            'word': {'type': 'string'},
                            'meaning': {'type': 'string'},
                        },
                        'required': ['word', 'meaning'],
                    },
                },
                'mistakesCorrected': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'additionalProperties': False,
                        'properties': {
                            'mistake': {'type': 'string'},
                            'correction': {'type': 'string'},
                        },
                        'required': ['mistake', 'correction'],
                    },
                },
                'homework': {'type': 'string'},
                'nextTopics': {'type': 'array', 'items': {'type': 'string'}},
                'flashcards': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'additionalProperties': False,
                        'properties': {
                            'front': {'type': 'string'},
                            'back': {'type': 'string'},
                        },
                        'required': ['front', 'back'],
                    },
                },
            },
            'required': ['summary', 'newWords', 'mistakesCorrected', 'homework', 'nextTopics', 'flashcards'],
        },
        'strict': True,
    }

    pronunciation_schema = {
        'name': 'pronunciation_feedback',
        'schema': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                'transcript': {'type': 'string'},
                'overall_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'estimated_level': {'type': 'string'},
                'pronunciation_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'fluency_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'intonation_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'clarity_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'corrected_sentence': {'type': 'string'},
                'natural_sentence': {'type': 'string'},
                'ai_feedback': {'type': 'string'},
                'correct_words': {'type': 'array', 'items': {'type': 'string'}},
                'problem_words': {'type': 'array', 'items': {'type': 'string'}},
                'pronunciation_mistakes': {'type': 'array', 'items': {'type': 'string'}},
                'error_details': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'additionalProperties': False,
                        'properties': {
                            'word': {'type': 'string'},
                            'issue': {'type': 'string'},
                            'tip': {'type': 'string'},
                        },
                        'required': ['word', 'issue', 'tip'],
                    },
                },
                'grammar_explanation': {'type': 'string'},
                'improvement_tips': {'type': 'array', 'items': {'type': 'string'}},
                'practice_exercises': {'type': 'array', 'items': {'type': 'string'}},
                'vocabulary_suggestions': {'type': 'array', 'items': {'type': 'string'}},
                'native_alternative_sentence': {'type': 'string'},
                'assistant_response': {'type': 'string'},
            },
            'required': [
                'transcript', 'overall_score', 'estimated_level', 'pronunciation_score',
                'fluency_score', 'intonation_score', 'clarity_score', 'corrected_sentence',
                'natural_sentence', 'ai_feedback', 'correct_words', 'problem_words',
                'pronunciation_mistakes', 'error_details', 'grammar_explanation',
                'improvement_tips', 'practice_exercises', 'vocabulary_suggestions',
                'native_alternative_sentence', 'assistant_response'
            ],
        },
        'strict': True,
    }

    writing_schema = {
        'name': 'writing_feedback',
        'schema': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                'estimated_level': {'type': 'string'},
                'writing_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'sub_scores': {
                    'type': 'object',
                    'additionalProperties': False,
                    'properties': {
                        'grammar': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                        'vocabulary': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                        'naturality': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                        'coherence': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                        'complexity': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                    },
                    'required': ['grammar', 'vocabulary', 'naturality', 'coherence', 'complexity'],
                },
                'corrected_text': {'type': 'string'},
                'general_feedback': {'type': 'string'},
                'level_progress_feedback': {'type': 'string'},
                'strengths': {'type': 'array', 'items': {'type': 'string'}},
                'error_explanations': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'additionalProperties': False,
                        'properties': {
                            'excerpt': {'type': 'string'},
                            'corrected': {'type': 'string'},
                            'explanation': {'type': 'string'},
                            'category': {'type': 'string'},
                        },
                        'required': ['excerpt', 'corrected', 'explanation', 'category'],
                    },
                },
                'improvement_tips': {'type': 'array', 'items': {'type': 'string'}},
                'rewrites': {
                    'type': 'object',
                    'additionalProperties': False,
                    'properties': {
                        'B1': {'type': 'string'},
                        'B2': {'type': 'string'},
                        'C1': {'type': 'string'},
                        'C2': {'type': 'string'},
                    },
                    'required': ['B1', 'B2', 'C1', 'C2'],
                },
                'exercises': {'type': 'array', 'items': {'type': 'string'}},
                'grammar_breakdown': {'type': 'array', 'items': {'type': 'string'}},
                'vocabulary_flashcards': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'additionalProperties': False,
                        'properties': {
                            'term': {'type': 'string'},
                            'meaning': {'type': 'string'},
                            'example': {'type': 'string'},
                        },
                        'required': ['term', 'meaning', 'example'],
                    },
                },
                'assistant_response': {'type': 'string'},
            },
            'required': [
                'estimated_level', 'writing_score', 'sub_scores', 'corrected_text',
                'general_feedback', 'level_progress_feedback', 'strengths',
                'error_explanations', 'improvement_tips', 'rewrites', 'exercises',
                'grammar_breakdown', 'vocabulary_flashcards', 'assistant_response',
            ],
        },
        'strict': True,
    }

    guided_tutor_schema = {
        'name': 'guided_tutor_turn',
        'schema': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                'assistant_response': {'type': 'string'},
                'activity_type': {'type': 'string'},
                'recommended_next_step': {'type': 'string'},
                'objective': {'type': 'string'},
                'difficulty': {'type': 'string'},
                'progress_summary': {'type': 'string'},
                'learned_words': {'type': 'array', 'items': {'type': 'string'}},
                'recurring_errors': {'type': 'array', 'items': {'type': 'string'}},
                'quick_replies': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'additionalProperties': False,
                        'properties': {
                            'id': {'type': 'string'},
                            'label': {'type': 'string'},
                            'value': {'type': 'string'},
                            'action_type': {'type': 'string'},
                            'variant': {'type': 'string'},
                        },
                        'required': ['id', 'label', 'value', 'action_type', 'variant'],
                    },
                },
                'expected_input': {'type': 'string'},
                'current_task': {'type': 'string'},
                'input_placeholder': {'type': 'string'},
                'should_wrap_up': {'type': 'boolean'},
                'session_summary': {'type': 'array', 'items': {'type': 'string'}},
            },
            'required': [
                'assistant_response', 'activity_type', 'recommended_next_step', 'objective',
                'difficulty', 'progress_summary', 'learned_words', 'recurring_errors',
                'quick_replies', 'expected_input', 'current_task', 'input_placeholder',
                'should_wrap_up', 'session_summary',
            ],
        },
        'strict': True,
    }

    level_assessment_schema = {
        'name': 'level_assessment_result',
        'schema': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                'estimated_level': {'type': 'string'},
                'rationale': {'type': 'string'},
                'focus_points': {'type': 'array', 'items': {'type': 'string'}},
            },
            'required': ['estimated_level', 'rationale', 'focus_points'],
        },
        'strict': True,
    }

    translation_schema = {
        'name': 'selection_translation',
        'schema': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                'translation': {'type': 'string'},
            },
            'required': ['translation'],
        },
        'strict': True,
    }

    listening_exercise_schema = {
        'name': 'listening_exercise',
        'schema': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                'transcript': {'type': 'string'},
                'instructions': {'type': 'string'},
                'alternatives': {
                    'type': 'array',
                    'minItems': 4,
                    'maxItems': 4,
                    'items': {'type': 'string'},
                },
                'correct_option_index': {'type': 'integer', 'minimum': 0, 'maximum': 3},
                'focus_words': {'type': 'array', 'items': {'type': 'string'}},
            },
            'required': ['transcript', 'instructions', 'alternatives', 'correct_option_index', 'focus_words'],
        },
        'strict': True,
    }

    @staticmethod
    def transcribe(audio_file):
        file_content = audio_file.read()
        audio_file.seek(0)
        response = client.audio.transcriptions.create(
            model='whisper-1', 
            file=(getattr(audio_file, 'name', 'audio.webm'), file_content)
        )
        return response.text

    @staticmethod
    def analyze_speaking(session, transcript):
        context_text = AIStudyContextService.prompt_context(session)
        _, image_blocks = AIStudyContextService.selected_context_payload(session, include_images=True)
        lesson = AIStudyContextService.primary_lesson(session)
        guided_payload = AIStudyContextService.guided_session_payload(session)
        messages = [
            {
                'role': 'system',
                'content': (
                    'You are a strict but friendly English pronunciation and fluency coach. '
                    'Analyze the student speech transcript in English. Return only structured JSON. '
                    'Do not invent issues; if a sentence is correct, explain what is good and keep corrections close to original meaning. '
                    'Use the selected lesson context as primary evidence when it exists.'
                ),
            },
            {
                'role': 'user',
                'content': [
                    {
                        'type': 'text',
                        'text': (
                            f"Student level: {AIStudyContextService.active_level(session) or 'A2'}\n"
                            f"Guided scenario: {guided_payload.get('scenario') or 'Free conversation'}\n"
                            f"Guided objective: {guided_payload.get('objective') or ''}\n"
                            f"Current lesson: {lesson.title if lesson else 'Unknown lesson'}\n"
                            f"Context:\n{context_text}\n\n"
                            f"Transcript:\n{transcript}\n\n"
                            'Evaluate pronunciation, fluency, intonation and clarity. '
                            'Return an estimated CEFR level, a global score, words that were correct, '
                            'words that need improvement, error explanations, and short drill ideas.'
                        ),
                    },
                    *image_blocks,
                ],
            },
        ]
        response = client.chat.completions.create(
            model='gpt-4o',
            messages=messages,
            response_format={'type': 'json_schema', 'json_schema': AIStudyOpenAIService.pronunciation_schema},
        )
        return json.loads(response.choices[0].message.content)

    @staticmethod
    def analyze_writing(session, text, text_type='free'):
        context_text = AIStudyContextService.prompt_context(session)
        _, image_blocks = AIStudyContextService.selected_context_payload(session, include_images=True)
        lesson = AIStudyContextService.primary_lesson(session)
        guided_payload = AIStudyContextService.guided_session_payload(session)
        messages = [
            {
                'role': 'system',
                'content': (
                    'You are a strict but encouraging English writing evaluator. '
                    'Analyze the student text and return only structured JSON. '
                    'Estimate the CEFR level, score the writing, correct the text, explain errors, '
                    'suggest improvements to reach the next level, generate rewritten versions for B1, B2, C1 and C2, '
                    'and create quick study actions based on the same errors. '
                    'The assistant_response field must be a short natural chat reply for the student, '
                    'never JSON, never a rubric, and never a dump of scores or labels.'
                ),
            },
            {
                'role': 'user',
                'content': [
                    {
                        'type': 'text',
                        'text': (
                            f"Student level: {AIStudyContextService.active_level(session) or 'A2'}\n"
                            f"Writing type: {text_type}\n"
                            f"Guided scenario: {guided_payload.get('scenario') or 'Free conversation'}\n"
                            f"Guided objective: {guided_payload.get('objective') or ''}\n"
                            f"Current lesson: {lesson.title if lesson else 'No lesson selected'}\n"
                            f"Context:\n{context_text}\n\n"
                            f"Student text:\n{text}"
                        ),
                    },
                    *image_blocks,
                ],
            },
        ]
        response = client.chat.completions.create(
            model='gpt-4o',
            messages=messages,
            response_format={'type': 'json_schema', 'json_schema': AIStudyOpenAIService.writing_schema},
        )
        return json.loads(response.choices[0].message.content)

    @staticmethod
    def generate_guided_tutor_reply(session, learner_input, action_value=''):
        guided_payload = AIStudyContextService.guided_session_payload(session)
        context_text = AIStudyContextService.prompt_context(session)
        preferred_actions = follow_up_choices_for_mode(session.mode, recommended='continue')
        action_instruction = action_instruction_for_value(session.mode, action_value) if action_value else ''
        messages = [
            {
                'role': 'system',
                'content': (
                    'You are a proactive private English tutor guiding the entire lesson from start to finish. '
                    'The student should never wonder what to ask next. '
                    'Always adapt to the current CEFR level, keep explanations practical, and alternate between dialogue, correction, explanation, vocabulary and short challenges. '
                    'When the student asks for help, an example text, a model answer, vocabulary or a grammar explanation, answer that request directly before moving on. '
                    'Keep assistant_response concise and conversational, like a chat tutor. '
                    'If the student makes a mistake, show the mistake, explain briefly, give the correct form and ask the student to try again. '
                    'Do not put JSON, score labels or evaluation rubrics inside assistant_response. '
                    'Always end by clearly offering the next step. '
                    'Return only JSON.'
                ),
            },
            {
                'role': 'user',
                'content': (
                    f"Mode: {session.mode}\n"
                    f"Current guided session: {json.dumps(guided_payload, ensure_ascii=False)}\n"
                    f"Available quick replies template: {json.dumps(preferred_actions, ensure_ascii=False)}\n"
                    f"Context:\n{context_text}\n\n"
                    f"Student input:\n{learner_input}\n\n"
                    f"Explicit requested action:\n{action_instruction}\n"
                ),
            },
        ]
        response = client.chat.completions.create(
            model='gpt-4o',
            messages=messages,
            response_format={'type': 'json_schema', 'json_schema': AIStudyOpenAIService.guided_tutor_schema},
        )
        return json.loads(response.choices[0].message.content)

    @staticmethod
    def estimate_level_from_assessment(session, scenario_label, answers):
        messages = [
            {
                'role': 'system',
                'content': (
                    'You estimate an English learner CEFR level from a short placement sample. '
                    'Be practical and conservative. Return only JSON.'
                ),
            },
            {
                'role': 'user',
                'content': json.dumps(
                    {
                        'mode': session.mode,
                        'scenario': scenario_label,
                        'student_profile_level': getattr(session.student, 'level', None),
                        'questions': LEVEL_ASSESSMENT_QUESTIONS,
                        'answers': answers,
                    },
                    ensure_ascii=False,
                ),
            },
        ]
        response = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=messages,
            response_format={'type': 'json_schema', 'json_schema': AIStudyOpenAIService.level_assessment_schema},
        )
        return json.loads(response.choices[0].message.content)

    @staticmethod
    def translate_selection(text):
        cleaned = clean_context_text(text, limit=280)
        messages = [
            {
                'role': 'system',
                'content': (
                    'You translate short English learning snippets into natural Brazilian Portuguese. '
                    'Keep the translation concise, faithful to the original meaning, and useful for a student. '
                    'Return only JSON.'
                ),
            },
            {
                'role': 'user',
                'content': (
                    f"Translate this selection to pt-BR:\n{cleaned}\n\n"
                    'Preserve tone when possible. Do not explain, annotate, or add quotes.'
                ),
            },
        ]
        response = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=messages,
            response_format={'type': 'json_schema', 'json_schema': AIStudyOpenAIService.translation_schema},
        )
        payload = json.loads(response.choices[0].message.content)
        return clean_context_text(payload.get('translation', ''), limit=400)

    @staticmethod
    def generate_listening_exercise(session, state):
        scenario_label = clean_context_text(state.get('scenario_label') or 'Conversacao livre', limit=120)
        level = clean_context_text(state.get('level') or getattr(session.student, 'level', 'A2') or 'A2', limit=10)
        journey = normalize_listening_journey(state.get('listening_journey'))
        steps = journey.get('steps') or []
        current_step_index = max(0, min(int(journey.get('current_step_index') or 0), max(len(steps) - 1, 0)))
        current_step = steps[current_step_index] if steps else {
            'id': 'current_step',
            'label': scenario_label,
            'prompt': scenario_task_for_mode('listening', state.get('scenario_key'), scenario_label),
        }
        completed_steps = [
            step.get('label')
            for step in steps
            if step.get('id') in set(journey.get('completed_step_ids') or [])
        ]
        remaining_steps = [
            step.get('label')
            for index, step in enumerate(steps)
            if index > current_step_index and step.get('label')
        ][:4]
        previous_transcripts = [
            clean_context_text(message.text, limit=280)
            for message in session.messages.order_by('-created_at')[:8]
            if isinstance(message.metadata, dict) and message.metadata.get('interpreter_exercise') and message.text
        ]
        messages = [
            {
                'role': 'system',
                'content': (
                    'You create listening transcription exercises for English learners inside a continuous role-play journey. '
                    'Return only JSON. '
                    'The transcript must be natural spoken English, short enough for TTS, and suitable for a dictation activity. '
                    'Provide exactly 4 alternatives in English, including the exact transcript once and 3 plausible distractors. '
                    'The sentence must clearly belong to the current step of the journey and must not jump ahead to future steps.'
                ),
            },
            {
                'role': 'user',
                'content': json.dumps(
                    {
                        'mode': 'listening',
                        'scenario': scenario_label,
                        'scenario_key': state.get('scenario_key') or '',
                        'student_level': level,
                        'student_profile_level': getattr(session.student, 'level', None),
                        'journey': {
                            'current_step': {
                                'index': current_step_index + 1,
                                'total_steps': len(steps) or 1,
                                'label': current_step.get('label') or '',
                                'prompt': current_step.get('prompt') or '',
                            },
                            'completed_steps': completed_steps[:6],
                            'remaining_steps': remaining_steps,
                        },
                        'avoid_repeating': previous_transcripts[:5],
                        'requirements': {
                            'max_words': 18,
                            'min_words': 5,
                            'single_sentence': True,
                            'language': 'English only',
                            'step_continuity': 'Keep the audio tightly connected to the current journey step.',
                        },
                    },
                    ensure_ascii=False,
                ),
            },
        ]
        response = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=messages,
            response_format={'type': 'json_schema', 'json_schema': AIStudyOpenAIService.listening_exercise_schema},
        )
        payload = json.loads(response.choices[0].message.content)
        transcript = clean_context_text(payload.get('transcript'), limit=280)
        alternatives = [
            clean_context_text(option, limit=280)
            for option in (payload.get('alternatives') or [])
            if clean_context_text(option, limit=280)
        ][:4]
        while len(alternatives) < 4:
            alternatives.append(transcript)
        correct_option_index = int(payload.get('correct_option_index') or 0)
        if transcript and transcript not in alternatives:
            correct_option_index = min(max(correct_option_index, 0), len(alternatives) - 1)
            alternatives[correct_option_index] = transcript
        correct_option_index = min(max(correct_option_index, 0), len(alternatives) - 1)
        return {
            'transcript': transcript,
            'instructions': clean_context_text(payload.get('instructions'), limit=220) or 'Ouca o audio e transcreva exatamente o que foi dito.',
            'alternatives': alternatives,
            'correct_option_index': correct_option_index,
            'focus_words': normalize_string_list(payload.get('focus_words'), limit=6),
        }

    @staticmethod
    def generate_chat_response(session, text):
        history = list(session.messages.order_by('created_at').values('role', 'text'))[-20:]
        context_text = AIStudyContextService.prompt_context(session)
        _, image_blocks = AIStudyContextService.selected_context_payload(session, include_images=True)
        messages = [
            {
                'role': 'system',
                'content': AIStudyContextService.tutor_system_prompt(session),
            },
            {
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': context_text},
                    *image_blocks,
                ],
            },
        ]
        for item in history:
            if item['text']:
                messages.append({'role': 'assistant' if item['role'] == 'assistant' else 'user', 'content': item['text']})
        messages.append({'role': 'user', 'content': text})
        response = client.chat.completions.create(model='gpt-4o', messages=messages)
        return response.choices[0].message.content or ''

    @staticmethod
    def fallback_session_title(session):
        lesson = AIStudyContextService.primary_lesson(session)
        lesson_title = clean_context_text(lesson.title if lesson else mode_display_name(session.mode), limit=48)
        first_user_message = session.messages.filter(role='user').order_by('created_at').values_list('text', flat=True).first() or ''
        snippet = ' '.join(clean_context_text(first_user_message, limit=80).split()[:5])
        if snippet:
            return clean_context_text(f"{lesson_title}: {snippet}", limit=70)
        if lesson_title:
            return clean_context_text(f"{lesson_title} Practice", limit=70)
        return 'AI Practice'

    @staticmethod
    def maybe_generate_session_title(session):
        if session.title_source == 'manual':
            return session.title
        user_count = session.messages.filter(role='user').count()
        if user_count == 0:
            return session.title or AIStudyOpenAIService.fallback_session_title(session)
        if user_count > 2 and session.title:
            return session.title

        lesson = AIStudyContextService.primary_lesson(session)
        user_messages = list(
            session.messages.filter(role='user').order_by('created_at').values_list('text', flat=True)[:3]
        )
        prompt = {
            'lesson_title': lesson.title if lesson else '',
            'student_level': session.student.level or 'A2',
            'recent_user_messages': [message for message in user_messages if message],
        }
        title = ''
        try:
            response = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {
                        'role': 'system',
                        'content': (
                            'Generate a short conversation title for an English-learning chat. '
                            'Return only the title, with 2 to 5 words, no quotes, no punctuation at the end.'
                        ),
                    },
                    {'role': 'user', 'content': json.dumps(prompt, ensure_ascii=False)},
                ],
            )
            title = clean_context_text(response.choices[0].message.content, limit=70).strip(' "\'')
        except Exception:
            title = ''

        if not title:
            title = AIStudyOpenAIService.fallback_session_title(session)

        session.title = title
        session.title_source = 'auto'
        session.updated_at = timezone.now()
        session.save(update_fields=['title', 'title_source', 'updated_at'])
        return title

    @staticmethod
    def generate_tts(text):
        response = client.audio.speech.create(
            model='gpt-4o-mini-tts',
            voice='alloy',
            input=text,
            response_format='mp3',
        )
        media_path = os.path.join(settings.MEDIA_ROOT, 'ai_study', 'tts')
        os.makedirs(media_path, exist_ok=True)
        filename = f"{uuid.uuid4().hex}.mp3"
        filepath = os.path.join(media_path, filename)
        response.stream_to_file(filepath)
        return media_url(f"ai_study/tts/{filename}")

    @staticmethod
    def generate_lesson_summary(lesson, payload):
        language = payload.get('language') or payload.get('idioma') or 'English'
        notes_html = payload.get('notes') or lesson.notes or ''
        notes_text = strip_tags(notes_html).replace('\xa0', ' ').strip()
        lesson_words = LessonSummaryWorkflowService._lesson_words(lesson)
        image_blocks, image_references = openai_image_blocks(lesson)
        homework_context = [
            {
                'title': item.title,
                'description': item.description,
                'status': item.status,
                'classification': item.classification,
                'teacher_feedback': item.teacher_feedback,
            }
            for item in lesson.homework_items.all()[:5]
        ]
        context = {
            'lesson': {
                'id': str(lesson.id),
                'title': lesson.title,
                'date': lesson.date.isoformat() if lesson.date else None,
                'level': lesson.level,
                'notes': notes_text,
                'notes_html': notes_html,
                'saved_context_summary': get_lesson_summary_text(lesson),
                'student_level': getattr(lesson.student, 'level', None),
            },
            'lesson_words': lesson_words,
            'visual_references': image_references,
            'homework_items': homework_context,
            'input': {
                'notes': notes_text,
                'words': payload.get('words', lesson_words),
                'mistakes': payload.get('mistakes', ''),
                'observations': payload.get('observations', ''),
                'homework': payload.get('homework', ''),
                'language': language,
                'student_level': payload.get('student_level') or getattr(lesson.student, 'level', None),
                'lesson_context': payload.get('lesson_context') or payload.get('context') or lesson.title,
            },
        }
        messages = [
            {
                'role': 'system',
                'content': (
                    'You are an assistant for a language school SaaS. Create a concise but information-dense '
                    'post-lesson context that will later be consumed by an AI tutor. Return only JSON. '
                    'Write the summary in Portuguese as a single ready-to-use context block, but do not copy the '
                    'teacher notes verbatim. Distill the lesson into the key concepts, visual cues, and teaching '
                    'decisions that matter for future AI support. Keep learned words, examples, corrections and homework in the lesson language when useful. '
                    'Do not use Markdown in JSON strings; the visible teacher summary is formatted separately as HTML. '
                    'When images are provided, infer the relevant classroom visual context and fold it into the '
                    'summary naturally without mentioning file names or URLs.'
                ),
            },
            {
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': json.dumps(context, ensure_ascii=False)},
                    *image_blocks,
                ],
            },
        ]
        response = client.chat.completions.create(
            model='gpt-4o',
            messages=messages,
            response_format={'type': 'json_schema', 'json_schema': AIStudyOpenAIService.lesson_summary_schema},
        )
        return json.loads(response.choices[0].message.content)


class LessonSummaryWorkflowService:
    @staticmethod
    def _clean_text(value):
        return clean_context_text(value)

    @staticmethod
    def _format_inline_html(value):
        text = escape(LessonSummaryWorkflowService._clean_text(value))
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        text = re.sub(r'__(.+?)__', r'<strong>\1</strong>', text)
        text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
        text = re.sub(r'_(.+?)_', r'<em>\1</em>', text)
        return text

    @staticmethod
    def _format_bullet_section(title, lines):
        cleaned = [
            LessonSummaryWorkflowService._clean_text(line)
            for line in lines
            if LessonSummaryWorkflowService._clean_text(line)
        ]
        if not cleaned:
            return ''
        items = ''.join(f"<li>{LessonSummaryWorkflowService._format_inline_html(line)}</li>" for line in cleaned)
        return f"<h2>{escape(title)}</h2><ul>{items}</ul>"

    @staticmethod
    def _format_word_section(words):
        items = []
        for item in words[:12]:
            word = LessonSummaryWorkflowService._clean_text(item.get('word'))
            meaning = LessonSummaryWorkflowService._clean_text(item.get('meaning'))
            if not word:
                continue
            content = f"<strong>{escape(word)}</strong>"
            if meaning:
                content = f"{content} ({LessonSummaryWorkflowService._format_inline_html(meaning)})"
            items.append(f"<li>{content}</li>")
        if not items:
            return ''
        return f"<h2>{escape('Palavras aprendidas')}</h2><ul>{''.join(items)}</ul>"

    @staticmethod
    def _format_text_section(title, value):
        cleaned = LessonSummaryWorkflowService._clean_text(value)
        if not cleaned:
            return ''

        lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
        heading = f"<h2>{escape(title)}</h2>"
        unordered_items = [
            re.sub(r'^[-*]\s+', '', line).strip()
            for line in lines
            if re.match(r'^[-*]\s+', line)
        ]
        ordered_items = [
            re.sub(r'^\d+[.)]\s+', '', line).strip()
            for line in lines
            if re.match(r'^\d+[.)]\s+', line)
        ]

        if unordered_items and len(unordered_items) == len(lines):
            items = ''.join(f"<li>{LessonSummaryWorkflowService._format_inline_html(item)}</li>" for item in unordered_items)
            return f"{heading}<ul>{items}</ul>"

        if ordered_items and len(ordered_items) == len(lines):
            items = ''.join(f"<li>{LessonSummaryWorkflowService._format_inline_html(item)}</li>" for item in ordered_items)
            return f"{heading}<ol>{items}</ol>"

        paragraphs = '<br />'.join(LessonSummaryWorkflowService._format_inline_html(line) for line in lines)
        return f"{heading}<p>{paragraphs}</p>"

    @staticmethod
    def _build_teacher_summary(words, image_names, observations='', homework='', next_topics=None):
        sections = []

        words_section = LessonSummaryWorkflowService._format_word_section(words)
        if words_section:
            sections.append(words_section)

        image_section = LessonSummaryWorkflowService._format_bullet_section('Referências anexadas', image_names[:6])
        if image_section:
            sections.append(image_section)

        topic_section = LessonSummaryWorkflowService._format_bullet_section('Próximos tópicos', (next_topics or [])[:6])
        if topic_section:
            sections.append(topic_section)

        observations_text = LessonSummaryWorkflowService._clean_text(observations)
        if observations_text:
            sections.append(LessonSummaryWorkflowService._format_text_section('Observações complementares', observations_text))

        homework_text = LessonSummaryWorkflowService._clean_text(homework)
        if homework_text:
            sections.append(LessonSummaryWorkflowService._format_text_section('Homework', homework_text))

        if not sections:
            return (
                "<p>As anotações acima já entram automaticamente no contexto da IA.</p>"
                "<p>Use este campo apenas para complementar com palavras aprendidas, referências anexadas e observações.</p>"
            )

        return ''.join(sections)

    @staticmethod
    def fallback_summary(lesson, payload):
        words = LessonSummaryWorkflowService._merge_words(
            LessonSummaryWorkflowService._lesson_words(lesson),
            LessonSummaryWorkflowService._normalize_words(payload.get('words', '')),
        )
        mistakes = LessonSummaryWorkflowService._normalize_mistakes(payload.get('mistakes', ''))
        flashcards = [{'front': item['word'], 'back': item['meaning']} for item in words]
        observations = payload.get('observations') or ''
        homework = payload.get('homework') or ''
        image_names = LessonSummaryWorkflowService._lesson_image_names(lesson)
        return {
            'summary': LessonSummaryWorkflowService._build_teacher_summary(
                words,
                image_names,
                observations=observations,
                homework=homework,
            ),
            'newWords': words,
            'mistakesCorrected': mistakes,
            'homework': homework,
            'nextTopics': [topic.strip() for topic in observations.splitlines() if topic.strip()][:5],
            'flashcards': flashcards,
        }

    @staticmethod
    def _lesson_words(lesson):
        return [
            {'word': word.word, 'meaning': word.meaning}
            for word in lesson.new_words.all()
            if word.word
        ]

    @staticmethod
    def _lesson_image_names(lesson):
        return [reference['name'] for reference in lesson_image_references(lesson, limit=6)]

    @staticmethod
    def _normalize_words(value):
        if isinstance(value, list):
            items = value
        else:
            items = [line.strip() for line in str(value or '').replace(';', '\n').splitlines() if line.strip()]
        normalized = []
        for item in items:
            if isinstance(item, dict):
                word = item.get('word') or item.get('front') or ''
                meaning = item.get('meaning') or item.get('back') or ''
            else:
                parts = str(item).split('-', 1)
                word = parts[0].strip()
                meaning = parts[1].strip() if len(parts) > 1 else ''
            if word:
                normalized.append({'word': word, 'meaning': meaning})
        return normalized

    @staticmethod
    def _merge_words(*collections):
        merged = []
        seen = set()
        for collection in collections:
            for item in collection or []:
                word = (item.get('word') or '').strip()
                meaning = (item.get('meaning') or '').strip()
                if not word:
                    continue
                key = word.lower()
                if key in seen:
                    for existing in merged:
                        if existing['word'].lower() == key and not existing['meaning'] and meaning:
                            existing['meaning'] = meaning
                    continue
                merged.append({'word': word, 'meaning': meaning})
                seen.add(key)
        return merged

    @staticmethod
    def _normalize_mistakes(value):
        if isinstance(value, list):
            items = value
        else:
            items = [line.strip() for line in str(value or '').replace(';', '\n').splitlines() if line.strip()]
        normalized = []
        for item in items:
            if isinstance(item, dict):
                mistake = item.get('mistake') or ''
                correction = item.get('correction') or ''
            else:
                parts = str(item).split('->', 1)
                mistake = parts[0].strip()
                correction = parts[1].strip() if len(parts) > 1 else ''
            if mistake:
                normalized.append({'mistake': mistake, 'correction': correction})
        return normalized

    @staticmethod
    def _normalize_flashcards(value):
        if isinstance(value, list):
            items = value
        else:
            items = []
        normalized = []
        for item in items:
            front = (item.get('front') or item.get('word') or '').strip()
            back = (item.get('back') or item.get('meaning') or '').strip()
            if front and back:
                normalized.append({'front': front, 'back': back})
        return normalized

    @staticmethod
    @transaction.atomic
    def create_or_update_from_ai(lesson, teacher, payload):
        if not lesson.student:
            raise ValueError('A aula precisa estar vinculada a um aluno.')
        if not lesson.teacher:
            raise ValueError('A aula precisa estar vinculada a um professor.')

        try:
            ai_data = AIStudyOpenAIService.generate_lesson_summary(lesson, payload)
        except Exception:
            ai_data = LessonSummaryWorkflowService.fallback_summary(lesson, payload)

        fallback_data = LessonSummaryWorkflowService.fallback_summary(lesson, payload)
        normalized_words = LessonSummaryWorkflowService._merge_words(
            LessonSummaryWorkflowService._lesson_words(lesson),
            LessonSummaryWorkflowService._normalize_words(payload.get('words', '')),
            LessonSummaryWorkflowService._normalize_words(ai_data.get('newWords', [])),
        )
        normalized_mistakes = LessonSummaryWorkflowService._normalize_mistakes(
            ai_data.get('mistakesCorrected') or payload.get('mistakes', '')
        )
        normalized_topics = [
            topic.strip()
            for topic in (ai_data.get('nextTopics') or fallback_data.get('nextTopics') or [])
            if str(topic).strip()
        ]
        normalized_flashcards = LessonSummaryWorkflowService._normalize_flashcards(ai_data.get('flashcards'))
        if not normalized_flashcards:
            normalized_flashcards = [{'front': item['word'], 'back': item['meaning']} for item in normalized_words if item.get('meaning')]
        teacher_summary_text = LessonSummaryWorkflowService._build_teacher_summary(
            normalized_words,
            LessonSummaryWorkflowService._lesson_image_names(lesson),
            observations=payload.get('observations', ''),
            homework=ai_data.get('homework', '') or fallback_data.get('homework', ''),
            next_topics=normalized_topics,
        )

        summary, _ = LessonSummary.objects.update_or_create(
            lesson=lesson,
            defaults={
                'student': lesson.student,
                'teacher': lesson.teacher or teacher,
                'summary': teacher_summary_text,
                'homework': ai_data.get('homework', '') or fallback_data.get('homework', ''),
                'observations': payload.get('observations', ''),
                'raw_ai_response': ai_data,
            },
        )
        summary.words.all().delete()
        summary.mistakes.all().delete()
        summary.next_topics.all().delete()

        LessonSummaryWord.objects.bulk_create([
            LessonSummaryWord(
                lesson_summary=summary,
                word=item.get('word', ''),
                meaning=item.get('meaning', ''),
            )
            for item in normalized_words
            if item.get('word')
        ])
        LessonSummaryMistake.objects.bulk_create([
            LessonSummaryMistake(
                lesson_summary=summary,
                mistake=item.get('mistake', ''),
                correction=item.get('correction', ''),
            )
            for item in normalized_mistakes
            if item.get('mistake')
        ])
        LessonSummaryNextTopic.objects.bulk_create([
            LessonSummaryNextTopic(lesson_summary=summary, topic=topic)
            for topic in normalized_topics
            if topic
        ])

        category, _ = VocabularyCategory.objects.get_or_create(
            owner=None,
            slug='vocabulary',
            defaults={'name': 'Vocabulary', 'is_default': True},
        )
        for card in normalized_flashcards:
            front = (card.get('front') or '').strip()
            back = (card.get('back') or '').strip()
            if not front or not back:
                continue
            existing = VocabularyCard.objects.filter(
                student=lesson.student,
                lesson=lesson,
                source_type='lesson',
                word=front,
            ).first()
            if existing:
                continue
            VocabularyCard.objects.create(
                student=lesson.student,
                lesson=lesson,
                source_type='lesson',
                word=front,
                teacher=lesson.teacher or teacher,
                translation=back,
                category=category,
                tags=['Resumo da aula', lesson.title],
                difficulty_level='new',
                next_review_at=timezone.now(),
            )
        return summary


class AIStudyWorkflowService:
    GUIDED_MODES = {'speaking', 'writing', 'listening'}

    @staticmethod
    def default_title_for_mode(mode):
        return {
            'review': 'Lesson Review',
            'speaking': 'Speaking Guiado',
            'listening': 'Interprete IA',
            'writing': 'Writing Guiado',
        }.get(mode, 'AI Practice')

    @staticmethod
    def is_guided_mode(session_or_mode):
        mode = session_or_mode.mode if hasattr(session_or_mode, 'mode') else session_or_mode
        return mode in AIStudyWorkflowService.GUIDED_MODES

    @staticmethod
    def ensure_guided_state(session, persist=False):
        if not AIStudyWorkflowService.is_guided_mode(session):
            return {}
        has_existing_activity = (
            not session.guided_state and (
                session.messages.exists()
                or session.speaking_feedbacks.exists()
                or session.writing_feedbacks.exists()
            )
        )
        state = normalize_guided_state(
            session.mode,
            session.guided_state,
            suggested_level=getattr(session.student, 'level', 'A2') or 'A2',
            migrate_to_active=has_existing_activity,
        )
        if persist and state != (session.guided_state or {}):
            AIStudyWorkflowService.persist_guided_state(session, state)
        return state

    @staticmethod
    def persist_guided_state(session, state, *, title=None, status=None, touch=False):
        now = timezone.now()
        session.guided_state = state
        session.updated_at = now
        update_fields = ['guided_state', 'updated_at']
        if touch:
            session.last_interaction_at = now
            update_fields.append('last_interaction_at')
        if title and session.title_source != 'manual':
            session.title = clean_context_text(title, limit=255)
            session.title_source = 'auto'
            update_fields.extend(['title', 'title_source'])
        if status and session.status != status:
            session.status = status
            update_fields.append('status')
        session.save(update_fields=list(dict.fromkeys(update_fields)))
        return session

    @staticmethod
    def _assistant_message(session, text, metadata=None, *, content_type='text', feedback=None, writing_feedback=None):
        return AIConversationMessage.objects.create(
            session=session,
            role='assistant',
            content_type=content_type,
            text=text,
            feedback=feedback,
            writing_feedback=writing_feedback,
            metadata=metadata or {},
        )

    @staticmethod
    def _listening_journey(state):
        journey = normalize_listening_journey(state.get('listening_journey'))
        state['listening_journey'] = journey
        return journey

    @staticmethod
    def _listening_step_snapshot(state):
        journey = AIStudyWorkflowService._listening_journey(state)
        steps = journey.get('steps') or []
        if not steps:
            fallback_prompt = scenario_task_for_mode(
                'listening',
                state.get('scenario_key'),
                state.get('scenario_label') or 'Conversacao livre',
            )
            fallback_step = {
                'id': 'current_step',
                'label': state.get('scenario_label') or 'Etapa atual',
                'prompt': fallback_prompt,
            }
            return journey, fallback_step, 1, 1
        index = max(0, min(int(journey.get('current_step_index') or 0), len(steps) - 1))
        journey['current_step_index'] = index
        return journey, steps[index], index + 1, len(steps)

    @staticmethod
    def _listening_progress_text(state):
        journey, step, step_index, step_total = AIStudyWorkflowService._listening_step_snapshot(state)
        if not journey.get('steps'):
            return step.get('label') or 'Listening em andamento.'
        return f"Etapa {step_index} de {step_total}: {step.get('label') or 'Etapa atual'}."

    @staticmethod
    def prepare_listening_session(session, scenario_key, scenario_label, level):
        state = normalize_guided_state(
            'listening',
            session.guided_state,
            suggested_level=level or getattr(session.student, 'level', 'A2') or 'A2',
        )
        state['enabled'] = True
        state['stage'] = 'active'
        state['scenario_key'] = clean_context_text(scenario_key or 'custom', limit=120) or 'custom'
        state['scenario_label'] = clean_context_text(scenario_label, limit=120)
        state['level'] = normalize_level_choice(level or getattr(session.student, 'level', 'A2') or 'A2')
        state['level_source'] = 'selected'
        state['objective'] = default_session_objective('listening', state['scenario_label'], state['level'])
        state['difficulty'] = 'guided'
        state['listening_journey'] = normalize_listening_journey({
            'steps': build_listening_journey(state['scenario_key'], state['scenario_label']),
            'current_step_index': 0,
            'completed_step_ids': [],
            'current_step_status': 'active',
        })
        _, current_step, step_index, step_total = AIStudyWorkflowService._listening_step_snapshot(state)
        state['current_task'] = clean_context_text(current_step.get('prompt'), limit=320) or scenario_task_for_mode(
            'listening',
            state['scenario_key'],
            state['scenario_label'],
        )
        state['expected_input'] = 'text_submission'
        state['input_placeholder'] = placeholder_for_expected_input('listening', state['expected_input'], state['current_task'])
        state['last_activity_type'] = 'listening_setup'
        state['session_status'] = 'active'
        state['preserve_level_on_scenario_change'] = False
        state['listening_round'] = int(state.get('listening_round') or 0)
        state['progress_summary'] = f"Jornada iniciada. Etapa {step_index} de {step_total}: {current_step.get('label') or state['scenario_label']}."
        state['recommended_next_step'] = 'continue'
        state['summary_items'] = AIStudyWorkflowService._build_summary_items(state)
        AIStudyWorkflowService.persist_guided_state(
            session,
            state,
            title=guided_session_title('listening', state['scenario_label']),
            touch=True,
        )
        return state

    @staticmethod
    def _listening_options(exercise):
        raw_options = exercise.get('alternatives') if isinstance(exercise, dict) else []
        options = []
        for index, option in enumerate(raw_options or []):
            text = clean_context_text(option, limit=280)
            if not text:
                continue
            options.append({
                'id': f'option-{index + 1}',
                'text': text,
            })
        if not options:
            transcript = clean_context_text((exercise or {}).get('transcript'), limit=280)
            options = [{'id': 'option-1', 'text': transcript}] if transcript else []
        correct_index = int((exercise or {}).get('correct_option_index') or 0)
        correct_index = min(max(correct_index, 0), len(options) - 1) if options else 0
        correct_option_id = options[correct_index]['id'] if options else ''
        return options, correct_option_id

    @staticmethod
    def _listening_metadata(session, state, exercise, audio_url, challenge_id, round_number):
        options, correct_option_id = AIStudyWorkflowService._listening_options(exercise)
        journey, current_step, step_index, step_total = AIStudyWorkflowService._listening_step_snapshot(state)
        return {
            'supports_streaming': False,
            'mode': session.mode,
            'interpreter': True,
            'interpreter_exercise': {
                'id': challenge_id,
                'round': round_number,
                'scenario_key': state.get('scenario_key') or '',
                'scenario_label': state.get('scenario_label') or '',
                'level': state.get('level') or '',
                'instructions': clean_context_text(exercise.get('instructions'), limit=220) or state.get('current_task') or '',
                'tts_audio_url': audio_url,
                'options': options,
                'correct_option_id': correct_option_id,
                'focus_words': normalize_string_list(exercise.get('focus_words'), limit=6),
                'step_id': current_step.get('id') or '',
                'step_title': current_step.get('label') or '',
                'step_prompt': current_step.get('prompt') or '',
                'step_index': step_index,
                'step_total': step_total,
                'is_final_step': bool(step_total and step_index >= step_total),
                'tts_unavailable': not bool(audio_url),
                'journey_steps': [
                    {
                        'id': step.get('id') or '',
                        'label': step.get('label') or '',
                    }
                    for step in journey.get('steps') or []
                ],
                'response_mode_choices': [
                    {'id': 'multiple_choice', 'label': 'Com alternativas'},
                    {'id': 'transcription', 'label': 'Escrever sozinho'},
                ],
            },
        }

    @staticmethod
    def create_listening_challenge(session):
        state = AIStudyWorkflowService.ensure_guided_state(session, persist=True)
        if session.mode != 'listening':
            raise ValueError('Listening challenge is only available for listening sessions.')
        journey = AIStudyWorkflowService._listening_journey(state)
        if journey.get('steps') and len(journey.get('completed_step_ids') or []) >= len(journey.get('steps') or []):
            raise ValueError('Essa jornada de listening ja foi concluida.')
        _, current_step, step_index, step_total = AIStudyWorkflowService._listening_step_snapshot(state)
        transcript_fallback = clean_context_text(
            f"I am now at the {current_step.get('label') or 'current'} stage of this {state.get('scenario_label') or 'daily life'} situation.",
            limit=280,
        )
        try:
            exercise = AIStudyOpenAIService.generate_listening_exercise(session, state)
        except Exception:
            exercise = {
                'transcript': transcript_fallback,
                'instructions': state.get('current_task') or 'Ouca o audio e transcreva o que ouvir.',
                'alternatives': [
                    transcript_fallback,
                    'I am at this stage of the trip right now.',
                    'I was at this stage of the trip just now.',
                    'I am studying English in this part of the trip.',
                ],
                'correct_option_index': 0,
                'focus_words': ['stage', 'trip'],
            }
        transcript = clean_context_text(exercise.get('transcript'), limit=280) or transcript_fallback
        audio_url = None
        tts_unavailable = False
        try:
            audio_url = AIStudyOpenAIService.generate_tts(transcript)
        except Exception:
            tts_unavailable = True
        round_number = int(state.get('listening_round') or 0) + 1
        metadata = AIStudyWorkflowService._listening_metadata(
            session,
            state,
            {**exercise, 'transcript': transcript},
            audio_url,
            uuid.uuid4().hex,
            round_number,
        )
        state['stage'] = 'active'
        state['session_status'] = 'active'
        journey['current_step_status'] = 'active'
        state['listening_journey'] = journey
        state['current_task'] = metadata['interpreter_exercise']['instructions'] or scenario_task_for_mode(
            'listening',
            state.get('scenario_key'),
            state.get('scenario_label') or 'Conversacao livre',
        )
        state['expected_input'] = 'text_submission'
        state['input_placeholder'] = placeholder_for_expected_input('listening', state['expected_input'], state['current_task'])
        state['last_activity_type'] = 'listening_challenge'
        state['progress_summary'] = (
            f"Audio {round_number} pronto. Etapa {step_index} de {step_total}: {current_step.get('label') or state.get('scenario_label')}."
            if not tts_unavailable
            else f"Etapa {step_index} de {step_total} preparada, mas o audio nao foi gerado agora."
        )
        state['recommended_next_step'] = 'continue'
        state['listening_round'] = round_number
        state['summary_items'] = AIStudyWorkflowService._build_summary_items(state)
        AIStudyWorkflowService.persist_guided_state(
            session,
            state,
            title=guided_session_title('listening', state.get('scenario_label')),
            touch=True,
        )
        return AIStudyWorkflowService._assistant_message(session, transcript, metadata)

    @staticmethod
    def handle_listening_answer(session, message_id, response_mode, selected_option_id='', answer_text=''):
        state = AIStudyWorkflowService.ensure_guided_state(session, persist=True)
        if session.mode != 'listening':
            raise ValueError('Listening answers are only available for listening sessions.')
        challenge_message = session.messages.filter(id=message_id, role='assistant').first()
        if not challenge_message:
            raise ValueError('Listening challenge not found.')
        metadata = challenge_message.metadata if isinstance(challenge_message.metadata, dict) else {}
        exercise = metadata.get('interpreter_exercise') if isinstance(metadata.get('interpreter_exercise'), dict) else {}
        options = exercise.get('options') if isinstance(exercise.get('options'), list) else []
        expected_text = clean_context_text(challenge_message.text or exercise.get('transcript'), limit=280)
        correct_option_id = clean_context_text(exercise.get('correct_option_id'), limit=80)

        submitted_text = clean_context_text(answer_text, limit=500)
        if response_mode == 'multiple_choice':
            selected_option = next((option for option in options if option.get('id') == selected_option_id), None)
            if not selected_option:
                raise ValueError('Listening option not found.')
            submitted_text = clean_context_text(selected_option.get('text'), limit=500)

        ratio = similarity_ratio(submitted_text, expected_text)
        is_correct = (
            selected_option_id == correct_option_id
            if response_mode == 'multiple_choice'
            else ratio >= 0.92
        )
        status = 'correct' if is_correct else 'close' if ratio >= 0.75 else 'incorrect'
        percent = int(round(ratio * 100))
        if status == 'correct':
            feedback_text = 'Boa! Sua transcricao corresponde ao audio.'
        elif status == 'close':
            feedback_text = f'Quase la. Sua transcricao ficou {percent}% proxima do audio.'
        else:
            feedback_text = 'Ainda nao foi dessa vez. Revele a resposta para conferir o texto e tente novamente se quiser.'
        journey, current_step, step_index, step_total = AIStudyWorkflowService._listening_step_snapshot(state)
        current_step_label = current_step.get('label') or state.get('scenario_label') or 'Etapa atual'

        user_message = AIStudyWorkflowService._create_user_message(
            session,
            submitted_text,
            extra_metadata={
                'interpreter': True,
                'interpreter_response_mode': response_mode,
                'challenge_message_id': str(challenge_message.id),
            },
        )
        assistant_message = AIStudyWorkflowService._assistant_message(
            session,
            feedback_text,
            {
                'supports_streaming': False,
                'mode': session.mode,
                'interpreter': True,
                'interpreter_feedback': {
                    'challenge_message_id': str(challenge_message.id),
                    'response_mode': response_mode,
                    'selected_option_id': selected_option_id,
                    'status': status,
                    'is_correct': is_correct,
                    'similarity_score': percent,
                },
            },
        )
        focus_words = normalize_string_list(exercise.get('focus_words'), limit=6)
        follow_up_message = None
        if status == 'correct':
            state['learned_words'] = unique_items((state.get('learned_words') or []) + focus_words, limit=18)
            completed_step_ids = unique_items((journey.get('completed_step_ids') or []) + [current_step.get('id')], limit=max(step_total, 1))
            journey['completed_step_ids'] = completed_step_ids
            state['completed_activities'] = unique_items(
                (state.get('completed_activities') or []) + [f"listening: {current_step_label.lower()}"],
                limit=18,
            )
            if step_index < step_total:
                next_step = (journey.get('steps') or [])[step_index]
                journey['current_step_index'] = step_index
                journey['current_step_status'] = 'active'
                state['listening_journey'] = journey
                state['progress_summary'] = (
                    f"Etapa {step_index} de {step_total} concluida: {current_step_label}. "
                    f"Proxima etapa: {next_step.get('label') or 'Continuar a jornada'}."
                )
                state['current_task'] = clean_context_text(next_step.get('prompt'), limit=320) or scenario_task_for_mode(
                    'listening',
                    state.get('scenario_key'),
                    state.get('scenario_label') or 'Conversacao livre',
                )
                state['expected_input'] = 'text_submission'
                state['input_placeholder'] = placeholder_for_expected_input('listening', state['expected_input'], state['current_task'])
                state['recommended_next_step'] = 'continue'
                state['last_activity_type'] = 'listening_answer'
                state['summary_items'] = AIStudyWorkflowService._build_summary_items(state)
                AIStudyWorkflowService.persist_guided_state(
                    session,
                    state,
                    title=guided_session_title('listening', state.get('scenario_label')),
                    touch=True,
                )
                follow_up_message = AIStudyWorkflowService.create_listening_challenge(session)
            else:
                journey['current_step_status'] = 'completed'
                state['listening_journey'] = journey
                state['stage'] = 'summary'
                state['session_status'] = 'completed'
                state['completed_activities'] = unique_items(
                    (state.get('completed_activities') or []) + ['jornada listening concluida'],
                    limit=18,
                )
                state['progress_summary'] = (
                    f"Jornada concluida. Voce finalizou a etapa {step_index} de {step_total}: {current_step_label}."
                )
                state['current_task'] = ''
                state['expected_input'] = 'choice'
                state['input_placeholder'] = 'Jornada concluida. Inicie um novo treino quando quiser.'
                state['recommended_next_step'] = 'completed'
                state['last_activity_type'] = 'listening_answer'
                state['summary_items'] = AIStudyWorkflowService._build_summary_items(
                    state,
                    extra_items=[f"concluiu a jornada completa de {state.get('scenario_label') or 'listening'}"],
                )
                AIStudyWorkflowService.persist_guided_state(
                    session,
                    state,
                    title=guided_session_title('listening', state.get('scenario_label')),
                    status='completed',
                    touch=True,
                )
                follow_up_message = AIStudyWorkflowService._assistant_message(
                    session,
                    (
                        f"Excelente. Voce concluiu a jornada de {state.get('scenario_label') or 'listening'} "
                        f"e passou por {step_total} etapas, de {current_step_label.lower()} ate o final da situacao."
                    ),
                    {
                        'supports_streaming': False,
                        'mode': session.mode,
                        'interpreter': True,
                        'interpreter_journey_completed': True,
                    },
                )
        else:
            journey['current_step_status'] = 'retry'
            state['listening_journey'] = journey
            state['progress_summary'] = (
                f"Continue na etapa {step_index} de {step_total}: {current_step_label}. "
                f"Revise o audio e tente novamente."
            )
            state['current_task'] = clean_context_text(current_step.get('prompt'), limit=320) or state.get('current_task') or scenario_task_for_mode(
                'listening',
                state.get('scenario_key'),
                state.get('scenario_label') or 'Conversacao livre',
            )
            state['expected_input'] = 'text_submission'
            state['input_placeholder'] = placeholder_for_expected_input('listening', state['expected_input'], state['current_task'])
            state['recommended_next_step'] = 'retry'
            state['completed_activities'] = unique_items(
                (state.get('completed_activities') or []) + ['transcricao listening'],
                limit=18,
            )
        state['last_activity_type'] = 'listening_answer'
        state['summary_items'] = AIStudyWorkflowService._build_summary_items(state)
        if status != 'correct':
            AIStudyWorkflowService.persist_guided_state(
                session,
                state,
                title=guided_session_title('listening', state.get('scenario_label')),
                touch=True,
            )
        return user_message, assistant_message, follow_up_message

    @staticmethod
    def _append_next_step_prompt(text, recommended_label='Continuar'):
        cleaned = str(text or '').strip()
        return cleaned or f"Vamos seguir com: {recommended_label}."

    @staticmethod
    def _text_language_hints(text):
        tokens = re.findall(r"[A-Za-zÀ-ÿ']+", str(text or '').lower())
        english_markers = {
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her',
            'am', 'is', 'are', 'was', 'were', 'have', 'has', 'had', 'do', 'did', 'go',
            'went', 'like', 'want', 'need', 'can', 'could', 'would', 'will', 'the', 'a',
            'an', 'to', 'for', 'with', 'in', 'on', 'at', 'from', 'because', 'but', 'so',
            'hello', 'hi', 'good', 'morning', 'afternoon', 'evening', 'please', 'today',
            'tomorrow', 'yesterday',
        }
        portuguese_markers = {
            'eu', 'voce', 'voces', 'ele', 'ela', 'nos', 'meu', 'minha', 'seu', 'sua',
            'quero', 'preciso', 'pode', 'poderia', 'me', 'um', 'uma', 'de', 'do', 'da',
            'para', 'com', 'por', 'em', 'no', 'na', 'que', 'como', 'texto', 'assunto',
            'ajuda', 'gramatica', 'vocabulario', 'explica', 'explique', 'escreva',
            'escrever', 'sobre', 'favor', 'hoje', 'amanha', 'ontem',
        }
        english_hits = sum(1 for token in tokens if token in english_markers)
        portuguese_hits = sum(1 for token in tokens if token in portuguese_markers)
        return tokens, english_hits, portuguese_hits

    @staticmethod
    def _looks_like_tutor_request(text):
        cleaned = ' '.join(str(text or '').split())
        if not cleaned:
            return False
        lowered = cleaned.lower()
        request_prefixes = (
            'quero ', 'me de ', 'me dê ', 'me manda ', 'me envie ', 'pode ',
            'poderia ', 'preciso ', 'escreva ', 'explique ', 'crie ', 'gere ',
            'i want ', 'can you ', 'could you ', 'please ', 'write ', 'show me ',
            'give me ', 'help me ',
        )
        request_fragments = (
            'texto sobre', 'sample text', 'model answer', 'example text',
            'help me', 'explique', 'explain', 'grammar', 'vocabulary',
            'gramatica', 'vocabulario', 'topic', 'assunto',
        )
        if any(lowered.startswith(prefix) for prefix in request_prefixes):
            return True
        if any(fragment in lowered for fragment in request_fragments):
            return True
        if (cleaned.endswith('?') or cleaned.endswith('!')) and len(cleaned.split()) <= 14:
            return True
        tokens, english_hits, portuguese_hits = AIStudyWorkflowService._text_language_hints(cleaned)
        return portuguese_hits > english_hits and len(tokens) <= 18

    @staticmethod
    def _looks_like_writing_sample(text):
        cleaned = ' '.join(str(text or '').split())
        if not cleaned or AIStudyWorkflowService._looks_like_tutor_request(cleaned):
            return False
        tokens, english_hits, portuguese_hits = AIStudyWorkflowService._text_language_hints(cleaned)
        if len(tokens) < 2:
            return False
        if portuguese_hits > english_hits and english_hits == 0:
            return False
        if english_hits > 0:
            return True
        return len(tokens) >= 5 and not cleaned.endswith('?')

    @staticmethod
    def _looks_like_json_payload(text):
        cleaned = str(text or '').strip()
        if not cleaned or cleaned[0] not in '{[':
            return False
        try:
            parsed = json.loads(cleaned)
        except (TypeError, ValueError, json.JSONDecodeError):
            return False
        return isinstance(parsed, (dict, list))

    @staticmethod
    def _writing_tip_text(analysis):
        tips = normalize_string_list(analysis.get('improvement_tips'), limit=2)
        if tips:
            return tips[0]
        errors = normalize_dict_list(analysis.get('error_explanations'), limit=1)
        if errors:
            return clean_context_text(errors[0].get('explanation'), limit=280)
        grammar_points = normalize_string_list(analysis.get('grammar_breakdown'), limit=1)
        if grammar_points:
            return grammar_points[0]
        return clean_context_text(analysis.get('level_progress_feedback'), limit=280)

    @staticmethod
    def _build_writing_assistant_response(analysis, original_text=''):
        assistant_text = clean_context_text(analysis.get('assistant_response'), limit=1800)
        if AIStudyWorkflowService._looks_like_json_payload(assistant_text):
            assistant_text = ''

        corrected_text = clean_context_text(analysis.get('corrected_text'), limit=1600)
        original_text = clean_context_text(original_text, limit=1600)
        general_feedback = clean_context_text(analysis.get('general_feedback'), limit=360)
        tip_text = AIStudyWorkflowService._writing_tip_text(analysis)

        parts = []
        if assistant_text:
            parts.append(assistant_text)
        if corrected_text and corrected_text != original_text and corrected_text not in '\n\n'.join(parts):
            parts.append(f"Versao sugerida:\n{corrected_text}")
        if general_feedback and general_feedback not in '\n\n'.join(parts):
            parts.append(general_feedback)
        if tip_text and tip_text not in '\n\n'.join(parts):
            parts.append(f"Dica rapida: {tip_text}")
        if not parts:
            fallback_text = "Revisei seu texto e preparei uma sugestao mais clara para voce continuar."
            parts.append(fallback_text)
            if corrected_text:
                parts.append(f"Versao sugerida:\n{corrected_text}")
        return clean_context_text('\n\n'.join(parts), limit=2200)

    @staticmethod
    def _build_summary_items(state, extra_items=None):
        items = list(state.get('summary_items') or [])
        scenario_label = state.get('scenario_label')
        learned_words = state.get('learned_words') or []
        recurring_errors = state.get('recurring_errors') or []
        completed_activities = state.get('completed_activities') or []
        journey = normalize_listening_journey(state.get('listening_journey'))
        steps = journey.get('steps') or []
        completed_step_ids = journey.get('completed_step_ids') or []

        if scenario_label:
            items.append(f"praticou o cenario {scenario_label}")
        if steps:
            current_index = max(0, min(int(journey.get('current_step_index') or 0), len(steps) - 1))
            current_step = steps[current_index]
            items.append(
                f"progrediu {len(completed_step_ids)} de {len(steps)} etapas em {scenario_label}"
            )
            if state.get('session_status') != 'completed':
                items.append(f"esta em {current_step.get('label') or 'uma nova etapa'}")
        if learned_words:
            items.append(f"aprendeu palavras como {', '.join(learned_words[:4])}")
        if recurring_errors:
            items.append(f"corrigiu pontos como {', '.join(recurring_errors[:3])}")
        if completed_activities:
            items.append(f"concluiu {len(completed_activities)} atividades guiadas")
        for item in extra_items or []:
            items.append(item)
        return unique_items(items, limit=6)

    @staticmethod
    def _summary_response(session, state, intro_text=''):
        summary_items = AIStudyWorkflowService._build_summary_items(state)
        state['stage'] = 'summary'
        state['session_status'] = 'summary'
        state['summary_items'] = summary_items
        state['current_task'] = ''
        state['expected_input'] = 'choice'
        state['input_placeholder'] = 'Escolha se quer continuar, revisar, mudar de cenario ou encerrar.'
        text = summary_message_text(summary_items)
        if intro_text:
            text = f"{intro_text}\n\n{text}"
        metadata = build_guided_metadata(
            stage='summary',
            choices=SUMMARY_ACTIONS,
            layout='chips',
            helper_text='Voce pode continuar estudando, revisar o que aprendeu ou encerrar por aqui.',
            expected_input='choice',
            input_placeholder=state['input_placeholder'],
            summary_items=summary_items,
        )
        AIStudyWorkflowService.persist_guided_state(session, state, touch=True)
        return AIStudyWorkflowService._assistant_message(session, text, {**metadata, 'supports_streaming': True, 'mode': session.mode})

    @staticmethod
    def _activate_guided_state(session, state, *, level=None, level_source='', scenario_key='', scenario_label='', progress_summary=''):
        if level:
            state['level'] = normalize_level_choice(level)
        if level_source:
            state['level_source'] = level_source
        if scenario_key:
            state['scenario_key'] = scenario_key
        if scenario_label:
            state['scenario_label'] = scenario_label
        active_level = state.get('level') or state.get('default_level_hint') or 'A2'
        state['stage'] = 'active'
        state['objective'] = default_session_objective(session.mode, state.get('scenario_label') or 'Conversacao livre', active_level)
        state['difficulty'] = state.get('difficulty') or 'guided'
        state['current_task'] = scenario_task_for_mode(session.mode, state.get('scenario_key'), state.get('scenario_label') or 'Conversacao livre')
        state['expected_input'] = 'audio_or_text' if session.mode == 'speaking' else 'text_submission'
        state['input_placeholder'] = placeholder_for_expected_input(session.mode, state['expected_input'], state['current_task'])
        state['last_activity_type'] = 'kickoff'
        state['session_status'] = 'active'
        state['preserve_level_on_scenario_change'] = False
        if progress_summary:
            state['progress_summary'] = progress_summary
        AIStudyWorkflowService.persist_guided_state(
            session,
            state,
            title=guided_session_title(session.mode, state.get('scenario_label')),
            touch=True,
        )
        return state

    @staticmethod
    def _user_message_text(text, guided_action):
        if text:
            return text.strip()
        if isinstance(guided_action, dict):
            return ' '.join(str(guided_action.get('label') or guided_action.get('value') or '').split())
        return ''

    @staticmethod
    def _create_user_message(session, text, guided_action=None, extra_metadata=None):
        metadata = extra_metadata.copy() if isinstance(extra_metadata, dict) else {}
        if guided_action:
            metadata['guided_action'] = guided_action
        return AIConversationMessage.objects.create(
            session=session,
            role='user',
            content_type='text',
            text=text,
            metadata=metadata,
        )

    @staticmethod
    def _build_follow_up_metadata(session, state, choices, helper_text=''):
        return build_guided_metadata(
            stage=state.get('stage') or 'active',
            choices=choices,
            layout='chips',
            helper_text=helper_text or state.get('progress_summary') or 'Escolha o proximo passo ou continue respondendo em ingles.',
            expected_input=state.get('expected_input') or ('audio_or_text' if session.mode == 'speaking' else 'text_submission'),
            current_task=state.get('current_task') or '',
            input_placeholder=state.get('input_placeholder') or placeholder_for_expected_input(
                session.mode,
                state.get('expected_input') or ('audio_or_text' if session.mode == 'speaking' else 'text_submission'),
                state.get('current_task') or '',
            ),
            summary_items=state.get('summary_items') or [],
            recommended_choice_id=(choices[0]['id'] if choices else ''),
        )

    @staticmethod
    def initial_message_payload(session, lesson=None):
        lesson = lesson or AIStudyContextService.primary_lesson(session)
        if session.mode == 'review' and lesson:
            text = f"Aula atual: {lesson.title}. Vou usar esta aula como contexto principal. O que você quer revisar agora?"
            metadata = {'initial': True, 'supports_streaming': True, 'mode': session.mode}
        elif AIStudyWorkflowService.is_guided_mode(session):
            state = AIStudyWorkflowService.ensure_guided_state(session)
            session.guided_state = state
            session.save(update_fields=['guided_state'])
            text, guided_metadata = scenario_prompt_message()
            metadata = {
                'initial': True,
                'supports_streaming': True,
                'mode': session.mode,
                **guided_metadata,
            }
        else:
            text = 'Sua sessão de prática com IA está pronta.'
            metadata = {'initial': True, 'supports_streaming': True, 'mode': session.mode}
        return {
            'session': session,
            'role': 'assistant',
            'content_type': 'text',
            'text': text,
            'metadata': metadata,
        }

    @staticmethod
    def _handle_guided_onboarding(session, state, text, guided_action):
        action_value = str(guided_action.get('value') or '').strip() if guided_action else ''
        action_type = str(guided_action.get('action_type') or '').strip() if guided_action else ''
        assistant_text = ''
        assistant_metadata = {}
        if state.get('stage') == 'choose_scenario':
            if action_type == 'scenario' and action_value == 'custom':
                state['stage'] = 'await_custom_scenario'
                assistant_text, assistant_metadata = custom_scenario_prompt_message()
            else:
                scenario_option = find_scenario_option(action_value)
                scenario_label = scenario_option['label'] if scenario_option else clean_context_text(text, limit=120)
                scenario_key = scenario_option['value'] if scenario_option else 'custom'
                if not scenario_label:
                    assistant_text, assistant_metadata = scenario_prompt_message()
                elif state.get('preserve_level_on_scenario_change') and state.get('level'):
                    AIStudyWorkflowService._activate_guided_state(
                        session,
                        state,
                        scenario_key=scenario_key,
                        scenario_label=scenario_label,
                    )
                    assistant_text, assistant_metadata = kickoff_message(session.mode, state)
                else:
                    state['scenario_key'] = scenario_key
                    state['scenario_label'] = scenario_label
                    state['stage'] = 'choose_level'
                    AIStudyWorkflowService.persist_guided_state(
                        session,
                        state,
                        title=guided_session_title(session.mode, scenario_label),
                        touch=True,
                    )
                    assistant_text, assistant_metadata = level_prompt_message(scenario_label, state.get('level') or '')
        elif state.get('stage') == 'await_custom_scenario':
            scenario_label = clean_context_text(text, limit=120)
            if not scenario_label:
                assistant_text, assistant_metadata = custom_scenario_prompt_message()
            elif state.get('preserve_level_on_scenario_change') and state.get('level'):
                AIStudyWorkflowService._activate_guided_state(
                    session,
                    state,
                    scenario_key='custom',
                    scenario_label=scenario_label,
                )
                assistant_text, assistant_metadata = kickoff_message(session.mode, state)
            else:
                state['scenario_key'] = 'custom'
                state['scenario_label'] = scenario_label
                state['stage'] = 'choose_level'
                AIStudyWorkflowService.persist_guided_state(
                    session,
                    state,
                    title=guided_session_title(session.mode, scenario_label),
                    touch=True,
                )
                assistant_text, assistant_metadata = level_prompt_message(scenario_label, state.get('level') or '')
        elif state.get('stage') == 'choose_level':
            selected_level = action_value if action_type == 'level' else parse_level_choice(text)
            if selected_level == 'unknown':
                state['stage'] = 'level_assessment'
                state['assessment'] = {
                    'questions': LEVEL_ASSESSMENT_QUESTIONS,
                    'answers': [],
                    'current_index': 0,
                }
                AIStudyWorkflowService.persist_guided_state(session, state, touch=True)
                question = state['assessment']['questions'][0]
                assistant_text, assistant_metadata = level_assessment_message(
                    question,
                    0,
                    len(state['assessment']['questions']),
                )
            else:
                normalized_level = normalize_level_choice(selected_level or text or state.get('default_level_hint') or 'A2')
                AIStudyWorkflowService._activate_guided_state(
                    session,
                    state,
                    level=normalized_level,
                    level_source='selected',
                )
                assistant_text, assistant_metadata = kickoff_message(session.mode, state)
        elif state.get('stage') == 'level_assessment':
            assessment = state.get('assessment') or {}
            answers = list(assessment.get('answers') or [])
            current_index = int(assessment.get('current_index') or 0)
            answers.append({
                'question_id': LEVEL_ASSESSMENT_QUESTIONS[current_index]['id'],
                'answer': text,
            })
            assessment['answers'] = answers
            current_index += 1
            if current_index < len(LEVEL_ASSESSMENT_QUESTIONS):
                assessment['current_index'] = current_index
                state['assessment'] = assessment
                AIStudyWorkflowService.persist_guided_state(session, state, touch=True)
                question = LEVEL_ASSESSMENT_QUESTIONS[current_index]
                assistant_text, assistant_metadata = level_assessment_message(
                    question,
                    current_index,
                    len(LEVEL_ASSESSMENT_QUESTIONS),
                )
            else:
                result = AIStudyOpenAIService.estimate_level_from_assessment(
                    session,
                    state.get('scenario_label') or 'Conversacao livre',
                    answers,
                )
                estimated_level = normalize_level_choice(result.get('estimated_level'))
                focus_points = normalize_string_list(result.get('focus_points'), limit=4)
                progress_summary = result.get('rationale', '')
                AIStudyWorkflowService._activate_guided_state(
                    session,
                    state,
                    level=estimated_level,
                    level_source='estimated',
                    progress_summary=progress_summary,
                )
                if focus_points:
                    state['summary_items'] = unique_items((state.get('summary_items') or []) + focus_points, limit=8)
                    AIStudyWorkflowService.persist_guided_state(session, state, touch=True)
                kickoff_text, assistant_metadata = kickoff_message(session.mode, state)
                assistant_text = (
                    f"Acredito que seu nivel atual seja aproximadamente {estimated_level}.\n\n"
                    f"{progress_summary}\n\n"
                    f"{kickoff_text}"
                )
        return assistant_text, assistant_metadata

    @staticmethod
    def _writing_should_be_analyzed(state, text, guided_action):
        if guided_action:
            return False
        if state.get('stage') != 'active':
            return False
        expected_input = state.get('expected_input')
        cleaned = str(text or '').strip()
        if expected_input == 'text_submission':
            return AIStudyWorkflowService._looks_like_writing_sample(cleaned)
        if expected_input == 'chat':
            return (
                len(cleaned.split()) >= 8
                and '?' not in cleaned
                and AIStudyWorkflowService._looks_like_writing_sample(cleaned)
            )
        return False

    @staticmethod
    def _apply_guided_result(session, state, result):
        recommended = str(result.get('recommended_next_step') or 'continue').strip()
        choices = follow_up_choices_for_mode(session.mode, recommended=recommended if recommended else 'continue')
        expected_input = str(result.get('expected_input') or '').strip() or (
            'audio_or_text' if session.mode == 'speaking' else 'text_submission'
        )
        current_task = clean_context_text(result.get('current_task'), limit=600) or state.get('current_task') or scenario_task_for_mode(
            session.mode,
            state.get('scenario_key'),
            state.get('scenario_label') or 'Conversacao livre',
        )
        state['stage'] = 'active'
        state['last_activity_type'] = clean_context_text(result.get('activity_type'), limit=80) or 'guided'
        state['recommended_next_step'] = recommended or 'continue'
        state['objective'] = clean_context_text(result.get('objective'), limit=320) or state.get('objective')
        state['difficulty'] = clean_context_text(result.get('difficulty'), limit=120) or state.get('difficulty')
        state['progress_summary'] = clean_context_text(result.get('progress_summary'), limit=500) or state.get('progress_summary')
        state['learned_words'] = unique_items((state.get('learned_words') or []) + normalize_string_list(result.get('learned_words'), limit=8), limit=18)
        state['recurring_errors'] = unique_items((state.get('recurring_errors') or []) + normalize_string_list(result.get('recurring_errors'), limit=8), limit=18)
        state['completed_activities'] = unique_items((state.get('completed_activities') or []) + [state['last_activity_type']], limit=18)
        state['current_task'] = current_task
        state['expected_input'] = expected_input
        state['input_placeholder'] = clean_context_text(result.get('input_placeholder'), limit=240) or placeholder_for_expected_input(
            session.mode,
            expected_input,
            current_task,
        )
        state['summary_items'] = AIStudyWorkflowService._build_summary_items(
            state,
            extra_items=normalize_string_list(result.get('session_summary'), limit=4),
        )
        AIStudyWorkflowService.persist_guided_state(
            session,
            state,
            title=guided_session_title(session.mode, state.get('scenario_label')),
            touch=True,
        )
        if result.get('should_wrap_up'):
            assistant_text = clean_context_text(result.get('assistant_response'), limit=4000)
            intro = assistant_text if assistant_text else 'Voce fez um bom progresso nesta sessao.'
            return AIStudyWorkflowService._summary_response(session, state, intro_text=intro)
        assistant_text = AIStudyWorkflowService._append_next_step_prompt(
            clean_context_text(result.get('assistant_response'), limit=4000),
            choices[0]['label'] if choices else 'Continuar',
        )
        metadata = AIStudyWorkflowService._build_follow_up_metadata(
            session,
            state,
            choices,
            helper_text=state.get('progress_summary') or 'Escolha o proximo passo abaixo.',
        )
        return AIStudyWorkflowService._assistant_message(
            session,
            assistant_text,
            {**metadata, 'supports_streaming': True, 'mode': session.mode},
        )

    @staticmethod
    def handle_guided_message(session, text='', text_type='free', guided_action=None):
        state = AIStudyWorkflowService.ensure_guided_state(session, persist=True)
        guided_action = guided_action if isinstance(guided_action, dict) else None
        normalized_text = clean_context_text(text, limit=6000)
        user_text = AIStudyWorkflowService._user_message_text(normalized_text, guided_action)
        user_message = AIStudyWorkflowService._create_user_message(
            session,
            user_text,
            guided_action=guided_action,
            extra_metadata={'text_type': text_type} if text_type else None,
        )

        if state.get('stage') in ['choose_scenario', 'await_custom_scenario', 'choose_level', 'level_assessment']:
            assistant_text, assistant_metadata = AIStudyWorkflowService._handle_guided_onboarding(
                session,
                state,
                normalized_text,
                guided_action,
            )
            assistant_message = AIStudyWorkflowService._assistant_message(
                session,
                assistant_text,
                {**assistant_metadata, 'supports_streaming': True, 'mode': session.mode},
            )
            AIStudyContextService.touch_session(session)
            return user_message, assistant_message

        if guided_action:
            action_value = str(guided_action.get('value') or '').strip()
            action_type = str(guided_action.get('action_type') or '').strip()
            if action_value in ['continue_session', 'new_scenario']:
                action_type = 'session_control'
            if action_value == 'continue_session':
                action_type = 'quick_action'
                action_value = 'continue'
            if action_value == 'finalize_session':
                state['session_status'] = 'completed'
                state['expected_input'] = 'chat'
                state['input_placeholder'] = 'Escreva quando quiser iniciar uma nova atividade.'
                AIStudyWorkflowService.persist_guided_state(session, state, status='completed', touch=True)
                assistant_message = AIStudyWorkflowService._assistant_message(
                    session,
                    'Sessao encerrada. Quando quiser, comece um novo cenario e eu volto a guiar seu estudo.',
                    {'supports_streaming': True, 'mode': session.mode},
                )
                return user_message, assistant_message
            if action_type == 'session_control' and action_value in ['change_scenario', 'new_scenario']:
                state['stage'] = 'choose_scenario'
                state['preserve_level_on_scenario_change'] = bool(state.get('level'))
                state['current_task'] = ''
                state['expected_input'] = 'choice'
                state['input_placeholder'] = 'Escolha um novo cenario ou escreva o seu.'
                AIStudyWorkflowService.persist_guided_state(session, state, touch=True)
                assistant_text, assistant_metadata = scenario_prompt_message()
                assistant_metadata['helper_text'] = (
                    f"Seu nivel atual e {state.get('level')}. Vamos trocar apenas o cenario."
                    if state.get('level')
                    else assistant_metadata.get('helper_text', '')
                )
                assistant_message = AIStudyWorkflowService._assistant_message(
                    session,
                    assistant_text,
                    {**assistant_metadata, 'supports_streaming': True, 'mode': session.mode},
                )
                return user_message, assistant_message
            if action_type == 'session_control' and action_value == 'end_session':
                assistant_message = AIStudyWorkflowService._summary_response(
                    session,
                    state,
                    intro_text='Antes de encerrar, aqui vai um resumo do que voce conquistou nesta sessao.',
                )
                return user_message, assistant_message

        if session.mode == 'writing' and AIStudyWorkflowService._writing_should_be_analyzed(state, normalized_text, guided_action):
            return AIStudyWorkflowService.handle_writing_submission(session, normalized_text, text_type=text_type, user_message=user_message)

        action_value = str(guided_action.get('value') or '').strip() if guided_action else ''
        learner_input = normalized_text or user_text
        result = AIStudyOpenAIService.generate_guided_tutor_reply(session, learner_input, action_value=action_value)
        assistant_message = AIStudyWorkflowService._apply_guided_result(session, state, result)
        return user_message, assistant_message

    @staticmethod
    def handle_audio_upload(session, uploaded_file, duration_seconds=None):
        state = AIStudyWorkflowService.ensure_guided_state(session, persist=True)
        speaking_audio = SpeakingAudio.objects.create(
            session=session,
            student=session.student,
            audio=uploaded_file,
            mime_type=getattr(uploaded_file, 'content_type', ''),
            duration_seconds=duration_seconds,
        )
        try:
            speaking_audio.audio.open('rb')
            transcript = AIStudyOpenAIService.transcribe(speaking_audio.audio.file)
            speaking_audio.status = 'transcribed'
            speaking_audio.save(update_fields=['status'])
            analysis = AIStudyOpenAIService.analyze_speaking(session, transcript)
            feedback = SpeakingFeedback.objects.create(
                session=session,
                audio=speaking_audio,
                transcript=analysis.get('transcript') or transcript,
                overall_score=normalize_score(analysis.get('overall_score')),
                estimated_level=normalize_level(analysis.get('estimated_level')),
                pronunciation_score=normalize_score(analysis.get('pronunciation_score')),
                fluency_score=normalize_score(analysis.get('fluency_score')),
                intonation_score=normalize_score(analysis.get('intonation_score')),
                clarity_score=normalize_score(analysis.get('clarity_score')),
                grammar_score=normalize_score(analysis.get('intonation_score')),
                vocabulary_score=normalize_score(analysis.get('clarity_score')),
                ai_feedback=analysis.get('ai_feedback', ''),
                corrected_sentence=analysis.get('corrected_sentence', ''),
                natural_sentence=analysis.get('natural_sentence', ''),
                correct_words=normalize_string_list(analysis.get('correct_words'), limit=16),
                problem_words=normalize_string_list(analysis.get('problem_words'), limit=16),
                pronunciation_mistakes=normalize_string_list(analysis.get('pronunciation_mistakes'), limit=16),
                error_details=normalize_dict_list(analysis.get('error_details'), limit=16),
                grammar_explanation=analysis.get('grammar_explanation', ''),
                improvement_tips=normalize_string_list(analysis.get('improvement_tips'), limit=12),
                practice_exercises=normalize_string_list(analysis.get('practice_exercises'), limit=12),
                vocabulary_suggestions=normalize_string_list(analysis.get('vocabulary_suggestions'), limit=12),
                native_alternative_sentence=analysis.get('native_alternative_sentence', ''),
                raw_response=analysis,
            )
            PronunciationReview.objects.create(
                feedback=feedback,
                target_sentence=feedback.natural_sentence or feedback.corrected_sentence or feedback.transcript,
                difficulty_level='hard' if feedback.overall_score < 60 else 'medium',
            )
            speaking_audio.status = 'analyzed'
            speaking_audio.save(update_fields=['status'])
            AIConversationMessage.objects.create(
                session=session,
                role='user',
                content_type='audio',
                text=feedback.transcript,
                audio=speaking_audio,
                feedback=feedback,
            )

            low_performance = feedback.overall_score < 75
            state['stage'] = 'active'
            state['last_activity_type'] = 'speaking_feedback'
            state['progress_summary'] = clean_context_text(
                analysis.get('assistant_response') or feedback.ai_feedback,
                limit=400,
            )
            state['learned_words'] = unique_items(
                (state.get('learned_words') or []) + feedback.correct_words + feedback.vocabulary_suggestions,
                limit=18,
            )
            recurring_errors = feedback.problem_words + [item.get('word') for item in feedback.error_details if item.get('word')]
            state['recurring_errors'] = unique_items((state.get('recurring_errors') or []) + recurring_errors, limit=18)
            state['completed_activities'] = unique_items((state.get('completed_activities') or []) + ['analise de speaking'], limit=18)
            state['current_task'] = (
                f"Tente novamente usando esta frase como base: {feedback.corrected_sentence or feedback.natural_sentence or feedback.transcript}"
                if low_performance
                else scenario_task_for_mode(session.mode, state.get('scenario_key'), state.get('scenario_label') or 'Conversacao livre')
            )
            state['expected_input'] = 'audio_or_text'
            state['input_placeholder'] = placeholder_for_expected_input(session.mode, state['expected_input'], state['current_task'])
            state['recommended_next_step'] = 'retry' if low_performance else 'new_challenge'
            state['summary_items'] = AIStudyWorkflowService._build_summary_items(state)
            AIStudyWorkflowService.persist_guided_state(
                session,
                state,
                title=guided_session_title(session.mode, state.get('scenario_label')),
                touch=True,
            )

            choices = feedback_choices_for_mode('speaking', low_performance=low_performance)
            assistant_text = AIStudyWorkflowService._append_next_step_prompt(
                analysis.get('assistant_response') or feedback.ai_feedback,
                choices[0]['label'] if choices else 'Continuar',
            )
            metadata = AIStudyWorkflowService._build_follow_up_metadata(
                session,
                state,
                choices,
                helper_text='Escolha como deseja continuar seu treino agora.',
            )
            AIConversationMessage.objects.create(
                session=session,
                role='assistant',
                content_type='feedback',
                text=assistant_text,
                feedback=feedback,
                metadata={**metadata, 'supports_streaming': True, 'mode': session.mode},
            )
            return feedback
        except Exception as exc:
            speaking_audio.status = 'failed'
            speaking_audio.error_message = str(exc)
            speaking_audio.save(update_fields=['status', 'error_message'])
            raise

    @staticmethod
    def handle_writing_submission(session, text, text_type='free', user_message=None):
        state = AIStudyWorkflowService.ensure_guided_state(session, persist=True)
        analysis = AIStudyOpenAIService.analyze_writing(session, text, text_type=text_type)
        if not user_message:
            user_message = AIStudyWorkflowService._create_user_message(
                session,
                text,
                extra_metadata={'text_type': text_type},
            )
        feedback = WritingFeedback.objects.create(
            session=session,
            student=session.student,
            text_type=text_type,
            original_text=text,
            corrected_text=analysis.get('corrected_text', ''),
            estimated_level=normalize_level(analysis.get('estimated_level')),
            writing_score=normalize_score(analysis.get('writing_score')),
            sub_scores=analysis.get('sub_scores') if isinstance(analysis.get('sub_scores'), dict) else {},
            general_feedback=analysis.get('general_feedback', ''),
            level_progress_feedback=analysis.get('level_progress_feedback', ''),
            strengths=normalize_string_list(analysis.get('strengths'), limit=12),
            error_explanations=normalize_dict_list(analysis.get('error_explanations'), limit=20),
            improvement_tips=normalize_string_list(analysis.get('improvement_tips'), limit=12),
            rewrites=normalize_rewrites(analysis.get('rewrites')),
            exercises=normalize_string_list(analysis.get('exercises'), limit=12),
            grammar_breakdown=normalize_string_list(analysis.get('grammar_breakdown'), limit=12),
            vocabulary_flashcards=normalize_dict_list(analysis.get('vocabulary_flashcards'), limit=20),
            raw_response=analysis,
        )

        low_performance = feedback.writing_score < 75
        state['stage'] = 'active'
        state['last_activity_type'] = 'writing_feedback'
        state['progress_summary'] = clean_context_text(
            analysis.get('level_progress_feedback') or analysis.get('general_feedback'),
            limit=420,
        )
        learned_words = [item.get('term') for item in feedback.vocabulary_flashcards if item.get('term')]
        recurring_errors = [
            item.get('category') or item.get('excerpt')
            for item in feedback.error_explanations
            if item.get('category') or item.get('excerpt')
        ]
        state['learned_words'] = unique_items((state.get('learned_words') or []) + learned_words, limit=18)
        state['recurring_errors'] = unique_items((state.get('recurring_errors') or []) + recurring_errors, limit=18)
        state['completed_activities'] = unique_items((state.get('completed_activities') or []) + ['analise de writing'], limit=18)
        state['current_task'] = (
            f"Reescreva seu texto usando esta versao corrigida como base: {feedback.corrected_text}"
            if low_performance
            else scenario_task_for_mode(session.mode, state.get('scenario_key'), state.get('scenario_label') or 'Conversacao livre')
        )
        state['expected_input'] = 'text_submission'
        state['input_placeholder'] = placeholder_for_expected_input(session.mode, state['expected_input'], state['current_task'])
        state['recommended_next_step'] = 'retry' if low_performance else 'new_challenge'
        state['summary_items'] = AIStudyWorkflowService._build_summary_items(state)
        AIStudyWorkflowService.persist_guided_state(
            session,
            state,
            title=guided_session_title(session.mode, state.get('scenario_label')),
            touch=True,
        )

        choices = feedback_choices_for_mode('writing', low_performance=low_performance)
        assistant_text = AIStudyWorkflowService._append_next_step_prompt(
            AIStudyWorkflowService._build_writing_assistant_response(analysis, original_text=text),
            choices[0]['label'] if choices else 'Continuar',
        )
        metadata = AIStudyWorkflowService._build_follow_up_metadata(
            session,
            state,
            choices,
            helper_text='Agora vamos consolidar sua escrita com o proximo passo guiado.',
        )
        assistant_message = AIConversationMessage.objects.create(
            session=session,
            role='assistant',
            content_type='writing_feedback',
            text=assistant_text,
            writing_feedback=feedback,
            metadata={**metadata, 'supports_streaming': True, 'mode': session.mode},
        )
        return user_message, assistant_message
