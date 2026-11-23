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
from . import speaking, speaking_preparation as preparation
from .models import AIStudySession
from .services import AIStudyOpenAIService
from .test_speaking import make_plan, make_turn


def assessment(answer='My name is Ana.', observation='adequate', alternative='My name is Lia.'):
    return {
        'observation': observation, 'evidence': answer, 'feedback': 'Vamos usar a frase do exemplo.',
        'hint': 'Comece pelo modelo e troque apenas o nome.',
        'alternate_example': alternative, 'alternate_example_translation': 'Meu nome é Lia.',
    }


def guided_task(question="What's your name?"):
    return {
        'instruction': 'Agora vamos responder ao professor usando uma frase que aprendemos.',
        'question': question, 'question_translation': 'Qual é seu nome?',
        'model_answer': 'My name is Ana.', 'model_answer_translation': 'Meu nome é Ana.',
        'hint': 'Você pode começar com My name is.',
    }


class VocabularyMicrostepTests(SimpleTestCase):
    def setUp(self):
        self.engine = preparation.start(speaking.start_session(make_plan()))

    def next(self, engine, level='A1'):
        return preparation.transition(engine, level, action='next')

    def repeat(self, engine=None, level='A1'):
        return self.next(self.next(engine or self.engine, level), level)

    def answer(self, engine, text='My name is Ana.', observation='adequate', level='A1', alternative='My name is Lia.'):
        return preparation.transition(engine, level, assessment=assessment(text, observation, alternative), learner_input=text)

    def guided(self):
        engine = self.repeat()
        engine = self.next(self.answer(engine))
        engine = self.repeat(engine)
        engine = self.next(self.answer(engine, 'I am on the mat.'))
        task = preparation.validate_task(guided_task(), engine, 'A1')
        engine['preparation']['task'] = task
        engine['preparation']['guided_history'].append(task['question'])
        preparation.set_question(engine)
        return engine

    def test_word_example_and_repeat_are_separate_microsteps(self):
        self.assertEqual(self.engine['preparation']['step'], 'WORD')
        engine = self.next(self.engine)
        self.assertEqual(engine['preparation']['step'], 'EXAMPLE')
        self.assertEqual(engine['last_question'], '')
        engine = self.next(engine)
        self.assertEqual(engine['preparation']['step'], 'REPEAT')
        self.assertEqual(engine['last_question'], 'My name is Ana.')
        self.assertEqual(engine['phase'], 'LEARN')

    def test_beginner_translations_are_available_and_advanced_can_request_them(self):
        for level in speaking.LEVEL_POLICIES:
            snapshot = preparation.snapshot(self.engine, level)
            self.assertEqual(snapshot['show_translations'], level in {'A1', 'A2'})
            self.assertTrue(snapshot['item']['translation'])
            self.assertTrue(snapshot['item']['example_translation'])

    def test_buttons_and_premature_answers_do_not_award_proficiency(self):
        engine = preparation.transition(self.engine, 'A1', learner_input='I am very advanced')
        self.assertEqual(engine['preparation']['step'], 'WORD')
        engine = self.repeat(engine)
        for _ in range(5):
            engine = self.next(engine)
        self.assertEqual(engine['preparation']['step'], 'REPEAT')
        self.assertEqual(engine['preparation']['attempts'], {})
        engine['phase'] = 'PRACTICE'
        with self.assertRaises(ValueError):
            speaking.advance(engine, 'A1', 'mastered', 'Ana', 'Ana')

    def test_help_preserves_target_and_attempt_budget(self):
        engine = self.repeat()
        pending = engine['last_question']
        engine = preparation.transition(engine, 'A1', action='hint')
        engine = self.answer(engine, 'Não entendi', 'help')
        self.assertEqual(engine['last_question'], pending)
        self.assertEqual(engine['preparation']['attempts'], {})
        self.assertEqual(len(engine['help_used']), 2)
        self.assertTrue(engine['preparation']['hint'])

    def test_difficulty_gives_another_example_and_stops_same_exercise_after_three_attempts(self):
        engine = self.repeat()
        for attempt, alternative in enumerate(['My name is Lia.', 'My name is Eva.', 'My name is Bia.'], 1):
            engine = self.answer(engine, 'Não sei', 'struggling', alternative=alternative)
            self.assertEqual(engine['preparation']['attempts']['0'], attempt)
            if attempt < 3:
                engine = self.next(engine)
        self.assertEqual(engine['preparation']['next'], 'item')
        self.assertEqual(engine['preparation']['review_indices'], [0])
        with self.assertRaises(ValueError):
            preparation.transition(engine, 'A1', action='retry')
        engine = self.next(engine)
        self.assertEqual(engine['preparation']['item_index'], 1)
        self.assertEqual(engine['preparation']['step'], 'WORD')
        self.assertEqual(len(engine['difficulties']), 3)

    def test_repeated_difficulty_rejects_same_example_and_untranslated_examples(self):
        engine = self.next(self.answer(self.repeat(), 'Não sei', 'struggling'))
        for example, translation in [('My name is Ana.', 'Meu nome é Ana.'), ('I am Ana.', '')]:
            payload = assessment('Não sei', 'struggling', example)
            payload['alternate_example_translation'] = translation
            with self.assertRaises(ValueError):
                preparation.validate_assessment(payload, 'Não sei', 'A1', engine)

    def test_feedback_needs_evidence_from_actual_response(self):
        with self.assertRaises(ValueError):
            preparation.validate_assessment(assessment('invented'), 'My name is Ana.', 'A1')

    def test_beginner_sees_two_expressions_before_guided_answers(self):
        engine = self.answer(self.repeat())
        self.assertEqual(engine['preparation']['next'], 'item')
        engine = self.guided()
        self.assertEqual(engine['phase'], 'PRACTICE')
        self.assertEqual(engine['preparation']['step'], 'GUIDED')
        self.assertEqual(engine['preparation']['completed_indices'], [0, 1])

    def test_advanced_learner_gets_shorter_preparation(self):
        for level in ['B1', 'B2', 'C1', 'C2']:
            engine = self.answer(self.repeat(level=level), level=level)
            self.assertEqual(engine['preparation']['next'], 'guided')

    def test_mastery_accelerates_only_after_demonstration_and_contextual_answer(self):
        engine = self.answer(self.guided(), observation='mastered')
        self.assertEqual(engine['preparation']['next'], 'finish')
        self.assertEqual(engine['phase'], 'PRACTICE')
        engine = self.next(engine)
        self.assertEqual(engine['phase'], 'SIMULATE')
        self.assertFalse(preparation.pending(engine))
        self.assertIn('PRACTICE', engine['completed_phases'])

    def test_adequate_beginner_answers_need_two_successes_and_new_questions(self):
        engine = self.answer(self.guided())
        self.assertEqual(engine['preparation']['next'], 'guided')
        engine = self.next(engine)
        with self.assertRaises(ValueError):
            preparation.validate_task(guided_task(), engine, 'A1')
        engine['preparation']['task'] = preparation.validate_task(guided_task('Can you introduce yourself?'), engine, 'A1')
        engine = self.answer(engine)
        self.assertEqual(engine['preparation']['next'], 'finish')

    def test_guided_failures_require_review_instead_of_looping_or_entering_simulation(self):
        engine = self.guided()
        for attempt in range(3):
            engine = self.answer(engine, 'Não consigo', 'struggling')
            if attempt < 2:
                engine = self.next(engine)
        self.assertEqual(engine['preparation']['next'], 'review')
        engine = self.next(engine)
        self.assertEqual(engine['preparation']['step'], 'WORD')
        self.assertEqual(engine['phase'], 'LEARN')

    def test_guided_task_rejects_unprepared_words_complexity_and_missing_translation(self):
        engine = self.guided()
        for key, value in [('model_answer', 'I would appreciate your assistance.'),
                           ('question', 'Please explain in significant detail how you would go about introducing yourself.'),
                           ('model_answer_translation', '')]:
            payload = guided_task('Can you introduce yourself?')
            payload[key] = value
            with self.assertRaises(ValueError):
                preparation.validate_task(payload, engine, 'A1')


