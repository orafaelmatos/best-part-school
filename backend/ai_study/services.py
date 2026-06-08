import base64
import json
import mimetypes
import os
import uuid
from django.conf import settings
from django.db import transaction
from django.db.models import Count, Max, Q
from django.utils import timezone
from django.utils.html import strip_tags
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
)

client = OpenAI()


def media_url(path):
    base = settings.MEDIA_URL if settings.MEDIA_URL.endswith('/') else f"{settings.MEDIA_URL}/"
    return f"{base}{path}"


def clean_context_text(value, limit=None):
    text = strip_tags(str(value or '')).replace('\xa0', ' ').strip()
    if limit and len(text) > limit:
        return f"{text[:limit].rstrip()}..."
    return text


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
        }
        instruction_block = "CONTEXT USAGE RULES:\n- " + "\n- ".join(priority_rules)
        if selected_titles:
            instruction_block += f"\n\nCURRENT SELECTED LESSONS: {', '.join(selected_titles)}"
        return f"{instruction_block}\n\nCONTEXT JSON:\n{json.dumps(payload, ensure_ascii=False)}"[:22000]

    @staticmethod
    def tutor_system_prompt(session):
        lesson = AIStudyContextService.primary_lesson(session)
        lesson_title = lesson.title if lesson else 'Unknown lesson'
        return (
            'You are an English tutor inside an English school SaaS. '
            'This product is different from a generic chatbot because you must teach with precision from the school lesson context. '
            f'Student level: {session.student.level or "A2"}. Current lesson: {lesson_title}. '
            'The student does not choose a practice mode upfront. Infer intent from the message itself: '
            'text may require writing help, grammar correction, free conversation or exercises; audio transcripts may require speaking feedback, pronunciation guidance and a natural conversational reply. '
            'Selected lesson context is primary. '
            'Ground every answer in the linked lesson first and use broader student history only as fallback. '
            'When lesson context exists, answer based on its notes, summaries, flashcards, attached images, homework and corrections. '
            'Do not invent what happened in class. If the context is incomplete, say so explicitly. '
            'Keep answers concise, helpful and pedagogical, and end with one natural follow-up question when it fits.'
        )


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
                'pronunciation_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'fluency_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'grammar_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'vocabulary_score': {'type': 'integer', 'minimum': 0, 'maximum': 100},
                'corrected_sentence': {'type': 'string'},
                'natural_sentence': {'type': 'string'},
                'ai_feedback': {'type': 'string'},
                'pronunciation_mistakes': {'type': 'array', 'items': {'type': 'string'}},
                'grammar_explanation': {'type': 'string'},
                'vocabulary_suggestions': {'type': 'array', 'items': {'type': 'string'}},
                'native_alternative_sentence': {'type': 'string'},
                'assistant_response': {'type': 'string'},
            },
            'required': [
                'transcript', 'pronunciation_score', 'fluency_score', 'grammar_score',
                'vocabulary_score', 'corrected_sentence', 'natural_sentence', 'ai_feedback',
                'pronunciation_mistakes', 'grammar_explanation', 'vocabulary_suggestions',
                'native_alternative_sentence', 'assistant_response'
            ],
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
                            f"Student level: {session.student.level or 'A2'}\n"
                            f"Current lesson: {lesson.title if lesson else 'Unknown lesson'}\n"
                            f"Context:\n{context_text}\n\n"
                            f"Transcript:\n{transcript}"
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
        lesson_title = clean_context_text(lesson.title if lesson else 'AI Practice', limit=48)
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
        return strip_tags(str(value or '')).replace('\xa0', ' ').strip()

    @staticmethod
    def _format_bullet_section(title, lines):
        cleaned = [str(line).strip() for line in lines if str(line).strip()]
        if not cleaned:
            return ''
        return f"{title}:\n" + "\n".join(f"- {line}" for line in cleaned)

    @staticmethod
    def _build_teacher_summary(words, image_names, observations='', homework='', next_topics=None):
        sections = []

        word_lines = [
            f"{item['word']} ({item['meaning']})" if item.get('meaning') else item['word']
            for item in words[:12]
            if item.get('word')
        ]
        words_section = LessonSummaryWorkflowService._format_bullet_section('Palavras aprendidas', word_lines)
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
            sections.append(f"Observações complementares:\n{observations_text}")

        homework_text = LessonSummaryWorkflowService._clean_text(homework)
        if homework_text:
            sections.append(f"Homework:\n{homework_text}")

        if not sections:
            return (
                "As anotações acima já entram automaticamente no contexto da IA.\n"
                "Use este campo apenas para complementar com palavras aprendidas, referências anexadas e observações."
            )

        return "\n\n".join(sections)[:2200]

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
    @staticmethod
    def handle_audio_upload(session, uploaded_file, duration_seconds=None):
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
                pronunciation_score=analysis.get('pronunciation_score', 0),
                fluency_score=analysis.get('fluency_score', 0),
                grammar_score=analysis.get('grammar_score', 0),
                vocabulary_score=analysis.get('vocabulary_score', 0),
                ai_feedback=analysis.get('ai_feedback', ''),
                corrected_sentence=analysis.get('corrected_sentence', ''),
                natural_sentence=analysis.get('natural_sentence', ''),
                pronunciation_mistakes=analysis.get('pronunciation_mistakes', []),
                grammar_explanation=analysis.get('grammar_explanation', ''),
                vocabulary_suggestions=analysis.get('vocabulary_suggestions', []),
                native_alternative_sentence=analysis.get('native_alternative_sentence', ''),
                raw_response=analysis,
            )
            PronunciationReview.objects.create(
                feedback=feedback,
                target_sentence=feedback.natural_sentence or feedback.corrected_sentence or feedback.transcript,
                difficulty_level='hard' if feedback.pronunciation_score < 60 else 'medium',
            )
            speaking_audio.status = 'analyzed'
            speaking_audio.save(update_fields=['status'])
            AIConversationMessage.objects.create(session=session, role='user', content_type='audio', text=feedback.transcript, audio=speaking_audio, feedback=feedback)
            AIConversationMessage.objects.create(
                session=session,
                role='assistant',
                content_type='feedback',
                text=analysis.get('assistant_response') or feedback.ai_feedback,
                feedback=feedback,
                metadata={'supports_streaming': True},
            )
            AIStudyContextService.touch_session(session)
            AIStudyOpenAIService.maybe_generate_session_title(session)
            return feedback
        except Exception as exc:
            speaking_audio.status = 'failed'
            speaking_audio.error_message = str(exc)
            speaking_audio.save(update_fields=['status', 'error_message'])
            raise
