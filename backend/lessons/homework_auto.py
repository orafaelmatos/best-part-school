import json
import re
from difflib import SequenceMatcher

from django.utils import timezone
from openai import OpenAI

from .models import HomeworkAnswer

client = OpenAI()


def clean_text(value, limit=None):
    text = str(value or '').strip()
    text = re.sub(r'\s+', ' ', text)
    if limit and len(text) > limit:
        return text[:limit].rstrip()
    return text


def normalize_for_compare(value):
    text = clean_text(value).lower()
    text = re.sub(r'[^a-z0-9\s]', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def similarity(left, right):
    left_text = normalize_for_compare(left)
    right_text = normalize_for_compare(right)
    if not left_text or not right_text:
        return 0
    return SequenceMatcher(None, left_text, right_text).ratio()


def split_reference_answers(value):
    raw_items = re.split(r'[\n|;]+', str(value or ''))
    return [clean_text(item, limit=400) for item in raw_items if clean_text(item, limit=400)]


class HomeworkAutoCorrectionService:
    correction_schema = {
        'name': 'homework_answer_correction',
        'schema': {
            'type': 'object',
            'additionalProperties': False,
            'properties': {
                'is_correct': {'type': 'boolean'},
                'feedback': {'type': 'string'},
                'explanation': {'type': 'string'},
                'expected_answer': {'type': 'string'},
                'second_chance_question': {
                    'anyOf': [
                        {'type': 'null'},
                        {
                            'type': 'object',
                            'additionalProperties': False,
                            'properties': {
                                'type': {'type': 'string'},
                                'prompt': {'type': 'string'},
                                'options': {'type': 'array', 'items': {'type': 'string'}},
                                'correct_option_index': {'type': ['integer', 'null']},
                                'reference_answer': {'type': 'string'},
                                'explanation': {'type': 'string'},
                            },
                            'required': [
                                'type',
                                'prompt',
                                'options',
                                'correct_option_index',
                                'reference_answer',
                                'explanation',
                            ],
                        },
                    ],
                },
            },
            'required': ['is_correct', 'feedback', 'explanation', 'expected_answer', 'second_chance_question'],
        },
        'strict': True,
    }

    @classmethod
    def question_payload(cls, question):
        if isinstance(question, dict):
            return {
                'type': question.get('type') or 'open_text',
                'prompt': clean_text(question.get('prompt'), limit=1200),
                'options': [clean_text(item, limit=240) for item in (question.get('options') or []) if clean_text(item, limit=240)],
                'correct_option_index': question.get('correct_option_index'),
                'reference_answer': clean_text(question.get('reference_answer'), limit=1000),
                'correction_instructions': clean_text(question.get('correction_instructions'), limit=1000),
                'explanation': clean_text(question.get('explanation'), limit=600),
                'second_chance_mode': question.get('second_chance_mode') or 'none',
            }
        return {
            'type': question.type,
            'prompt': clean_text(question.prompt, limit=1200),
            'options': [clean_text(item, limit=240) for item in (question.options or []) if clean_text(item, limit=240)],
            'correct_option_index': question.correct_option_index,
            'reference_answer': clean_text(question.reference_answer, limit=1000),
            'correction_instructions': clean_text(question.correction_instructions, limit=1000),
            'explanation': clean_text(question.explanation, limit=600),
            'second_chance_mode': getattr(question, 'second_chance_mode', 'none'),
        }

    @classmethod
    def build_reserve_question(cls, question):
        if not clean_text(getattr(question, 'reserve_prompt', ''), limit=1200):
            return None
        payload = {
            'type': getattr(question, 'reserve_type', 'open_text') or 'open_text',
            'prompt': clean_text(getattr(question, 'reserve_prompt', ''), limit=1200),
            'options': [clean_text(item, limit=240) for item in (getattr(question, 'reserve_options', []) or []) if clean_text(item, limit=240)],
            'correct_option_index': getattr(question, 'reserve_correct_option_index', None),
            'reference_answer': clean_text(getattr(question, 'reserve_reference_answer', ''), limit=1000),
            'explanation': clean_text(getattr(question, 'reserve_explanation', ''), limit=600),
        }
        if payload['type'] != 'multiple_choice':
            payload['options'] = []
            payload['correct_option_index'] = None
        return payload

    @classmethod
    def normalize_second_chance_question(cls, question, fallback_type='open_text'):
        if not isinstance(question, dict):
            return None
        prompt = clean_text(question.get('prompt'), limit=1200)
        if not prompt:
            return None
        question_type = question.get('type') if question.get('type') in {'open_text', 'multiple_choice'} else fallback_type
        options = [clean_text(item, limit=240) for item in (question.get('options') or []) if clean_text(item, limit=240)]
        correct_option_index = question.get('correct_option_index')
        if question_type == 'multiple_choice':
            if len(options) < 2:
                return None
            if correct_option_index is None or correct_option_index < 0 or correct_option_index >= len(options):
                return None
        else:
            options = []
            correct_option_index = None
        return {
            'type': question_type,
            'prompt': prompt,
            'options': options,
            'correct_option_index': correct_option_index,
            'reference_answer': clean_text(question.get('reference_answer'), limit=1000),
            'explanation': clean_text(question.get('explanation'), limit=600),
        }

    @classmethod
    def generate_second_chance_question(cls, homework, question, student_answer='', expected_answer=''):
        payload = cls.question_payload(question)
        second_chance_mode = payload.get('second_chance_mode') or 'none'
        if second_chance_mode == 'none':
            return None
        return cls.build_reserve_question(question)

    @classmethod
    def _rule_based_open_text_match(cls, expected_answers, student_answer):
        if not expected_answers:
            return None
        best_ratio = max(similarity(student_answer, expected) for expected in expected_answers)
        if best_ratio >= 0.94:
            return True
        if best_ratio <= 0.45:
            return False
        return None

    @classmethod
    def _fallback_result(cls, question_payload, *, is_correct, expected_answer='', include_second_chance=False):
        explanation = question_payload.get('explanation') or ''
        result = {
            'is_correct': is_correct,
            'feedback': 'Acertou.' if is_correct else 'Resposta incorreta.',
            'explanation': explanation if not is_correct else '',
            'expected_answer': clean_text(expected_answer or question_payload.get('reference_answer') or '', limit=1000),
            'second_chance_question': None,
        }
        if not is_correct and include_second_chance:
            result['second_chance_question'] = {
                'type': question_payload.get('type') or 'open_text',
                'prompt': clean_text(f"Tente novamente com uma questão parecida: {question_payload.get('prompt')}", limit=1200),
                'options': question_payload.get('options') or [],
                'correct_option_index': question_payload.get('correct_option_index'),
                'reference_answer': clean_text(question_payload.get('reference_answer'), limit=1000),
                'explanation': explanation,
            }
            if result['second_chance_question']['type'] != 'multiple_choice':
                result['second_chance_question']['options'] = []
                result['second_chance_question']['correct_option_index'] = None
        return result

    @classmethod
    def _ai_correct(cls, homework, question_payload, student_answer, include_second_chance=False):
        try:
            response = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {
                        'role': 'system',
                        'content': (
                            'You evaluate English homework answers for Brazilian students. '
                            'Return only JSON. '
                            'Be objective and pedagogical. '
                            'Minor spelling or grammar mistakes can still be correct if the main meaning is preserved. '
                            'feedback and explanation must be in Brazilian Portuguese, short and direct. '
                            'If generate_second_chance is false, second_chance_question must be null. '
                            'If the answer is wrong and generate_second_chance is true, create only one similar question that tests the same skill.'
                        ),
                    },
                    {
                        'role': 'user',
                        'content': json.dumps(
                            {
                                'homework_title': clean_text(homework.title, limit=200),
                                'classification': clean_text(homework.classification, limit=120),
                                'instructions': clean_text(homework.description, limit=500),
                                'question': question_payload,
                                'student_answer': clean_text(student_answer, limit=1200),
                                'generate_second_chance': include_second_chance,
                            },
                            ensure_ascii=False,
                        ),
                    },
                ],
                response_format={'type': 'json_schema', 'json_schema': cls.correction_schema},
            )
            payload = json.loads(response.choices[0].message.content)
            payload['feedback'] = clean_text(payload.get('feedback'), limit=240)
            payload['explanation'] = clean_text(payload.get('explanation'), limit=320)
            payload['expected_answer'] = clean_text(payload.get('expected_answer'), limit=1000)
            payload['second_chance_question'] = cls.normalize_second_chance_question(
                payload.get('second_chance_question'),
                fallback_type=question_payload.get('type') or 'open_text',
            )
            return payload
        except Exception:
            return None

    @classmethod
    def evaluate_primary_answer(cls, homework, question, answer_text='', selected_option_index=None):
        payload = cls.question_payload(question)
        second_chance_mode = payload.get('second_chance_mode') or 'none'
        student_answer = answer_text or ''

        if payload['type'] == 'multiple_choice':
            expected_answer = ''
            if payload.get('correct_option_index') is not None and payload.get('correct_option_index') < len(payload.get('options') or []):
                expected_answer = payload['options'][payload['correct_option_index']]
            is_correct = selected_option_index is not None and selected_option_index == payload.get('correct_option_index')
            result = cls._fallback_result(
                payload,
                is_correct=is_correct,
                expected_answer=expected_answer,
                include_second_chance=False,
            )
            if not is_correct and second_chance_mode == 'reserve':
                result['second_chance_question'] = cls.build_reserve_question(question)
            if not is_correct:
                result['feedback'] = 'Resposta incorreta.'
                result['explanation'] = payload.get('explanation') or 'Revise a alternativa correta e tente aplicar a mesma ideia na próxima.'
            return result

        expected_answers = split_reference_answers(payload.get('reference_answer'))
        if not clean_text(student_answer):
            result = cls._fallback_result(
                payload,
                is_correct=False,
                expected_answer=expected_answers[0] if expected_answers else '',
                include_second_chance=False,
            )
            result['feedback'] = 'Resposta em branco.'
            if second_chance_mode == 'reserve':
                result['second_chance_question'] = cls.build_reserve_question(question)
            return result

        matched = cls._rule_based_open_text_match(expected_answers, student_answer)
        if matched is True:
            return cls._fallback_result(
                payload,
                is_correct=True,
                expected_answer=expected_answers[0] if expected_answers else '',
                include_second_chance=False,
            )

        ai_result = cls._ai_correct(homework, payload, student_answer, include_second_chance=False)
        if ai_result:
            if ai_result.get('is_correct') is False and second_chance_mode == 'reserve':
                ai_result['second_chance_question'] = cls.build_reserve_question(question)
            else:
                ai_result['second_chance_question'] = None
            return ai_result

        result = cls._fallback_result(
            payload,
            is_correct=matched is True,
            expected_answer=expected_answers[0] if expected_answers else '',
            include_second_chance=False,
        )
        if matched is False:
            result['feedback'] = 'Resposta incorreta.'
        if matched is False and second_chance_mode == 'reserve':
            result['second_chance_question'] = cls.build_reserve_question(question)
        return result

    @classmethod
    def evaluate_second_chance(cls, homework, second_chance_question, answer_text='', selected_option_index=None):
        payload = cls.question_payload(second_chance_question)
        if payload['type'] == 'multiple_choice':
            expected_answer = ''
            if payload.get('correct_option_index') is not None and payload.get('correct_option_index') < len(payload.get('options') or []):
                expected_answer = payload['options'][payload['correct_option_index']]
            return cls._fallback_result(
                payload,
                is_correct=selected_option_index is not None and selected_option_index == payload.get('correct_option_index'),
                expected_answer=expected_answer,
                include_second_chance=False,
            )

        expected_answers = split_reference_answers(payload.get('reference_answer'))
        student_answer = answer_text or ''
        matched = cls._rule_based_open_text_match(expected_answers, student_answer)
        if matched is not None:
            return cls._fallback_result(
                payload,
                is_correct=matched,
                expected_answer=expected_answers[0] if expected_answers else '',
                include_second_chance=False,
            )

        ai_result = cls._ai_correct(homework, payload, student_answer, include_second_chance=False)
        if ai_result:
            ai_result['second_chance_question'] = None
            return ai_result

        return cls._fallback_result(
            payload,
            is_correct=False,
            expected_answer=expected_answers[0] if expected_answers else '',
            include_second_chance=False,
        )

    @classmethod
    def _answer_is_complete(cls, answer):
        metadata = answer.correction_metadata if isinstance(answer.correction_metadata, dict) else {}
        second_chance_question = metadata.get('second_chance_question')
        if answer.is_correct is True:
            return True
        if isinstance(second_chance_question, dict):
            return answer.second_chance_is_correct is not None or answer.second_chance_answered_at is not None
        return answer.is_correct is not None

    @classmethod
    def build_report(cls, homework, student):
        answers = list(
            HomeworkAnswer.objects.filter(homework=homework, student=student)
            .select_related('question')
            .order_by('question__order')
        )
        total_questions = homework.questions.count()
        first_try_correct = sum(1 for answer in answers if answer.is_correct is True)
        second_chance_correct = sum(1 for answer in answers if answer.is_correct is False and answer.second_chance_is_correct is True)
        incorrect = sum(
            1
            for answer in answers
            if answer.is_correct is False and answer.second_chance_is_correct is not True
        )
        accuracy = round(((first_try_correct + second_chance_correct) / total_questions) * 100) if total_questions else 0

        if accuracy >= 90:
            summary = 'Excelente desempenho geral, com domínio consistente da atividade.'
        elif accuracy >= 70:
            summary = 'Bom desempenho geral, com poucos ajustes pontuais para consolidar.'
        elif accuracy >= 50:
            summary = 'Desempenho regular, com sinais de compreensão e alguns pontos para reforçar.'
        else:
            summary = 'A atividade mostrou pontos importantes para revisão antes de avançar.'

        attention_points = []
        for answer in answers:
            if answer.is_correct is False and answer.second_chance_is_correct is not True:
                point = clean_text(
                    answer.second_chance_explanation
                    or answer.auto_explanation
                    or answer.expected_answer
                    or answer.question.prompt,
                    limit=180,
                )
                if point and point not in attention_points:
                    attention_points.append(point)
                if len(attention_points) >= 3:
                    break

        return {
            'generated_at': timezone.now().isoformat(),
            'summary': summary,
            'accuracy': accuracy,
            'total_questions': total_questions,
            'first_try_correct': first_try_correct,
            'second_chance_correct': second_chance_correct,
            'incorrect_after_second_chance': incorrect,
            'attention_points': attention_points,
        }

    @classmethod
    def refresh_homework_status(cls, homework, student):
        answers = {
            answer.question_id: answer
            for answer in HomeworkAnswer.objects.filter(homework=homework, student=student)
        }
        total_questions = homework.questions.count()
        answered_any = bool(answers)
        completed = total_questions > 0

        for question in homework.questions.all():
            answer = answers.get(question.id)
            if not answer or not cls._answer_is_complete(answer):
                completed = False
                break

        homework.student_report = {}
        homework.report_generated_at = None
        if not answered_any:
            homework.status = 'pending'
        elif completed:
            homework.status = 'corrected' if homework.auto_correction_enabled else 'sent'
            if homework.auto_correction_enabled:
                homework.student_report = cls.build_report(homework, student)
                homework.report_generated_at = timezone.now()
        else:
            homework.status = 'in_progress'

        homework.save(update_fields=['status', 'student_report', 'report_generated_at', 'updated_at'])
        return homework

    @classmethod
    def submit_primary_answer(cls, homework, question, student, answer_text='', selected_option_index=None):
        answer, _ = HomeworkAnswer.objects.get_or_create(
            homework=homework,
            question=question,
            student=student,
        )
        if answer.answered_at:
            raise ValueError('Essa questão já foi corrigida.')

        result = cls.evaluate_primary_answer(
            homework,
            question,
            answer_text=answer_text,
            selected_option_index=selected_option_index,
        )
        metadata = answer.correction_metadata if isinstance(answer.correction_metadata, dict) else {}
        metadata['second_chance_question'] = result.get('second_chance_question')

        answer.answer_text = answer_text or ''
        answer.selected_option_index = selected_option_index
        answer.is_correct = result.get('is_correct')
        answer.auto_feedback = clean_text(result.get('feedback'), limit=240)
        answer.auto_explanation = clean_text(result.get('explanation'), limit=320)
        answer.expected_answer = clean_text(result.get('expected_answer'), limit=1000)
        answer.correction_metadata = metadata
        answer.answered_at = timezone.now()
        answer.save()

        cls.refresh_homework_status(homework, student)
        return answer

    @classmethod
    def submit_second_chance_answer(cls, homework, question, student, answer_text='', selected_option_index=None):
        answer = HomeworkAnswer.objects.filter(homework=homework, question=question, student=student).first()
        if not answer:
            raise ValueError('Responda a questão principal antes da segunda chance.')
        if answer.second_chance_answered_at:
            raise ValueError('A segunda chance já foi utilizada.')

        metadata = answer.correction_metadata if isinstance(answer.correction_metadata, dict) else {}
        second_chance_question = metadata.get('second_chance_question')
        if not isinstance(second_chance_question, dict):
            raise ValueError('Nenhuma segunda chance está disponível para esta questão.')

        result = cls.evaluate_second_chance(
            homework,
            second_chance_question,
            answer_text=answer_text,
            selected_option_index=selected_option_index,
        )

        answer.second_chance_answer_text = answer_text or ''
        answer.second_chance_selected_option_index = selected_option_index
        answer.second_chance_is_correct = result.get('is_correct')
        answer.second_chance_feedback = clean_text(result.get('feedback'), limit=240)
        answer.second_chance_explanation = clean_text(result.get('explanation'), limit=320)
        answer.second_chance_expected_answer = clean_text(result.get('expected_answer'), limit=1000)
        answer.second_chance_answered_at = timezone.now()
        answer.save()

        cls.refresh_homework_status(homework, student)
        return answer

    @classmethod
    def ensure_second_chance_question(cls, homework, question, student):
        answer = HomeworkAnswer.objects.filter(homework=homework, question=question, student=student).first()
        if not answer:
            raise ValueError('Responda a questão principal antes da segunda chance.')
        if answer.is_correct is True:
            raise ValueError('Essa questão já foi respondida corretamente.')
        if answer.second_chance_answered_at:
            raise ValueError('A segunda chance já foi utilizada.')

        metadata = answer.correction_metadata if isinstance(answer.correction_metadata, dict) else {}
        second_chance_question = metadata.get('second_chance_question')
        if not isinstance(second_chance_question, dict):
            second_chance_question = cls.generate_second_chance_question(
                homework,
                question,
                student_answer=answer.answer_text or '',
                expected_answer=answer.expected_answer or '',
            )
            metadata['second_chance_question'] = second_chance_question
            answer.correction_metadata = metadata
            answer.save(update_fields=['correction_metadata', 'updated_at'])

        cls.refresh_homework_status(homework, student)
        return answer
