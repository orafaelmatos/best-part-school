import io
import json
import tempfile
import wave
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User, StudentGroup
from lessons.models import Lesson, LessonSummary, NewWord, VocabularyCard, Homework, HomeworkAnswer
from .models import AIStudySession, LessonReviewReport
from .review import ACTIVITIES, LessonReviewAI, LessonReviewService, ReviewUnavailable


def exercise(**changes):
    return {
        'supported': True, 'prompt': 'Traduza: Eu fui ao aeroporto ontem.', 'explanation': '',
        'reference_answer': 'I went to the airport yesterday.', 'focus': 'Simple past',
        'options': ['went', 'go', 'goes', 'going'], 'correct_option_index': 0,
        'audio_text': 'I went to the airport yesterday.', 'source_id': 'notes',
        'source_quote': 'past tense', **changes,
    }


def grade(correct=True, **changes):
    return {
        'is_answer': True, 'is_correct': correct, 'feedback': 'Muito bem!' if correct else 'Vamos ajustar o verbo.',
        'error': '' if correct else 'go no lugar de went',
        'explanation': 'Usamos went para uma ação passada.',
        'correct_answer': 'I went to the airport yesterday.', 'difficulty': 'Simple past', **changes,
    }


class LessonReviewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.student = User.objects.create_user(email='review@test.com', role='student', name='Student', level='A2')
        cls.other = User.objects.create_user(email='other-review@test.com', role='student', name='Other')
        cls.teacher = User.objects.create_user(email='review-teacher@test.com', role='teacher', name='Teacher')
        cls.stranger = User.objects.create_user(email='stranger@test.com', role='teacher', name='Stranger')
        cls.lesson = Lesson.objects.create(title='Travel', level='A2', student=cls.student, teacher=cls.teacher,
                                          notes='Practiced past tense: I went to the airport yesterday.', status='completed')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.student)
        response = self.client.post('/api/ai-study/sessions/', {'mode': 'review', 'lesson_id': str(self.lesson.id)}, format='json')
        self.assertEqual(response.status_code, 201)
        self.session = AIStudySession.objects.get(pk=response.data['id'])
        self.url = f'/api/ai-study/sessions/{self.session.pk}/'
        self.created = response.data
        self.generate = patch('ai_study.review.LessonReviewAI.generate', return_value=exercise()).start()
        self.grade = patch('ai_study.review.LessonReviewAI.grade', return_value=grade()).start()
        self.addCleanup(patch.stopall)

    def send(self, activity=None, control=None, answer=None, text='', revision=None):
        self.session.refresh_from_db()
        data = {'text': text, 'review_revision': self.session.review_state.get('revision', 0) if revision is None else revision}
        for kind, value in [('review_activity', activity), ('review_control', control), ('review_answer', answer)]:
            if value:
                data['guided_action'] = {'action_type': kind, 'value': value, 'label': value}
        return self.client.post(self.url + 'message/', data, format='json')

    def test_welcome_offers_all_ten_activities_without_ai_call(self):
        message = self.created['messages'][0]
        self.assertEqual(message['text'], 'Vamos revisar sua aula? Escolha como você quer praticar hoje:')
        self.assertEqual(len(message['metadata']['choices']), 10)
        self.assertTrue(message['metadata']['allow_free_text'])
        self.generate.assert_not_called()

    @patch('ai_study.review.AIStudyOpenAIService.generate_tts', return_value='/media/listening.mp3')
    def test_all_activity_types_can_start(self, tts):
        for key, _, _, _ in ACTIVITIES:
            with self.subTest(activity=key):
                response = self.send(activity=key)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data['session']['guided_state']['review_activity'], key)
                self.assertEqual(response.data['session']['guided_state']['stage'], 'awaiting_answer')
        tts.assert_called_once()

    def test_no_generic_exercise_from_title_only(self):
        self.lesson.notes = ''
        self.lesson.save()
        response = self.send(activity='grammar')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['assistant_message']['metadata']['review_context_missing'])
        self.generate.assert_not_called()
        self.session.refresh_from_db()
        self.assertNotIn('exercise', self.session.review_state)

    def test_rejects_invented_source_without_persisting_half_turn(self):
        self.generate.return_value = exercise(source_quote='Never taught this')
        before = self.session.messages.count()
        response = self.send(activity='quiz')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.session.messages.count(), before)

    def test_answer_key_is_private_in_every_student_endpoint(self):
        self.send(activity='quiz')
        for response in [self.client.get(self.url), self.client.get(self.url + 'history/'), self.client.get('/api/ai-study/sessions/')]:
            data = json.dumps(response.data, default=str)
            for key in ['reference_answer', 'correct_option_index', 'review_state', 'audio_text']:
                self.assertNotIn(key, data)

    def test_one_question_feedback_then_explicit_next_and_duplicate_protection(self):
        self.send(activity='quiz')
        self.assertEqual(self.send(control='next').status_code, 400)
        self.session.refresh_from_db()
        revision = self.session.review_state['revision']
        response = self.send(answer='A')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['session']['guided_state']['correct_count'], 1)
        self.assertEqual(response.data['session']['guided_state']['stage'], 'feedback')
        self.assertEqual(self.generate.call_count, 1)
        self.assertEqual(self.send(answer='A', revision=revision).status_code, 400)
        self.assertEqual(self.send(control='next').status_code, 200)
        self.assertEqual(self.generate.call_count, 2)

    def test_wrong_answer_gets_specific_correction_and_difficulty_decreases(self):
        self.send(activity='translation')
        self.session.refresh_from_db()
        self.session.review_state['difficulty'] = 3
        self.session.save()
        self.grade.return_value = grade(False)
        response = self.send(text='I go to the airport yesterday.')
        self.assertEqual(response.status_code, 200)
        text = response.data['assistant_message']['text']
        self.assertIn('go no lugar de went', text)
        self.assertIn('Usamos went', text)
        self.assertIn('Forma correta: I went', text)
        self.assertEqual(response.data['session']['guided_state']['difficulty'], '2')
        self.assertEqual(response.data['session']['guided_state']['incorrect_count'], 1)

    def test_three_successes_increase_difficulty_and_use_previous_attempts(self):
        self.send(activity='translation')
        for index in range(3):
            response = self.send(text='I went to the airport yesterday.')
            if index < 2:
                self.send(control='next')
        self.assertEqual(response.data['session']['guided_state']['difficulty'], '2')
        self.assertEqual(response.data['session']['guided_state']['correct_count'], 3)

    def test_clarification_does_not_count_or_replace_current_question(self):
        self.send(activity='quiz')
        self.session.refresh_from_db()
        current = self.session.review_state['exercise']['id']
        self.grade.return_value = grade(is_answer=False, is_correct=None, feedback='Pense no passado de go.')
        response = self.send(text='Pode explicar a pergunta?')
        self.assertEqual(response.data['session']['guided_state']['correct_count'], 0)
        self.assertEqual(len(response.data['assistant_message']['metadata']['choices']), 4)
        self.session.refresh_from_db()
        self.assertEqual(self.session.review_state['exercise']['id'], current)

    def test_free_request_starts_custom_lesson_activity(self):
        response = self.send(text='Quero praticar perguntas sobre a viagem da aula.')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.generate.call_args.args[1], 'custom')
        self.assertIn('viagem', self.generate.call_args.args[4])

    def test_ai_failure_preserves_pending_exercise_and_answer_count(self):
        self.send(activity='translation')
        before = self.session.messages.count()
        self.grade.side_effect = ReviewUnavailable()
        response = self.send(text='I went.')
        self.assertEqual(response.status_code, 503)
        self.session.refresh_from_db()
        self.assertEqual(self.session.review_state['phase'], 'awaiting_answer')
        self.assertEqual(self.session.messages.count(), before)
        self.assertEqual(self.session.review_state.get('correct_count', 0), 0)

    def test_finish_is_idempotent_persists_report_and_blocks_more_answers(self):
        self.send(activity='translation')
        self.grade.return_value = grade(False)
        self.send(text='I go yesterday.')
        first = self.client.post(self.url + 'review/finish/')
        second = self.client.post(self.url + 'review/finish/')
        report = first.data['session']['review_report']
        self.assertEqual(report['incorrect_count'], 1)
        self.assertEqual(report['difficulties'], [{'topic': 'Simple past', 'count': 1}])
        self.assertEqual(report['id'], second.data['session']['review_report']['id'])
        self.assertEqual(LessonReviewReport.objects.count(), 1)
        self.assertEqual(self.send(text='again').status_code, 400)
        self.client.delete(self.url)
        self.assertEqual(LessonReviewReport.objects.count(), 1)

    def test_report_is_available_to_own_student_and_teacher_only(self):
        self.client.post(self.url + 'review/finish/')
        self.assertEqual(len(self.client.get('/api/ai-study/progress/overview/').data['review_history']), 1)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(len(self.client.get('/api/ai-study/progress/overview/', {'student': self.student.id}).data['review_history']), 1)
        self.assertEqual(self.client.post(self.url + 'review/finish/').status_code, 403)
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get('/api/ai-study/progress/overview/', {'student': self.student.id}).status_code, 404)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/ai-study/progress/overview/', {'student': self.student.id}).data['review_history'], [])
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_elapsed_practice_caps_idle_time_and_ignores_client_counts(self):
        self.send(activity='quiz')
        self.session.refresh_from_db()
        self.session.review_state['last_active_at'] = (timezone.now() - timedelta(hours=3)).isoformat()
        self.session.save()
        response = self.client.post(self.url + 'review/heartbeat/', {'duration_seconds': 999999, 'correct_count': 900})
        self.assertEqual(response.data['duration_seconds'], 60)
        report = self.client.post(self.url + 'review/finish/').data['session']['review_report']
        self.assertEqual(report['correct_count'], 0)
        self.assertEqual(report['incorrect_count'], 0)

    def test_cannot_change_lesson_after_practice_starts(self):
        self.send(activity='grammar')
        response = self.client.post(self.url + 'contexts/', {'lesson_id': str(self.lesson.id)})
        self.assertEqual(response.status_code, 400)

    @patch('ai_study.review.AIStudyOpenAIService.generate_tts', return_value='/media/review.mp3')
    def test_listening_has_playable_audio_and_hides_transcript(self, tts):
        self.generate.return_value = exercise(prompt='Where did the speaker go?')
        response = self.send(activity='listening')
        self.assertEqual(response.data['assistant_message']['metadata']['review_audio_url'], '/media/review.mp3')
        self.assertNotIn('I went to the airport yesterday.', json.dumps(response.data, default=str))
        tts.assert_called_once_with('I went to the airport yesterday.', timeout=30)

    @patch('ai_study.review.AIStudyOpenAIService.generate_tts', side_effect=OSError('unavailable'))
    def test_listening_failure_does_not_create_unanswerable_exercise(self, tts):
        self.assertEqual(self.send(activity='listening').status_code, 503)
        self.session.refresh_from_db()
        self.assertNotIn('exercise', self.session.review_state)

    @patch('ai_study.review.AIStudyOpenAIService.transcribe', return_value='I went to the airport yesterday.')
    @patch('ai_study.review.LessonReviewAI.listen', return_value=('Ajuste a tonicidade de airport.', 3.2))
    def test_speaking_assesses_audio_and_persists_pronunciation_in_report(self, listen, transcribe):
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            self.send(activity='speaking')
            self.session.refresh_from_db()
            response = self.client.post(self.url + 'audio/', {
                'audio': SimpleUploadedFile('answer.wav', b'audio', content_type='audio/wav'),
                'review_revision': self.session.review_state['revision'],
            }, format='multipart')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertIn('tonicidade', response.data['assistant_message']['text'])
            self.assertTrue(response.data['user_message']['audio_url'])
            self.assertEqual(self.grade.call_args.args[2], 'Ajuste a tonicidade de airport.')
            report = self.client.post(self.url + 'review/finish/').data['session']['review_report']
            self.assertIn('tonicidade', report['attempts'][0]['pronunciation_feedback'])

    def test_context_includes_real_current_lesson_history_and_no_other_student_work(self):
        summary = LessonSummary.objects.create(lesson=self.lesson, student=self.student, teacher=self.teacher, summary='Irregular verbs')
        summary.mistakes.create(mistake='I goed', correction='I went')
        NewWord.objects.create(lesson=self.lesson, word='boarding pass', meaning='cartão de embarque', level='A2')
        VocabularyCard.objects.create(lesson=self.lesson, student=self.student, word='gate', translation='portão', example_sentence='Gate twenty.')
        VocabularyCard.objects.create(lesson=self.lesson, student=self.other, word='private vocabulary', translation='private')
        homework = Homework.objects.create(lesson=self.lesson, student=self.student, status='corrected', title='Past')
        question = homework.questions.create(prompt='Where did you go?', type='open_text')
        HomeworkAnswer.objects.create(homework=homework, question=question, student=self.student, answer_text='I goed.', auto_feedback='Use went.')
        self.send(activity='grammar')
        sources = json.dumps(self.generate.call_args.args[2], ensure_ascii=False)
        for value in ['Irregular verbs', 'I goed', 'boarding pass', 'Gate twenty.', 'Use went.']:
            self.assertIn(value, sources)
        self.assertNotIn('private vocabulary', sources)
        self.assertNotIn('"title": "Travel"', sources)
        self.lesson.notes = 'New notes about past tense.'
        self.lesson.save()
        self.send(activity='grammar')
        self.assertIn('New notes', json.dumps(self.generate.call_args.args[2]))

    def test_group_teacher_can_read_reports_without_individual_lesson(self):
        group = StudentGroup.objects.create(name='Class', teacher=self.teacher)
        group.students.add(self.other)
        lesson = Lesson.objects.create(title='Group lesson', group=group, teacher=self.teacher, notes='past tense', level='A2')
        session = AIStudySession.objects.create(student=self.other, lesson=lesson, mode='review')
        LessonReviewService.finish(session)
        self.client.force_authenticate(self.teacher)
        response = self.client.get('/api/ai-study/progress/overview/', {'student': self.other.id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['review_history']), 1)


class ReviewAudioContractTests(TestCase):
    @patch('ai_study.review.client')
    def test_pronunciation_request_contains_actual_audio(self, client):
        data = io.BytesIO()
        with wave.open(data, 'wb') as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(24000)
            audio.writeframes(b'\x00\x00' * 2400)
        client.with_options.return_value.chat.completions.create.return_value = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({'intelligible': True, 'observations': 'A fala está clara.'})))])
        upload = SimpleUploadedFile('speech.wav', data.getvalue(), content_type='audio/wav')
        LessonReviewAI.listen(upload, {'prompt': 'Where did you go?'})
        payload = client.with_options.return_value.chat.completions.create.call_args.kwargs
        self.assertEqual(payload['modalities'], ['text'])
        self.assertEqual(payload['messages'][1]['content'][1]['type'], 'input_audio')
        self.assertEqual(payload['messages'][1]['content'][1]['input_audio']['format'], 'wav')

    def test_invalid_audio_is_rejected_before_ai(self):
        with self.assertRaisesMessage(Exception, 'WAV válida'):
            LessonReviewAI.listen(SimpleUploadedFile('fake.wav', b'not audio'), {'prompt': 'Hello?'})
