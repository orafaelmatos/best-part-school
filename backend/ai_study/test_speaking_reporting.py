from copy import deepcopy
import tempfile
import uuid
from io import StringIO
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from accounts.models import User, StudentGroup
from lessons.models import Lesson
from . import speaking, speaking_preparation
from .models import AIStudySession, SpeakingSessionReport
from .services import AIStudyOpenAIService, AIStudyWorkflowService
from .test_speaking import make_plan, make_turn
from .test_speaking_preparation import assessment, guided_task
from .test_speaking_simulation import pending_engine, follow_up, help_response, new_situation


class SpeakingReportingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(email='reports@test.com', role='student', level='A1')
        self.client.force_authenticate(self.student)
        self.patches = {}
        for method, value in {
            'plan_speaking_session': make_plan(), 'generate_speaking_turn': make_turn('SIMULATE'),
            'generate_vocabulary_task': guided_task(), 'assess_vocabulary_practice': assessment(),
            'generate_simulation_help': help_response(), 'generate_tts': '/media/question.mp3',
            'transcribe': 'My name is Gabriel.', 'generate_speaking_challenge': new_situation(),
        }.items():
            item = patch.object(AIStudyOpenAIService, method, return_value=value)
            self.patches[method] = item.start()
            self.addCleanup(item.stop)
        self.patches['assess_vocabulary_practice'].side_effect = lambda _s, _e, _l, answer, *_: assessment(answer, 'mastered')

    def pending(self, level='A1'):
        session = AIStudySession.objects.create(student=self.student, mode='speaking', guided_state={
            'enabled': True, 'stage': 'active', 'level': level, 'scenario_label': 'Aula de Jiu-Jitsu', 'speaking': pending_engine(),
        })
        AIStudyWorkflowService._sync_speaking_state(session.guided_state)
        session.save()
        return session

    def send(self, session, text='', value=None, kind='simulation_help'):
        data = {'text': text} if value is None else {'guided_action': {'value': value, 'action_type': kind}}
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/message/', data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        session.refresh_from_db()
        return response

    def report(self, session):
        return SpeakingSessionReport.objects.get(session=session).report

    def test_all_levels_custom_and_predefined_complete_prepare_help_resume_and_finalize(self):
        for level in speaking.LEVEL_POLICIES:
            for custom in (False, True):
                with self.subTest(level=level, custom=custom):
                    created = self.client.post('/api/ai-study/sessions/', {'mode': 'speaking'}, format='json')
                    session = AIStudySession.objects.get(pk=created.data['id'])
                    self.send(session, value='custom' if custom else 'free_conversation', kind='scenario')
                    if custom:
                        self.send(session, text='Aula de Jiu-Jitsu')
                    self.send(session, value=level, kind='level')
                    self.patches['generate_speaking_turn'].return_value = make_turn('SIMULATE')
                    for _ in range(20):
                        engine = session.guided_state['speaking']
                        if engine['phase'] == 'SIMULATE':
                            break
                        prep = engine['preparation']
                        if prep['step'] in {'REPEAT', 'GUIDED'}:
                            answer = speaking_preparation.item(engine)['example'] if prep['step'] == 'REPEAT' else prep['task']['model_answer']
                            self.send(session, text=answer)
                        else:
                            self.send(session, value='next', kind='preparation')
                    self.assertEqual(session.guided_state['speaking']['phase'], 'SIMULATE')
                    before = deepcopy(session.guided_state['speaking'])
                    evaluated = self.report(session)['progress']['evaluated_responses']
                    for action in ['not_understood', 'hint', 'translate', 'examples', 'grammar', 'continue']:
                        response = self.send(session, value=action)
                        self.assertEqual(session.guided_state['speaking']['last_question'], before['last_question'])
                    replay = self.client.post(f'/api/ai-study/sessions/{session.id}/simulation-audio/',
                                             {'message_id': response.data['assistant_message']['id']}, format='json')
                    self.assertEqual(replay.status_code, 200)
                    self.assertEqual(self.report(session)['progress']['evaluated_responses'], evaluated)
                    self.send(session, value='vocabulary')
                    self.send(session, value='next', kind='preparation')
                    self.send(session, value='next', kind='preparation')
                    self.send(session, text=session.guided_state['speaking']['last_question'])
                    self.send(session, value='resume_simulation')
                    self.assertEqual(session.guided_state['speaking']['last_question'], before['last_question'])
                    for answer, target, question in [
                        ('My name is Gabriel.', 'instructions', 'Is this your first class?'),
                        ('Yes, I understand.', 'farewell', 'Ready to train?'), ('Thank you!', 'END', ''),
                    ]:
                        self.patches['generate_speaking_turn'].return_value = follow_up(answer, target, question)
                        response = self.send(session, text=answer)
                    summary = response.data['assistant_message']['metadata']['speaking_report']
                    self.assertEqual(summary['progress']['situations_completed'], 1)
                    self.assertGreater(summary['progress']['activities_completed'], 0)
                    self.assertEqual(summary['level'], level)
                    self.send(session, value='new_challenge')
                    self.assertEqual(session.guided_state['speaking']['phase'], 'LEARN')
                    self.assertEqual(self.report(session)['progress']['situations_completed'], 1)
                    response = self.send(session, value='finalize_session', kind='session_control')
                    self.assertEqual(session.status, 'completed')
                    self.assertEqual(self.report(session)['status'], 'completed')
                    reloaded = self.client.get(f'/api/ai-study/sessions/{session.id}/')
                    self.assertEqual(reloaded.data['messages'][-1]['metadata']['speaking_report'], self.report(session))

    def test_early_exit_is_honest_and_finalization_is_idempotent(self):
        session = self.pending()
        response = self.send(session, value='finalize_session', kind='session_control')
        report = response.data['assistant_message']['metadata']['speaking_report']
        self.assertEqual(report['progress']['evaluated_responses'], 0)
        self.assertEqual(report['progress']['situations_completed'], 0)
        for key in ['strengths', 'vocabulary', 'phrases_used', 'recurring_errors']:
            self.assertEqual(report[key], [])
        completed_at = session.speaking_reports.get().completed_at
        self.send(session, value='finalize_session', kind='session_control')
        self.assertEqual(session.speaking_reports.count(), 1)
        self.assertEqual(session.speaking_reports.get().completed_at, completed_at)
        count = session.messages.count()
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/message/', {'text': 'Another answer'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(session.messages.count(), count)

    def test_repeated_difficulties_and_guided_recovery_use_observed_evidence(self):
        session = self.pending()
        bad = make_turn('SIMULATE', 'struggling', 'I name Ana.')
        bad['difficulty'] = 'Use My name is para se apresentar.'
        self.patches['generate_speaking_turn'].return_value = bad
        self.send(session, text='I name Ana.')
        bad['next_phase'] = 'PRACTICE'
        bad['content']['demonstration'] = 'My name is Ana.'
        bad['content']['demonstration_translation'] = 'Meu nome é Ana.'
        self.send(session, text='I name Ana.')
        self.assertTrue(session.guided_state['speaking']['simulation']['return_point'])
        report = self.report(session)
        self.assertEqual(report['progress']['successful_responses'], 0)
        self.assertEqual(report['recurring_errors'][0]['occurrences'], 2)
        self.assertEqual(report['recurring_errors'][0]['evidence'], ['I name Ana.', 'I name Ana.'])
        self.assertEqual(report['strengths'], [])
        self.assertIn('My name is', report['recommendations'][0]['text'])
        self.send(session, value='resume_simulation')
        self.patches['generate_speaking_turn'].return_value = follow_up()
        self.send(session, text='My name is Gabriel.')
        self.assertEqual(self.report(session)['progress']['successful_responses'], 1)
        self.assertEqual(self.report(session)['vocabulary'][0]['successful_uses'], 1)

    def test_summary_resume_preserves_preparation_step_without_consuming_an_activity(self):
        session = self.pending()
        self.send(session, value='vocabulary')
        before = deepcopy(session.guided_state['speaking'])
        self.send(session, value='end_session', kind='session_control')
        self.assertEqual(self.report(session)['status'], 'paused')
        self.send(session, value='review_summary', kind='quick_action')
        self.send(session, value='continue_session', kind='session_control')
        self.assertEqual(session.guided_state['speaking']['preparation'], before['preparation'])
        self.assertEqual(self.report(session)['progress']['evaluated_responses'], 0)
        self.assertEqual(self.report(session)['status'], 'active')

    def test_new_challenges_and_scenarios_preserve_history_without_mixing_runs(self):
        session = self.pending()
        self.patches['generate_speaking_turn'].return_value = follow_up()
        self.send(session, text='My name is Gabriel.')
        run_id = self.report(session)['run_id']
        self.send(session, value='new_challenge')
        self.assertEqual(session.guided_state['speaking']['run_id'], run_id)
        self.send(session, value='finalize_session', kind='session_control')
        original = deepcopy(self.report(session))
        self.send(session, value='new_scenario', kind='session_control')
        self.send(session, value='restaurant', kind='scenario')
        self.assertNotEqual(session.guided_state['speaking']['run_id'], run_id)
        self.send(session, value='finalize_session', kind='session_control')
        self.assertEqual(session.speaking_reports.count(), 2)
        self.assertEqual(session.speaking_reports.get(run_id=run_id).report, original)
        current = session.speaking_reports.exclude(run_id=run_id).get().report
        self.assertEqual(current['phrases_used'], [])

    def test_audio_retry_and_failed_provider_do_not_duplicate_report_evidence(self):
        session = self.pending()
        request_id = str(uuid.uuid4())
        self.patches['generate_speaking_turn'].return_value = follow_up()
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            for _ in range(2):
                response = self.client.post(f'/api/ai-study/sessions/{session.id}/audio/', {
                    'audio': SimpleUploadedFile('voice.webm', b'voice', content_type='audio/webm'), 'request_id': request_id,
                }, format='multipart')
                self.assertEqual(response.status_code, 201)
        report = self.report(session)
        self.assertEqual(report['progress']['evaluated_responses'], 1)
        self.assertEqual(report['phrases_used'][0]['source'], 'transcript')
        self.assertFalse(report['pronunciation_assessed'])
        self.patches['generate_speaking_turn'].return_value = {}
        failed = self.client.post(f'/api/ai-study/sessions/{session.id}/message/', {'text': 'Yes.'}, format='json')
        self.assertEqual(failed.status_code, 503)
        self.assertEqual(self.report(session), report)

    def test_teacher_admin_student_and_group_access_are_scoped_and_read_only(self):
        session = self.pending()
        self.send(session, value='finalize_session', kind='session_control')
        record = session.speaking_reports.get()
        url = f'/api/ai-study/speaking-reports/{record.id}/'
        teacher = User.objects.create_user(email='teacher-reports@test.com', role='teacher')
        outsider = User.objects.create_user(email='outsider-reports@test.com', role='teacher')
        other = User.objects.create_user(email='other-reports@test.com', role='student')
        admin = User.objects.create_user(email='admin-reports@test.com', role='admin')
        group = StudentGroup.objects.create(name='Speaking group', teacher=teacher)
        group.students.add(self.student)
        for user, expected in [(teacher, 200), (admin, 200), (self.student, 200), (outsider, 404), (other, 404)]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url).status_code, expected)
            self.assertEqual(self.client.get('/api/ai-study/speaking-reports/', {'student': self.student.id}).data['count'], 1 if expected == 200 else 0)
        self.client.force_authenticate(teacher)
        self.assertEqual(self.client.get('/api/ai-study/speaking-reports/', {'student': 'invalid'}).status_code, 400)
        overview = self.client.get('/api/ai-study/progress/overview/', {'student': self.student.id})
        self.assertEqual(overview.data['speaking_sessions']['completed'], 1)
        self.assertEqual(self.client.post(url, {'status': 'active'}).status_code, 405)
        self.assertEqual(self.client.post(f'/api/ai-study/sessions/{session.id}/message/', {'text': 'Teacher impersonation'}).status_code, 403)
        self.assertEqual(self.client.get(f'/api/ai-study/sessions/{session.id}/').status_code, 200)
        group.students.remove(self.student)
        self.assertEqual(self.client.get(url).status_code, 404)
        Lesson.objects.create(student=self.student, teacher=teacher, title='Individual', level='A1')
        self.assertEqual(self.client.get(url).status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url).status_code, 401)

    def test_legacy_saved_evidence_is_visible_without_inventing_classification(self):
        session = self.pending()
        engine = session.guided_state['speaking']
        engine['simulation']['exchanges'] = [{'answer': 'My name is Gabriel.', 'evidence': 'Gabriel', 'question': "What's your name?", 'step_id': 'introduction'}]
        engine['difficulties'] = [{'kind': 'struggling', 'evidence': 'I name', 'detail': 'Use My name is.', 'phase': 'SIMULATE'}]
        session.save()
        self.send(session, value='finalize_session', kind='session_control')
        report = self.report(session)
        self.assertEqual(report['phrases_used'][0]['source'], 'history')
        self.assertEqual(report['progress']['successful_responses'], 0)
        self.assertEqual(report['strengths'], [])
        self.assertEqual(report['vocabulary'][0]['successful_uses'], 0)
        self.assertEqual(report['difficulties'][0]['evidence'], ['I name'])

    def test_backfill_recovers_saved_history_without_ai_and_is_idempotent(self):
        session = self.pending()
        session.status = 'completed'
        session.save()
        original = deepcopy(session.guided_state)
        call_command('backfill_speaking_reports', dry_run=True, stdout=StringIO())
        self.assertEqual(session.speaking_reports.count(), 0)
        session.refresh_from_db()
        self.assertEqual(session.guided_state, original)
        call_command('backfill_speaking_reports', stdout=StringIO())
        self.assertEqual(session.speaking_reports.get().status, 'completed')
        self.assertIsNone(session.speaking_reports.get().completed_at)
        self.assertEqual(session.speaking_reports.get().updated_at, session.last_interaction_at)
        report = deepcopy(session.speaking_reports.get().report)
        call_command('backfill_speaking_reports', stdout=StringIO())
        self.assertEqual(session.speaking_reports.count(), 1)
        self.assertEqual(session.speaking_reports.get().report, report)
        self.send(session, value='finalize_session', kind='session_control')
        self.assertIsNone(session.speaking_reports.get().completed_at)
        self.patches['generate_speaking_turn'].assert_not_called()
        self.patches['transcribe'].assert_not_called()
