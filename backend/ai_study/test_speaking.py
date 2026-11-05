from copy import deepcopy
import json
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from lessons.models import Lesson
from . import speaking
from .models import AIStudySession, SpeakingFeedback
from .services import AIStudyOpenAIService, AIStudyWorkflowService


def make_plan():
    """Provider fixture only; production contains no theme-specific scripts."""
    situation = {
        'id': 'meet_teacher', 'label': 'Conhecer o professor',
        'context': 'Você chegou à academia para sua primeira aula de Jiu-Jitsu e o professor está na entrada.',
        'ai_role': 'o professor', 'student_role': 'um aluno novo',
        'objective': 'conhecer o professor e combinar o início do treino.',
        'sequence': [
            {'id': 'introduction', 'label': 'Apresentação', 'goal': 'Dizer o nome',
             'possible_responses': ['My name is Ana.', 'I am Ana.'],
             'branches': [{'learner_intent': 'Se apresentar', 'next_step_id': 'instructions'}]},
            {'id': 'instructions', 'label': 'Instruções', 'goal': 'Entender onde treinar',
             'possible_responses': ['On the mat?', 'Yes, I understand.'],
             'branches': [{'learner_intent': 'Confirmar instrução', 'next_step_id': 'farewell'}]},
            {'id': 'farewell', 'label': 'Despedida', 'goal': 'Agradecer e encerrar',
             'possible_responses': ['Thank you!', 'See you!'],
             'branches': [{'learner_intent': 'Encerrar', 'next_step_id': 'END'}]},
        ],
        'vocabulary': [
            {'expression': 'My name is', 'translation': 'Meu nome é', 'example': 'My name is Ana.',
             'example_translation': 'Meu nome é Ana.'},
            {'expression': 'mat', 'translation': 'tatame', 'example': 'I am on the mat.',
             'example_translation': 'Estou no tatame.'},
        ],
    }
    alternative = deepcopy(situation)
    alternative.update(id='meet_partner', label='Conversar com outro aluno', ai_role='um colega de treino',
                       context='Você está no tatame antes do treino e um colega se aproxima para conhecer você.')
    return {'situations': [situation, alternative]}


def make_turn(phase='PRACTICE', observation='not_evaluated', evidence='', next_step_id=''):
    return {
        'observation': observation, 'evidence': evidence, 'difficulty': '',
        'next_phase': phase, 'next_step_id': next_step_id,
        'content': {
            'feedback': '', 'instruction': 'Vamos tentar juntos.',
            'demonstration': 'My name is Ana.' if phase in {'LEARN', 'PRACTICE'} else '',
            'demonstration_translation': 'Meu nome é Ana.' if phase in {'LEARN', 'PRACTICE'} else '',
            'question': '' if phase == 'FEEDBACK' else "What's your name?",
            'question_translation': '' if phase == 'FEEDBACK' else 'Qual é seu nome?',
            'response_starter': '', 'response_starter_translation': '',
        },
    }