class VocabularyFlowTests(TestCase):
    def setUp(self):
        from .test_speaking_feedback import feedback_payload
        analysis_patch = patch.object(AIStudyOpenAIService, 'analyze_speaking', side_effect=feedback_payload)
        self.feedback_analysis = analysis_patch.start()
        self.addCleanup(analysis_patch.stop)
        self.client = APIClient()
        self.student = User.objects.create_user(email='phase-two@test.com', role='student', level='A1')
        self.client.force_authenticate(self.student)
        self.original_assess = AIStudyOpenAIService.assess_vocabulary_practice
        self.patches = [
            patch.object(AIStudyOpenAIService, 'plan_speaking_session', return_value=make_plan()),
            patch.object(AIStudyOpenAIService, 'assess_vocabulary_practice'),
            patch.object(AIStudyOpenAIService, 'generate_vocabulary_task', return_value=guided_task()),
            patch.object(AIStudyOpenAIService, 'generate_speaking_turn', return_value=make_turn('SIMULATE')),
        ]
        self.plan, self.assess, self.task, self.tutor = [p.start() for p in self.patches]
        for p in self.patches:
            self.addCleanup(p.stop)
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        override = override_settings(MEDIA_ROOT=self.media.name)
        override.enable()
        self.addCleanup(override.disable)
        cache.clear()

    def create(self, level='A1'):
        response = self.client.post('/api/ai-study/sessions/', {'mode': 'speaking'})
        session_id = response.data['id']
        self.message(session_id, text='Aula de Jiu-Jitsu')
        response = self.message(session_id, action={'action_type': 'level', 'value': level})
        self.assertEqual(response.status_code, 200, response.data)
        return AIStudySession.objects.get(id=session_id), response

    def message(self, session_id, text='', action=None):
        return self.client.post(f'/api/ai-study/sessions/{session_id}/message/',
                                {'guided_action': action} if action else {'text': text}, format='json')

    def next(self, session_id):
        response = self.message(session_id, action={'action_type': 'preparation', 'value': 'next'})
        self.assertEqual(response.status_code, 200, response.data)
        return response

    def repeat(self, session_id):
        self.next(session_id)
        self.next(session_id)

    def guided(self, session_id):
        self.repeat(session_id)
        self.assess.return_value = assessment()
        self.message(session_id, text='My name is Ana.')
        self.next(session_id)
        self.repeat(session_id)
        self.assess.return_value = assessment('I am on the mat.')
        self.message(session_id, text='I am on the mat.')
        response = self.next(session_id)
        self.assertEqual(response.data['session']['guided_state']['speaking']['phase'], 'PRACTICE')
        return response

    def test_new_sessions_add_microsteps_without_changing_plan_or_tutor_contracts(self):
        for level in speaking.LEVEL_POLICIES:
            with self.subTest(level=level):
                session, response = self.create(level)
                self.assertEqual(session.guided_state['speaking']['preparation']['step'], 'WORD')
                activity = response.data['assistant_message']['metadata']['speaking_activity']
                self.assertEqual(activity['show_translations'], level in {'A1', 'A2'})
                self.assertEqual(session.guided_state['speaking']['plan'], make_plan())
                self.assertEqual(response.data['assistant_message']['content_type'], 'text')
        self.assertNotIn('preparation', speaking.TutorTurn.model_fields)

    def test_short_typed_activities_reach_supported_contextual_answer_and_simulation(self):
        session, _ = self.create()
        self.guided(session.id)
        self.assess.return_value = assessment(observation='mastered')
        response = self.message(session.id, text='My name is Ana.')
        self.assertEqual(response.data['assistant_message']['metadata']['speaking_activity']['next'], 'finish')
        response = self.next(session.id)
        engine = response.data['session']['guided_state']['speaking']
        self.assertEqual(engine['phase'], 'SIMULATE')
        self.assertEqual(engine['preparation']['step'], 'COMPLETE')
        self.assertEqual(engine['situation_id'], 'meet_teacher')
        self.assertEqual(engine['step_index'], 0)
        self.tutor.assert_called_once()

    @patch.object(AIStudyOpenAIService, 'transcribe', return_value='My name is Ana.')
    def test_recorded_repetition_uses_transcript_and_simple_feedback(self, _transcribe):
        session, _ = self.create()
        self.repeat(session.id)
        self.assess.return_value = assessment()
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/audio/',
                                    {'audio': SimpleUploadedFile('repeat.webm', b'audio', content_type='audio/webm')}, format='multipart')
        self.assertEqual(response.status_code, 201)
        activity = response.data['assistant_message']['metadata']['speaking_activity']
        self.assertEqual(activity['step'], 'FEEDBACK')
        self.assertEqual(activity['assessment_source'], 'transcript')
        self.assertEqual(activity['attempts'], 1)
        self.assertIsNone(response.data['feedback']['pronunciation_score'])
        self.assertEqual(response.data['user_message']['content_type'], 'audio')

    def test_guided_task_and_pending_question_survive_reload(self):
        session, _ = self.create()
        self.guided(session.id)
        response = self.client.get(f'/api/ai-study/sessions/{session.id}/')
        engine = response.data['guided_state']['speaking']
        self.assertEqual(engine['last_question'], "What's your name?")
        self.assertEqual(engine['preparation']['task'], guided_task())
        self.assertEqual(engine['preparation']['completed_indices'], [0, 1])

    def test_help_and_continue_do_not_consume_repetition_attempts(self):
        session, _ = self.create()
        self.repeat(session.id)
        self.assess.return_value = assessment('Não entendi', 'help')
        self.message(session.id, text='Não entendi')
        self.message(session.id, action={'action_type': 'preparation', 'value': 'hint'})
        self.next(session.id)
        session.refresh_from_db()
        prep = session.guided_state['speaking']['preparation']
        self.assertEqual(prep['step'], 'REPEAT')
        self.assertEqual(prep['attempts'], {})
        self.assertEqual(session.guided_state['speaking']['last_question'], 'My name is Ana.')

    def test_simulation_button_cannot_bypass_beginner_preparation(self):
        session, _ = self.create()
        self.message(session.id, action={'action_type': 'quick_action', 'value': 'simulation'})
        session.refresh_from_db()
        self.assertEqual(session.guided_state['speaking']['phase'], 'LEARN')
        self.assertNotEqual(session.guided_state['speaking']['preparation']['step'], 'COMPLETE')
        self.tutor.assert_not_called()

    def test_initial_word_is_progressive_and_microphone_is_enabled_only_for_response_tasks(self):
        session, response = self.create()
        self.assertNotIn('My name is Ana.', response.data['assistant_message']['text'])
        self.assertEqual(response.data['session']['guided_state']['expected_input'], 'choice')
        response = self.next(session.id)
        self.assertEqual(response.data['session']['guided_state']['expected_input'], 'choice')
        response = self.next(session.id)
        self.assertEqual(response.data['session']['guided_state']['expected_input'], 'audio_or_text')

    def test_audio_before_the_demonstration_is_rejected_without_consuming_an_attempt(self):
        session, _ = self.create()
        before = deepcopy(session.guided_state)
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/audio/',
                                    {'audio': SimpleUploadedFile('early.webm', b'audio', content_type='audio/webm')}, format='multipart')
        self.assertEqual(response.status_code, 400)
        session.refresh_from_db()
        self.assertEqual(session.guided_state, before)
        self.assess.assert_not_called()

    def test_old_preparation_session_is_upgraded_without_resetting_simulation_position(self):
        session, _ = self.create()
        engine = session.guided_state['speaking']
        engine.pop('preparation')
        engine['phase'], engine['step_index'] = 'PRACTICE', 1
        session.save(update_fields=['guided_state'])
        response = self.message(session.id, text='Hello')
        engine = response.data['session']['guided_state']['speaking']
        self.assertEqual(engine['preparation']['step'], 'WORD')
        self.assertEqual(engine['step_index'], 1)
        self.assertEqual(engine['situation_id'], 'meet_teacher')

    def test_scenario_change_resets_microsteps_and_keeps_level(self):
        session, _ = self.create()
        self.repeat(session.id)
        self.message(session.id, action={'action_type': 'session_control', 'value': 'change_scenario'})
        response = self.message(session.id, action={'action_type': 'scenario', 'value': 'restaurant'})
        engine = response.data['session']['guided_state']['speaking']
        self.assertEqual(engine['preparation']['step'], 'WORD')
        self.assertEqual(engine['preparation']['attempts'], {})
        self.assertEqual(response.data['session']['guided_state']['level'], 'A1')

    def test_invalid_assessment_rolls_back_text_and_preparation_state(self):
        session, _ = self.create()
        self.repeat(session.id)
        session.refresh_from_db()
        before, count = deepcopy(session.guided_state), session.messages.count()
        self.assess.return_value = assessment('fabricated evidence')
        response = self.message(session.id, text='My name is Ana.')
        self.assertEqual(response.status_code, 503)
        session.refresh_from_db()
        self.assertEqual(session.guided_state, before)
        self.assertEqual(session.messages.count(), count)
        self.assertEqual(self.assess.call_count, 2)

    def test_invalid_task_keeps_feedback_and_can_be_retried(self):
        session, _ = self.create()
        self.repeat(session.id)
        self.assess.return_value = assessment()
        self.message(session.id, text='My name is Ana.')
        self.next(session.id)
        self.repeat(session.id)
        self.assess.return_value = assessment('I am on the mat.')
        self.message(session.id, text='I am on the mat.')
        session.refresh_from_db()
        before = deepcopy(session.guided_state)
        self.task.return_value = {}
        response = self.message(session.id, action={'action_type': 'preparation', 'value': 'next'})
        self.assertEqual(response.status_code, 503)
        session.refresh_from_db()
        self.assertEqual(session.guided_state, before)
        self.task.return_value = guided_task()
        self.next(session.id)

    @patch.object(AIStudyOpenAIService, 'generate_tts', return_value='/media/test-vocabulary.mp3')
    def test_word_and_example_audio_derive_from_saved_message_and_do_not_consume_turns(self, tts):
        session, response = self.create()
        message_id = response.data['assistant_message']['id']
        before, count = deepcopy(session.guided_state), session.messages.count()
        url = f'/api/ai-study/sessions/{session.id}/vocabulary-audio/'
        for _ in range(2):
            response = self.client.post(url, {'message_id': message_id, 'part': 'word'}, format='json')
            self.assertEqual(response.status_code, 200)
        tts.assert_called_once_with('My name is')
        session.refresh_from_db()
        self.assertEqual(session.guided_state, before)
        self.assertEqual(session.messages.count(), count)
        response = self.client.post(url, {'message_id': message_id, 'part': 'example'}, format='json')
        self.assertEqual(response.status_code, 400)
        example = self.next(session.id)
        response = self.client.post(url, {'message_id': example.data['assistant_message']['id'], 'part': 'example'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(tts.call_args.args[0], 'My name is Ana.')

    @patch.object(AIStudyOpenAIService, 'generate_tts', side_effect=OSError('unavailable'))
    def test_tts_failure_leaves_learning_available(self, _tts):
        session, response = self.create()
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/vocabulary-audio/',
                                    {'message_id': response.data['assistant_message']['id'], 'part': 'word'}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertIn('escrito', str(response.data))
        self.next(session.id)

    def test_audio_access_is_scoped_to_the_students_session(self):
        session, response = self.create()
        other = User.objects.create_user(email='phase-two-other@test.com', role='student')
        self.client.force_authenticate(other)
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/vocabulary-audio/',
                                    {'message_id': response.data['assistant_message']['id'], 'part': 'word'}, format='json')
        self.assertEqual(response.status_code, 404)

    @patch('ai_study.services.client.chat.completions.create')
    def test_new_assessment_contract_cannot_generate_acoustic_scores(self, create):
        session, _ = self.create()
        self.repeat(session.id)
        session.refresh_from_db()
        create.return_value = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(
            content=json.dumps(assessment()), refusal=None))])
        self.original_assess(session, session.guided_state['speaking'], 'A1', 'My name is Ana.')
        kwargs = create.call_args.kwargs
        self.assertEqual(kwargs['response_format']['json_schema']['name'], 'speaking_vocabulary_assessment')
        self.assertNotIn('pronunciation_score', kwargs['response_format']['json_schema']['schema']['properties'])
