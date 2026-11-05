from copy import deepcopy
import json
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from . import speaking, speaking_simulation as simulation
from .models import AIStudySession
from .services import AIStudyOpenAIService, AIStudyWorkflowService
from .test_speaking import make_plan, make_turn
from .test_speaking_preparation import assessment


def pending_engine():
    plan = make_plan()
    plan['situations'][0]['sequence'][0]['branches'].append(
        {'learner_intent': 'Já conhece as instruções', 'next_step_id': 'farewell'})
    engine = speaking.start_session(plan)
    engine['phase'] = 'SIMULATE'
    engine['last_question'] = "What's your name?"
    engine['preparation'] = {'step': 'COMPLETE'}
    engine = simulation.ensure(engine)
    engine['simulation']['last_content'] = make_turn('SIMULATE')['content']
    return engine


def help_response():
    return {
        'explanation': 'O professor quer saber seu nome. Você pode se apresentar.',
        'translation': 'Qual é seu nome?', 'hint': 'Comece com My name is...',
        'examples': [{'text': 'My name is Ana.', 'translation': 'Meu nome é Ana.'},
                     {'text': 'I am Gabriel.', 'translation': 'Eu sou Gabriel.'}],
        'grammar': 'Use My name is para se apresentar. Exemplo: My name is Ana.',
    }


def follow_up(answer='My name is Gabriel.', target='instructions', question='Is this your first class?'):
    result = make_turn('FEEDBACK' if target == 'END' else 'SIMULATE', 'adequate', answer, target)
    result['content']['question'] = '' if target == 'END' else question
    result['content']['question_translation'] = '' if target == 'END' else 'Esta é sua primeira aula?'
    result['content']['feedback'] = 'Nice to meet you, Gabriel!' if target != 'END' else 'Thanks! See you in class.'
    return result


def new_situation():
    result = deepcopy(make_plan()['situations'][1])
    result.update(id='new_class', context='Você terminou o primeiro treino e encontra outro colega na saída da academia para combinar a próxima aula.')
    return result