class SpeakingEngineTests(SimpleTestCase):
    def setUp(self):
        self.engine = speaking.start_session(speaking.validate_plan(make_plan(), 'A1', 'Aula de Jiu-Jitsu'))
        speaking.opening(self.engine, 'A1')

    def practice(self):
        return speaking.advance(self.engine, 'A1', 'not_evaluated', '', 'Continuar', 'continue')

    def test_level_policies_apply_to_every_cefr_level(self):
        previous_words = 0
        for level in ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']:
            with self.subTest(level=level):
                policy = speaking.level_policy(level)
                self.assertGreaterEqual(policy['max_words'], previous_words)
                previous_words = policy['max_words']
                self.assertEqual(policy['translations'], level in {'A1', 'A2'})
                for key in ['instructions', 'vocabulary', 'grammar', 'support', 'simulation']:
                    self.assertTrue(policy[key])
                speaking.validate_plan(make_plan(), level, 'tema personalizado')
                # The same answer requires more preparation at A1/A2.
                state = speaking.advance(self.engine, level, 'ready', '', 'Vamos')
                state = speaking.advance(state, level, 'adequate', 'My name is Ana.', 'My name is Ana.')
                self.assertEqual(state['phase'], 'PRACTICE' if level in {'A1', 'A2'} else 'SIMULATE')

    def test_custom_beginner_opening_has_context_roles_and_translated_demonstration(self):
        text = speaking.opening(self.engine, 'A1')
        self.assertIn('academia', text)
        self.assertIn('professor', text)
        self.assertIn('My name is Ana. — Meu nome é Ana.', text)
        self.assertNotIn('Imagine', text)
        self.assertEqual(self.engine['phase'], 'LEARN')

    def test_server_rejects_skipping_preparation_even_if_ai_requests_it(self):
        with self.assertRaises(ValueError):
            speaking.apply_turn(self.engine, 'A1', make_turn('SIMULATE', 'mastered', 'Hello'), 'Hello')
        self.assertEqual(self.engine['phase'], 'LEARN')

    def test_mastery_accelerates_practice_but_requires_an_observed_answer(self):
        state = self.practice()
        with self.assertRaises(ValueError):
            speaking.advance(state, 'A1', 'mastered', 'invented quote', 'My name is Ana.')
        updated = speaking.advance(state, 'A1', 'mastered', 'My name is Ana.', 'My name is Ana.')
        self.assertEqual(updated['phase'], 'SIMULATE')
        self.assertEqual(updated['transition_reason'], 'demonstrated_mastery')
        self.assertEqual(updated['practiced_vocabulary'], ['My name is'])

    def test_vocabulary_tracking_uses_whole_words(self):
        state = speaking.advance(self.practice(), 'A1', 'adequate', 'format', 'format')
        self.assertNotIn('mat', state['practiced_vocabulary'])

    def test_clicking_actions_never_awards_mastery_or_completes_steps(self):
        state = self.practice()
        for action in ['continue', 'simulation', 'new_challenge', 'increase_difficulty', 'retry']:
            with self.subTest(action=action):
                updated = speaking.advance(state, 'A1', 'mastered', 'fake', 'button label', action)
                self.assertEqual(updated['phase'], 'PRACTICE')
                self.assertEqual(updated['successful_turns'], 0)
                self.assertEqual(updated['completed_step_ids'], [])

    def test_difficulty_reinforces_without_losing_situation_or_simulation_position(self):
        state = self.practice()
        for _ in range(2):
            state = speaking.advance(state, 'A1', 'struggling', 'Não sei', 'Não sei')
        self.assertEqual(state['phase'], 'LEARN')
        self.assertEqual(state['situation_id'], self.engine['situation_id'])
        self.assertEqual(len(state['difficulties']), 2)
        state['phase'] = 'SIMULATE'
        state['step_index'] = 1
        for _ in range(2):
            state = speaking.advance(state, 'A1', 'struggling', 'Não sei', 'Não sei')
        self.assertEqual(state['phase'], 'PRACTICE')
        self.assertEqual(state['step_index'], 1)

    def test_existing_help_preserves_last_question_and_does_not_consume_attempt(self):
        state = self.practice()
        for action in ['vocabulary', 'grammar', 'pronunciation']:
            with self.subTest(action=action):
                updated = speaking.advance(state, 'A1', 'mastered', '', '', action)
                self.assertEqual(updated['phase_turns'], 0)
                self.assertEqual(updated['last_question'], state['last_question'])
                self.assertEqual(updated['help_used'][-1]['action'], action)
        turn = make_turn()
        turn['content']['question'] = 'Unrelated question?'
        with self.assertRaises(ValueError):
            speaking.apply_turn(state, 'A1', turn, '', 'grammar')

    def test_sequence_progresses_to_feedback_and_rejects_unplanned_branches(self):
        state = self.practice()
        state = speaking.advance(state, 'A1', 'mastered', 'My name is Ana.', 'My name is Ana.')
        with self.assertRaises(ValueError):
            speaking.advance(state, 'A1', 'adequate', 'Ana', 'Ana', next_step_id='unrelated')
        for target in ['instructions', 'farewell', 'END']:
            state = speaking.advance(state, 'A1', 'adequate', 'Yes', 'Yes', next_step_id=target)
        self.assertEqual(state['phase'], 'FEEDBACK')
        self.assertEqual(state['completed_step_ids'], ['introduction', 'instructions', 'farewell'])

    def test_plan_rejects_vague_context_duplicates_invalid_branches_and_advanced_a1_phrases(self):
        for mutation in ['vague', 'duplicates', 'branch', 'phrase', 'translation']:
            with self.subTest(mutation=mutation):
                plan = make_plan()
                situation = plan['situations'][0]
                if mutation == 'vague':
                    situation['context'] = 'Imagine uma situação qualquer relacionada ao tema e responda em inglês agora.'
                elif mutation == 'duplicates':
                    plan['situations'][1]['id'] = situation['id']
                elif mutation == 'branch':
                    situation['sequence'][0]['branches'][0]['next_step_id'] = 'missing'
                elif mutation == 'phrase':
                    situation['vocabulary'][0]['example'] = 'This is a deliberately lengthy and overly complicated sentence for a beginner.'
                else:
                    situation['vocabulary'][0]['translation'] = ''
                with self.assertRaises(ValueError):
                    speaking.validate_plan(plan, 'A1', 'Aula de Jiu-Jitsu')

    def test_beginner_turn_requires_demonstration_translation_and_short_question(self):
        for field in ['demonstration', 'demonstration_translation', 'question_translation']:
            turn = make_turn()
            turn['content'][field] = ''
            with self.subTest(field=field), self.assertRaises(ValueError):
                speaking.apply_turn(self.practice(), 'A1', turn, 'help')


class SpeakingIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(email='speaking@test.com', password='123', role='student', level='A1')
        self.client.force_authenticate(self.student)
        self.plan_patch = patch.object(AIStudyOpenAIService, 'plan_speaking_session', return_value=make_plan())
        self.plan_mock = self.plan_patch.start()
        self.addCleanup(self.plan_patch.stop)
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.media.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    def create_session(self, theme='Aula de Jiu-Jitsu', level='A1'):
        response = self.client.post('/api/ai-study/sessions/', {'mode': 'speaking'}, format='json')
        session_id = response.data['id']
        self.message(session_id, text=theme)
        response = self.message(session_id, action={'action_type': 'level', 'value': level})
        self.assertEqual(response.status_code, 200, response.data)
        session = AIStudySession.objects.get(id=session_id)
        # These tests isolate the Phase 1 tutor after vocabulary preparation.
        # The real Phase 2 path is covered in test_speaking_preparation.py.
        session.guided_state['speaking']['preparation']['step'] = 'COMPLETE'
        session.save(update_fields=['guided_state'])
        return session

    def message(self, session_id, text='', action=None):
        return self.client.post(f'/api/ai-study/sessions/{session_id}/message/',
                                {'guided_action': action} if action else {'text': text}, format='json')

    def test_custom_and_predefined_scenarios_all_levels_use_generated_plan(self):
        for level in speaking.LEVEL_POLICIES:
            with self.subTest(level=level):
                session = self.create_session(level=level)
                self.assertEqual(session.guided_state['speaking']['phase'], 'LEARN')
                self.assertEqual(session.guided_state['level'], level)
                self.assertTrue(session.messages.last().metadata['choices'])
                self.assertEqual(self.plan_mock.call_args.args[1]['level'], level)
        session = self.create_session(theme='Restaurante')
        response = self.message(session.id, action={'action_type': 'session_control', 'value': 'change_scenario'})
        response = self.message(session.id, action={'action_type': 'scenario', 'value': 'restaurant'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['session']['guided_state']['scenario_key'], 'restaurant')
        self.assertEqual(response.data['session']['guided_state']['level'], 'A1')

    def test_situation_choice_reuses_plan_and_state_is_recoverable(self):
        session = self.create_session()
        response = self.message(session.id, action={'action_type': 'situation', 'value': 'meet_partner'})
        self.assertEqual(response.status_code, 200)
        detail = self.client.get(f'/api/ai-study/sessions/{session.id}/').data
        state = detail['guided_state']['speaking']
        self.assertEqual(state['situation_id'], 'meet_partner')
        self.assertEqual(state['preparation']['step'], 'WORD')
        self.assertEqual(state['last_question'], '')
        self.assertEqual(len(state['plan']['situations']), 2)
        self.plan_mock.assert_called_once()

    def test_custom_scenario_button_persists_onboarding_step(self):
        response = self.client.post('/api/ai-study/sessions/', {'mode': 'speaking'})
        session_id = response.data['id']
        response = self.message(session_id, action={'action_type': 'scenario', 'value': 'custom'})
        self.assertEqual(response.data['session']['guided_state']['stage'], 'await_custom_scenario')
        response = self.message(session_id, text='Aula de Jiu-Jitsu')
        self.assertEqual(response.data['session']['guided_state']['stage'], 'choose_level')
        response = self.message(session_id, action={'action_type': 'level', 'value': 'A1'})
        self.assertEqual(response.data['session']['guided_state']['speaking']['phase'], 'LEARN')

    @patch.object(AIStudyOpenAIService, 'generate_speaking_turn')
    def test_manual_summary_can_resume_or_finalize_using_existing_actions(self, turn_mock):
        session = self.create_session()
        turn_mock.return_value = make_turn()
        self.message(session.id, action={'action_type': 'quick_action', 'value': 'continue'})
        response = self.message(session.id, action={'action_type': 'session_control', 'value': 'end_session'})
        self.assertEqual(response.data['session']['guided_state']['speaking']['phase'], 'FEEDBACK')
        response = self.message(session.id, action={'action_type': 'session_control', 'value': 'continue_session'})
        self.assertEqual(response.data['session']['guided_state']['speaking']['phase'], 'PRACTICE')
        self.message(session.id, action={'action_type': 'session_control', 'value': 'end_session'})
        response = self.message(session.id, action={'action_type': 'session_control', 'value': 'finalize_session'})
        self.assertEqual(response.data['session']['status'], 'completed')

    @patch.object(AIStudyOpenAIService, 'generate_speaking_turn')
    def test_help_records_usage_and_preserves_question_across_reload(self, turn_mock):
        session = self.create_session()
        turn_mock.return_value = make_turn()
        self.message(session.id, action={'action_type': 'quick_action', 'value': 'continue'})
        response = self.message(session.id, action={'action_type': 'quick_action', 'value': 'grammar'})
        self.assertEqual(response.status_code, 200)
        detail = self.client.get(f'/api/ai-study/sessions/{session.id}/').data
        state = detail['guided_state']['speaking']
        self.assertEqual(state['last_question'], "What's your name?")
        self.assertEqual(state['phase_turns'], 0)
        self.assertEqual(state['help_used'][-1]['action'], 'grammar')

    @patch.object(AIStudyOpenAIService, 'generate_speaking_turn')
    def test_adaptive_progress_keeps_relevant_history_and_observed_vocabulary(self, turn_mock):
        session = self.create_session()
        turn_mock.return_value = make_turn()
        response = self.message(session.id, action={'action_type': 'quick_action', 'value': 'continue'})
        self.assertEqual(response.data['session']['guided_state']['speaking']['phase'], 'PRACTICE')
        turn_mock.return_value = make_turn('SIMULATE', 'mastered', 'My name is Gabriel.')
        response = self.message(session.id, text='My name is Gabriel.')
        state = response.data['session']['guided_state']['speaking']
        self.assertEqual(state['phase'], 'SIMULATE')
        self.assertIn('My name is', state['practiced_vocabulary'])
        turn_mock.return_value = make_turn('SIMULATE', 'adequate', 'My name is Gabriel.', 'instructions')
        turn_mock.return_value['content']['question'] = 'Is this your first class?'
        response = self.message(session.id, text='My name is Gabriel.')
        self.assertEqual(response.data['session']['guided_state']['speaking']['step_index'], 1)
        session.refresh_from_db()
        self.assertEqual(session.messages.filter(role='user', text='My name is Gabriel.').count(), 2)

    @patch.object(AIStudyOpenAIService, 'generate_speaking_turn')
    def test_complete_session_persists_feedback_after_the_situation_goal(self, turn_mock):
        session = self.create_session()
        turn_mock.return_value = make_turn()
        self.message(session.id, action={'action_type': 'quick_action', 'value': 'continue'})
        turn_mock.return_value = make_turn('SIMULATE', 'mastered', 'My name is Ana.')
        self.message(session.id, text='My name is Ana.')
        for answer, target, phase in [
            ('My name is Ana.', 'instructions', 'SIMULATE'),
            ('Yes, on the mat.', 'farewell', 'SIMULATE'),
            ('Thank you!', 'END', 'FEEDBACK'),
        ]:
            turn_mock.return_value = make_turn(phase, 'adequate', answer, target)
            if phase == 'SIMULATE':
                turn_mock.return_value['content']['question'] = 'Is this your first class?' if target == 'instructions' else 'Ready to train?'
            response = self.message(session.id, text=answer)
            self.assertEqual(response.status_code, 200)
        session.refresh_from_db()
        state = session.guided_state['speaking']
        self.assertEqual(state['phase'], 'FEEDBACK')
        self.assertEqual(state['last_question'], '')
        self.assertEqual(state['completed_step_ids'], ['introduction', 'instructions', 'farewell'])
        self.assertEqual(state['practiced_vocabulary'], ['My name is', 'mat'])
        self.assertEqual(session.messages.last().metadata['pedagogical_phase'], 'FEEDBACK')
        self.assertEqual(session.guided_state['expected_input'], 'choice')

    @patch.object(AIStudyOpenAIService, 'generate_speaking_turn')
    def test_bad_ai_contract_rolls_back_message_and_progress_and_can_retry(self, turn_mock):
        session = self.create_session()
        before = deepcopy(session.guided_state)
        count = session.messages.count()
        turn_mock.return_value = make_turn('SIMULATE', 'mastered', 'Hello')
        response = self.message(session.id, text='Hello')
        self.assertEqual(response.status_code, 503)
        session.refresh_from_db()
        self.assertEqual(session.guided_state, before)
        self.assertEqual(session.messages.count(), count)
        self.assertEqual(turn_mock.call_count, 2)
        turn_mock.return_value = make_turn('PRACTICE', 'ready')
        self.assertEqual(self.message(session.id, text='Vamos').status_code, 200)

    def test_invalid_plan_keeps_onboarding_and_does_not_invent_a_scenario(self):
        self.plan_mock.return_value = {'situations': []}
        response = self.client.post('/api/ai-study/sessions/', {'mode': 'speaking'})
        session = AIStudySession.objects.get(id=response.data['id'])
        self.message(session.id, text='Tema novo')
        count = session.messages.count()
        response = self.message(session.id, action={'action_type': 'level', 'value': 'A1'})
        self.assertEqual(response.status_code, 503)
        session.refresh_from_db()
        self.assertEqual(session.guided_state['stage'], 'choose_level')
        self.assertEqual(session.messages.count(), count)

    @patch.object(AIStudyOpenAIService, 'transcribe', return_value='My name is Gabriel.')
    @patch.object(AIStudyOpenAIService, 'generate_speaking_turn')
    def test_audio_uses_same_engine_without_inventing_acoustic_scores(self, turn_mock, _transcribe):
        session = self.create_session()
        turn_mock.return_value = make_turn('PRACTICE', 'ready')
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/audio/',
                                    {'audio': SimpleUploadedFile('voice.webm', b'audio', content_type='audio/webm')}, format='multipart')
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data['feedback'])
        self.assertEqual(response.data['user_message']['content_type'], 'audio')
        self.assertEqual(response.data['user_message']['text'], 'My name is Gabriel.')
        self.assertEqual(response.data['session']['guided_state']['speaking']['phase'], 'PRACTICE')
        self.assertFalse(SpeakingFeedback.objects.filter(session=session).exists())
        self.assertEqual(session.speaking_audios.get().status, 'transcribed')

    @patch.object(AIStudyOpenAIService, 'transcribe', return_value='')
    def test_empty_transcript_keeps_context_and_offers_text_alternative(self, _transcribe):
        session = self.create_session()
        before = deepcopy(session.guided_state)
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/audio/',
                                    {'audio': SimpleUploadedFile('voice.webm', b'audio', content_type='audio/webm')}, format='multipart')
        self.assertEqual(response.status_code, 503)
        self.assertIn('texto', str(response.data))
        session.refresh_from_db()
        self.assertEqual(session.guided_state, before)
        self.assertEqual(session.speaking_audios.get().status, 'failed')

    @patch.object(AIStudyOpenAIService, 'transcribe', return_value='Ready')
    @patch.object(AIStudyOpenAIService, 'generate_speaking_turn', return_value={})
    def test_audio_generation_failure_rolls_back_messages_and_phase(self, _turn, _transcribe):
        session = self.create_session()
        before = deepcopy(session.guided_state)
        count = session.messages.count()
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/audio/',
                                    {'audio': SimpleUploadedFile('voice.webm', b'audio', content_type='audio/webm')}, format='multipart')
        self.assertEqual(response.status_code, 503)
        session.refresh_from_db()
        self.assertEqual(session.guided_state, before)
        self.assertEqual(session.messages.count(), count)
        self.assertEqual(session.speaking_audios.get().status, 'failed')

    @patch.object(AIStudyOpenAIService, 'estimate_level_from_assessment', return_value={
        'estimated_level': 'A1', 'rationale': 'Respostas iniciais curtas.', 'focus_points': []})
    def test_unknown_level_assessment_still_starts_with_learning(self, _estimate):
        response = self.client.post('/api/ai-study/sessions/', {'mode': 'speaking'})
        session_id = response.data['id']
        self.message(session_id, text='Aula de Jiu-Jitsu')
        self.message(session_id, action={'action_type': 'level', 'value': 'unknown'})
        for _ in range(3):
            response = self.message(session_id, text='My name is Ana.')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['session']['guided_state']['level_source'], 'estimated')
        self.assertEqual(response.data['session']['guided_state']['speaking']['phase'], 'LEARN')

    def test_legacy_session_gets_plan_without_losing_history(self):
        session = AIStudySession.objects.create(student=self.student, mode='speaking', title='Antiga')
        session.messages.create(role='user', text='Previous conversation')
        response = self.message(session.id, text='Hello')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['session']['guided_state']['speaking']['phase'], 'LEARN')
        self.assertTrue(session.messages.filter(text='Previous conversation').exists())

    def test_persisted_pedagogy_uses_existing_session_access_rules(self):
        session = self.create_session()
        other = User.objects.create_user(email='other-speaking@test.com', password='123', role='student')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'/api/ai-study/sessions/{session.id}/').status_code, 404)
        teacher = User.objects.create_user(email='speaking-teacher@test.com', password='123', role='teacher')
        Lesson.objects.create(title='English', student=self.student, teacher=teacher, level='A1')
        self.client.force_authenticate(teacher)
        response = self.client.get(f'/api/ai-study/sessions/{session.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['guided_state']['speaking']['phase'], 'LEARN')

    @patch('ai_study.services.client.chat.completions.create')
    def test_provider_receives_level_plan_history_and_pending_question(self, create_mock):
        session = self.create_session()
        create_mock.return_value = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content=json.dumps(make_turn()), refusal=None))])
        AIStudyOpenAIService.generate_speaking_turn(session, session.guided_state, 'Can you help?')
        kwargs = create_mock.call_args.kwargs
        self.assertEqual(kwargs['response_format']['json_schema']['name'], 'speaking_pedagogical_turn')
        self.assertTrue(kwargs['response_format']['json_schema']['strict'])
        payload = json.loads(kwargs['messages'][1]['content'])
        self.assertEqual(payload['policy'], speaking.level_policy('A1'))
        self.assertEqual(payload['session']['last_question'], session.guided_state['speaking']['last_question'])
        self.assertTrue(payload['history'])
        self.assertIn('pronunciation', kwargs['messages'][0]['content'])