class SimulationStateTests(SimpleTestCase):
    def setUp(self):
        self.engine = pending_engine()

    def test_all_explanatory_actions_have_specific_validated_outputs(self):
        expected = {'not_understood': 'explanation', 'hint': 'hint', 'translate': 'translation', 'grammar': 'grammar'}
        for level in speaking.LEVEL_POLICIES:
            for action in simulation.HELP_ACTIONS:
                result = simulation.validate_help(help_response(), action, level)
                text = simulation.render_help(result, action)
                self.assertTrue(text)
                if action in expected:
                    self.assertEqual(text, result[expected[action]])
                else:
                    self.assertIn('My name is Ana. — Meu nome é Ana.', text)

    def test_help_never_counts_as_a_learner_turn_or_changes_question(self):
        for action in simulation.HELP_ACTIONS | {'repeat', 'continue'}:
            updated = simulation.record_help(self.engine, action)
            for key in ['turn_count', 'phase_turns', 'successful_turns', 'step_index', 'last_question', 'completed_step_ids']:
                self.assertEqual(updated[key], self.engine[key])
            self.assertEqual(updated['simulation']['last_content'], self.engine['simulation']['last_content'])
            self.assertEqual(updated['help_used'][-1]['action'], action)

    def test_microactivity_restores_exact_point_but_retains_observed_learning(self):
        engine = simulation.begin_vocabulary(self.engine)
        original = deepcopy(engine['simulation']['return_point'])
        engine['turn_count'] += 4
        engine['practiced_vocabulary'].append('mat')
        engine['difficulties'].append({'phase': 'LEARN', 'evidence': 'Não sei', 'kind': 'struggling'})
        resumed = simulation.resume(json.loads(json.dumps(engine)))
        for key in simulation.RETURN_FIELDS:
            self.assertEqual(resumed.get(key), original[key])
        self.assertEqual(resumed['simulation']['last_content'], original['content'])
        self.assertEqual(resumed['practiced_vocabulary'], ['mat'])
        self.assertEqual(len(resumed['difficulties']), 1)
        self.assertIsNone(resumed['simulation']['return_point'])

    def test_microactivity_selects_vocabulary_related_to_the_pending_step(self):
        engine = deepcopy(self.engine)
        engine['step_index'] = 1
        engine['last_question'] = 'Is this your first class?'
        updated = simulation.begin_vocabulary(engine)
        self.assertEqual(updated['preparation']['item_index'], 1)

    def test_invalid_help_contracts_do_not_produce_empty_or_overcomplex_help(self):
        for action, key in [('hint', 'hint'), ('translate', 'translation'), ('grammar', 'grammar'), ('not_understood', 'explanation')]:
            payload = help_response()
            payload[key] = ''
            with self.assertRaises(ValueError):
                simulation.validate_help(payload, action, 'A1')
        payload = help_response()
        payload['examples'] = payload['examples'][:1]
        with self.assertRaises(ValueError):
            simulation.validate_help(payload, 'examples', 'A1')

    def test_branch_selection_must_be_explicit_and_dialogue_must_advance(self):
        for target, question in [('', 'Is this your first class?'), ('instructions', "What's your name?")]:
            payload = follow_up(target=target, question=question)
            updated, _ = speaking.apply_turn(self.engine, 'A1', payload, 'My name is Gabriel.')
            with self.assertRaises(ValueError):
                simulation.validate_turn(self.engine, updated, payload)

    def test_branch_memory_keeps_actual_response_and_selected_intent_path(self):
        for target in ['instructions', 'farewell']:
            payload = follow_up(target=target)
            updated, content = speaking.apply_turn(self.engine, 'A1', payload, 'My name is Gabriel.')
            simulation.validate_turn(self.engine, updated, payload)
            updated = simulation.remember(self.engine, updated, content, 'My name is Gabriel.', '', 'adequate', 'Gabriel')
            self.assertEqual(updated['simulation']['branch_history'][-1]['to_step_id'], target)
            self.assertEqual(updated['simulation']['exchanges'][0]['answer'], 'My name is Gabriel.')

    def test_long_history_preserves_introductions_and_recent_replies(self):
        engine = self.engine
        for index in range(40):
            engine = simulation.remember(engine, deepcopy(engine), engine['simulation']['last_content'],
                                         'My name is Gabriel.' if index == 0 else f'Answer {index}', '', 'adequate', 'evidence')
        self.assertEqual(len(engine['simulation']['exchanges']), 24)
        self.assertEqual(engine['simulation']['exchanges'][0]['answer'], 'My name is Gabriel.')
        self.assertEqual(engine['simulation']['exchanges'][-1]['answer'], 'Answer 39')
        self.assertEqual(engine['simulation']['support_level'], 'minimal')
        self.assertEqual(engine['simulation']['last_content']['response_starter'], '')

    def test_new_challenge_is_concrete_and_retains_previous_state(self):
        updated = simulation.new_challenge(self.engine, new_situation(), 'A1')
        self.assertEqual(updated['situation_id'], 'new_class')
        self.assertEqual(updated['phase'], 'LEARN')
        self.assertEqual(updated['simulation']['challenge_history'][0]['situation_id'], self.engine['situation_id'])
        with self.assertRaises(ValueError):
            simulation.new_challenge(self.engine, make_plan()['situations'][0], 'A1')

    def test_multiple_challenges_preserve_the_original_plan_contract_and_archive_context(self):
        engine = self.engine
        for index in range(5):
            situation = new_situation()
            situation['id'] = f'challenge_{index}'
            situation['context'] += f' Você está na turma {index + 1}.'
            engine = simulation.new_challenge(engine, situation, 'A1')
            speaking.ScenarioPlan.model_validate(engine['plan'])
            self.assertLessEqual(len(engine['plan']['situations']), 3)
        archived = engine['simulation']['challenge_history'][0]
        self.assertEqual(archived['situation'], speaking.current_situation(self.engine))


class SimulationFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(email='simulation@test.com', role='student', level='A1')
        self.client.force_authenticate(self.student)
        self.session = AIStudySession.objects.create(student=self.student, mode='speaking', title='Aula de Jiu-Jitsu')
        state = {'enabled': True, 'stage': 'active', 'level': 'A1', 'scenario_key': 'custom',
                 'scenario_label': 'Aula de Jiu-Jitsu', 'speaking': pending_engine()}
        AIStudyWorkflowService._sync_speaking_state(state)
        self.session.guided_state = state
        self.session.save(update_fields=['guided_state'])
        self.original_provider = AIStudyOpenAIService.generate_speaking_turn
        self.turn_patch = patch.object(AIStudyOpenAIService, 'generate_speaking_turn', return_value=follow_up())
        self.turn = self.turn_patch.start()
        self.addCleanup(self.turn_patch.stop)
        self.help_patch = patch.object(AIStudyOpenAIService, 'generate_simulation_help', return_value=help_response())
        self.help = self.help_patch.start()
        self.addCleanup(self.help_patch.stop)
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        settings = override_settings(MEDIA_ROOT=self.media.name)
        settings.enable()
        self.addCleanup(settings.disable)
        cache.clear()

    def message(self, text='', action=None, action_type='simulation_help'):
        return self.client.post(f'/api/ai-study/sessions/{self.session.id}/message/',
                                {'guided_action': {'action_type': action_type, 'value': action}} if action else {'text': text}, format='json')

    def engine(self):
        self.session.refresh_from_db()
        return self.session.guided_state['speaking']

    def test_simulation_response_depends_on_answer_and_survives_reload(self):
        response = self.message('My name is Gabriel.')
        self.assertEqual(response.status_code, 200)
        self.assertIn('Gabriel', response.data['assistant_message']['text'])
        engine = self.engine()
        self.assertEqual(engine['step_index'], 1)
        self.assertEqual(engine['simulation']['exchanges'][0]['answer'], 'My name is Gabriel.')
        self.assertEqual(engine['simulation']['last_content']['question'], 'Is this your first class?')
        reloaded = self.client.get(f'/api/ai-study/sessions/{self.session.id}/').data
        self.assertEqual(reloaded['guided_state']['speaking'], engine)

    def test_all_text_help_actions_preserve_turn_counters_and_pending_dialogue(self):
        before = self.engine()
        for action in ['not_understood', 'hint', 'translate', 'examples', 'grammar', 'continue']:
            response = self.message(action=action)
            self.assertEqual(response.status_code, 200, response.data)
            updated = self.engine()
            for key in ['phase', 'step_index', 'turn_count', 'phase_turns', 'last_question', 'completed_step_ids']:
                self.assertEqual(updated[key], before[key])
            self.assertEqual(updated['simulation']['last_content'], before['simulation']['last_content'])
            self.assertTrue(response.data['assistant_message']['text'])
        self.turn.assert_not_called()

    def test_continue_replays_exact_content_without_an_ai_request(self):
        response = self.message(action='continue')
        text = response.data['assistant_message']['text']
        self.message(action='grammar')
        response = self.message(action='continue')
        self.assertEqual(response.data['assistant_message']['text'], text)
        self.turn.assert_not_called()

    @patch.object(AIStudyOpenAIService, 'assess_vocabulary_practice', return_value=assessment())
    def test_vocabulary_microactivity_returns_to_exact_question_and_branch_position(self, _assess):
        self.message(action='continue')
        before = self.engine()
        self.message(action='vocabulary')
        for _ in range(2):
            self.message(action='next', action_type='preparation')
        response = self.message('My name is Ana.')
        self.assertEqual(response.data['assistant_message']['metadata']['speaking_activity']['next'], 'resume_simulation')
        self.assertIn('simulation', self.client.get(f'/api/ai-study/sessions/{self.session.id}/').data['guided_state']['speaking'])
        response = self.message(action='next', action_type='preparation')
        self.assertEqual(response.status_code, 200)
        after = self.engine()
        for key in ['phase', 'step_index', 'completed_step_ids', 'turn_count', 'last_question']:
            self.assertEqual(after[key], before[key])
        self.assertEqual(after['simulation']['last_content'], before['simulation']['last_content'])
        self.assertIn('My name is', after['practiced_vocabulary'])
        self.turn.assert_not_called()
        response = self.message('My name is Gabriel.')
        self.assertEqual(response.data['session']['guided_state']['speaking']['step_index'], 1)

    def test_microactivity_can_be_abandoned_without_consuming_the_simulation_turn(self):
        before = self.engine()
        self.message(action='vocabulary')
        response = self.message(action='resume_simulation')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.engine()['turn_count'], before['turn_count'])
        self.assertEqual(self.engine()['last_question'], before['last_question'])

    def test_summary_pause_resumes_the_pending_microactivity_before_returning_to_simulation(self):
        self.message(action='vocabulary')
        self.message(action='next', action_type='preparation')
        self.message(action='next', action_type='preparation')
        before = self.engine()
        self.message(action='end_session', action_type='session_control')
        response = self.message(action='continue_session', action_type='session_control')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.engine()['preparation'], before['preparation'])
        self.assertEqual(self.engine()['last_question'], before['last_question'])
        self.message(action='resume_simulation')
        self.assertEqual(self.engine()['last_question'], "What's your name?")

    def test_two_branches_follow_different_learner_intents(self):
        self.turn.return_value = follow_up('I know the instructions.', 'farewell', 'Ready to train?')
        response = self.message('I know the instructions.')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.engine()['step_index'], 2)
        self.assertEqual(self.engine()['simulation']['branch_history'][-1]['to_step_id'], 'farewell')
        self.turn.return_value = follow_up('Thank you!', 'END')
        response = self.message('Thank you!')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.engine()['phase'], 'FEEDBACK')
        self.assertEqual(self.engine()['last_question'], '')
        self.assertNotIn('speaking_simulation', response.data['assistant_message']['metadata'])

    def test_invalid_branch_and_restarted_question_roll_back_the_response(self):
        before, count = self.engine(), self.session.messages.count()
        for payload in [follow_up(target='missing'), follow_up(question="What's your name?"), follow_up(target='')]:
            self.turn.return_value = payload
            response = self.message('My name is Gabriel.')
            self.assertEqual(response.status_code, 503)
            self.assertEqual(self.engine(), before)
            self.assertEqual(self.session.messages.count(), count)

    def test_natural_help_request_keeps_the_same_question_even_if_ai_suggests_another(self):
        self.turn.return_value = make_turn('SIMULATE', 'help')
        self.turn.return_value['content']['question'] = 'Unrelated question?'
        before = self.engine()
        response = self.message('Não consigo responder, pode me ajudar?')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.engine()['last_question'], before['last_question'])
        self.assertEqual(self.engine()['turn_count'], before['turn_count'])
        self.assertEqual(self.engine()['help_used'][-1]['action'], 'request')

    def test_repeated_difficulty_opens_reinforcement_with_a_return_point(self):
        payload = make_turn('SIMULATE', 'struggling', 'Não sei')
        payload['content']['question'] = "What's your name?"
        self.turn.return_value = payload
        self.assertEqual(self.message('Não sei').status_code, 200)
        self.turn.return_value = make_turn('PRACTICE', 'struggling', 'Não sei')
        response = self.message('Não sei')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.engine()['preparation']['step'], 'WORD')
        self.assertIsNotNone(self.engine()['simulation']['return_point'])
        self.message(action='resume_simulation')
        self.assertEqual(self.engine()['last_question'], "What's your name?")
        self.assertEqual(len(self.engine()['difficulties']), 2)

    def test_invalid_help_rolls_back_without_losing_context(self):
        self.help.return_value = {**help_response(), 'examples': []}
        before, count = self.engine(), self.session.messages.count()
        response = self.message(action='examples')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.engine(), before)
        self.assertEqual(self.session.messages.count(), count)

    def test_malformed_tutor_payload_is_rejected_without_advancing_the_simulation(self):
        before = self.engine()
        self.turn.return_value = []
        response = self.message('My name is Gabriel.')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.engine(), before)

    @patch.object(AIStudyOpenAIService, 'generate_speaking_challenge', return_value=make_plan()['situations'][0])
    def test_invalid_new_challenge_does_not_erase_the_previous_dialogue(self, _challenge):
        before, count = self.engine(), self.session.messages.count()
        response = self.message(action='new_challenge')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.engine(), before)
        self.assertEqual(self.session.messages.count(), count)

    @patch.object(AIStudyOpenAIService, 'generate_speaking_challenge', return_value=new_situation())
    def test_new_challenge_keeps_theme_level_and_archives_the_previous_situation(self, _challenge):
        response = self.message(action='new_challenge')
        self.assertEqual(response.status_code, 200)
        engine = self.engine()
        self.assertEqual(engine['situation_id'], 'new_class')
        self.assertEqual(engine['phase'], 'LEARN')
        self.assertEqual(engine['simulation']['challenge_history'][0]['last_content']['question'], "What's your name?")
        self.assertEqual(self.session.guided_state['scenario_label'], 'Aula de Jiu-Jitsu')
        self.assertEqual(self.session.guided_state['level'], 'A1')

    @patch.object(AIStudyOpenAIService, 'generate_tts', return_value='/media/repeated-question.mp3')
    def test_repeat_uses_exact_english_question_without_consuming_turn(self, tts):
        response = self.message(action='continue')
        message_id = response.data['assistant_message']['id']
        before, count = self.engine(), self.session.messages.count()
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/simulation-audio/', {'message_id': message_id}, format='json')
        self.assertEqual(response.status_code, 200)
        tts.assert_called_once_with("What's your name?")
        self.assertEqual(self.engine()['turn_count'], before['turn_count'])
        self.assertEqual(self.engine()['help_used'][-1]['action'], 'repeat')
        self.assertEqual(self.session.messages.count(), count)
        self.assertEqual(self.engine()['simulation']['last_content'], before['simulation']['last_content'])

    @patch.object(AIStudyOpenAIService, 'generate_tts')
    def test_repeat_rejects_a_question_from_a_previous_step(self, tts):
        message_id = self.message(action='continue').data['assistant_message']['id']
        self.message('My name is Gabriel.')
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/simulation-audio/', {'message_id': message_id}, format='json')
        self.assertEqual(response.status_code, 400)
        tts.assert_not_called()

    @patch.object(AIStudyOpenAIService, 'generate_tts', side_effect=OSError('unavailable'))
    def test_repeat_failure_leaves_the_pending_dialogue_untouched(self, _tts):
        message_id = self.message(action='continue').data['assistant_message']['id']
        before = self.engine()
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/simulation-audio/', {'message_id': message_id}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.engine(), before)
        self.assertEqual(self.message(action='continue').status_code, 200)

    def test_repeat_cannot_access_another_students_pending_question(self):
        message_id = self.message(action='continue').data['assistant_message']['id']
        other = User.objects.create_user(email='other-simulation@test.com', role='student')
        self.client.force_authenticate(other)
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/simulation-audio/', {'message_id': message_id}, format='json')
        self.assertEqual(response.status_code, 404)

    @patch.object(AIStudyOpenAIService, 'transcribe', return_value='My name is Gabriel.')
    def test_audio_response_continues_the_same_simulation(self, _transcribe):
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/audio/',
                                    {'audio': SimpleUploadedFile('reply.webm', b'audio', content_type='audio/webm')}, format='multipart')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.engine()['simulation']['exchanges'][0]['answer'], 'My name is Gabriel.')
        self.assertEqual(self.engine()['step_index'], 1)

    @patch('ai_study.services.client.chat.completions.create')
    def test_provider_receives_persistent_memory_and_roles_after_help(self, create):
        self.message('My name is Gabriel.')
        self.message(action='grammar')
        self.session.refresh_from_db()
        create.return_value = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content=json.dumps(follow_up('Yes, my first class.', 'farewell', 'Ready to train?')), refusal=None))])
        self.original_provider(self.session, self.session.guided_state, 'Yes, my first class.')
        payload = json.loads(create.call_args.kwargs['messages'][1]['content'])
        self.assertEqual(payload['session']['simulation']['exchanges'][0]['answer'], 'My name is Gabriel.')
        self.assertEqual(payload['session']['plan']['situations'][0]['ai_role'], 'o professor')
        self.assertEqual(payload['session']['last_question'], 'Is this your first class?')
