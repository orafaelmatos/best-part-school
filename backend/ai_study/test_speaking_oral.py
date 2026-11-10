from copy import deepcopy
import tempfile
import uuid
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from .models import AIStudySession
from .serializers import SpeakingAudioUploadSerializer
from .services import AIStudyOpenAIService, AIStudyWorkflowService
from .test_speaking_simulation import pending_engine, follow_up
from .test_speaking_preparation import guided_task


class SpeakingOralTests(TestCase):
    def setUp(self):
        from .test_speaking_feedback import feedback_payload
        analysis_patch = patch.object(AIStudyOpenAIService, 'analyze_speaking', side_effect=feedback_payload)
        self.feedback_analysis = analysis_patch.start()
        self.addCleanup(analysis_patch.stop)
        self.client = APIClient()
        self.student = User.objects.create_user(email='oral@test.com', role='student', level='A1')
        self.client.force_authenticate(self.student)
        self.session = AIStudySession.objects.create(student=self.student, mode='speaking')
        self.session.guided_state = {'enabled': True, 'stage': 'active', 'level': 'A1',
                                     'scenario_label': 'Aula de Jiu-Jitsu', 'speaking': pending_engine()}
        AIStudyWorkflowService._sync_speaking_state(self.session.guided_state)
        self.session.save(update_fields=['guided_state'])
        self.turn_patch = patch.object(AIStudyOpenAIService, 'generate_speaking_turn', return_value=follow_up())
        self.turn = self.turn_patch.start()
        self.addCleanup(self.turn_patch.stop)
        self.transcribe_patch = patch.object(AIStudyOpenAIService, 'transcribe', return_value='My name is Gabriel.')
        self.transcribe = self.transcribe_patch.start()
        self.addCleanup(self.transcribe_patch.stop)
        self.tts_patch = patch.object(AIStudyOpenAIService, 'generate_tts', return_value='/media/utterance.mp3')
        self.tts = self.tts_patch.start()
        self.addCleanup(self.tts_patch.stop)
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        settings = override_settings(MEDIA_ROOT=self.media.name)
        settings.enable()
        self.addCleanup(settings.disable)
        cache.clear()

    def state(self):
        self.session.refresh_from_db()
        return deepcopy(self.session.guided_state)

    def upload(self, request_id=None, prompt_id=None, mime='audio/webm;codecs=opus'):
        data = {'audio': SimpleUploadedFile('voice.m4a' if mime == 'audio/mp4' else 'voice.webm', b'voice', content_type=mime), 'duration_seconds': '5'}
        if request_id: data['request_id'] = str(request_id)
        if prompt_id: data['prompt_id'] = prompt_id
        return self.client.post(f'/api/ai-study/sessions/{self.session.id}/audio/', data, format='multipart')

    def test_structured_turn_and_feedback_source_are_additive_and_grounded(self):
        response = self.upload(mime='audio/mp4')
        self.assertEqual(response.status_code, 201)
        message = response.data['assistant_message']
        self.assertEqual(message['metadata']['speaking_turn']['question'], 'Is this your first class?')
        self.assertEqual(message['metadata']['assessment_source'], 'transcript')
        self.assertEqual(message['metadata']['speaking_level'], 'A1')
        self.assertEqual(len(message['metadata']['speaking_prompt_id']), 64)
        self.assertIn('Gabriel', message['text'])
        self.assertIsNone(response.data['feedback']['pronunciation_score'])
        self.assertTrue(self.session.speaking_feedbacks.exists())
        self.assertEqual(self.session.speaking_audios.get().duration_seconds, 5)

    def test_written_answer_is_identified_as_written_feedback(self):
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/message/', {'text': 'My name is Gabriel.'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['assistant_message']['metadata']['assessment_source'], 'text')

    def test_browser_audio_formats_and_codec_parameters_are_accepted(self):
        for mime in ['audio/webm;codecs=opus', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/ogg;codecs=opus', 'audio/wav']:
            with self.subTest(mime=mime):
                serializer = SpeakingAudioUploadSerializer(data={'audio': SimpleUploadedFile('voice', b'audio', content_type=mime)})
                self.assertTrue(serializer.is_valid(), serializer.errors)
        for value in [SimpleUploadedFile('text.txt', b'text', content_type='text/plain'), SimpleUploadedFile('empty.webm', b'', content_type='audio/webm')]:
            serializer = SpeakingAudioUploadSerializer(data={'audio': value})
            self.assertFalse(serializer.is_valid())

    def test_repeated_upload_returns_saved_messages_without_a_second_turn(self):
        request_id = uuid.uuid4()
        old_prompt = AIStudyWorkflowService.speaking_prompt_id(self.state())
        response = self.upload(request_id, old_prompt)
        self.assertEqual(response.status_code, 201)
        before = self.state()
        repeated = self.upload(request_id, old_prompt)
        self.assertEqual(repeated.status_code, 201)
        self.assertEqual(repeated.data['user_message']['id'], response.data['user_message']['id'])
        self.assertEqual(repeated.data['assistant_message']['id'], response.data['assistant_message']['id'])
        self.assertEqual(self.state(), before)
        self.assertEqual(self.session.messages.count(), 2)
        self.assertEqual(self.session.speaking_audios.count(), 1)
        self.transcribe.assert_called_once()
        self.turn.assert_called_once()

    def test_stale_recording_is_rejected_before_transcription_or_state_changes(self):
        old_prompt = AIStudyWorkflowService.speaking_prompt_id(self.state())
        self.upload(uuid.uuid4(), old_prompt)
        before = self.state()
        response = self.upload(uuid.uuid4(), old_prompt)
        self.assertEqual(response.status_code, 400)
        self.assertIn('atividade mudou', str(response.data))
        self.assertEqual(self.state(), before)
        self.assertEqual(self.transcribe.call_count, 1)

    def test_question_is_rechecked_after_transcription_before_evaluation(self):
        old_prompt = AIStudyWorkflowService.speaking_prompt_id(self.state())
        def concurrent_reply(_file):
            AIStudyWorkflowService.handle_guided_message(self.session, text='My name is Gabriel.')
            return 'My name is Gabriel.'
        self.transcribe.side_effect = concurrent_reply
        response = self.upload(uuid.uuid4(), old_prompt)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.state()['speaking']['step_index'], 1)
        self.assertEqual(self.session.messages.filter(role='user').count(), 1)
        self.turn.assert_called_once()

    def test_failed_transcription_preserves_the_prompt_and_can_retry_the_same_request(self):
        request_id = uuid.uuid4()
        prompt_id = AIStudyWorkflowService.speaking_prompt_id(self.state())
        before = self.state()
        self.transcribe.return_value = ''
        self.assertEqual(self.upload(request_id, prompt_id).status_code, 503)
        self.assertEqual(self.state(), before)
        self.assertEqual(self.session.messages.count(), 0)
        self.transcribe.return_value = 'My name is Gabriel.'
        self.assertEqual(self.upload(request_id, prompt_id).status_code, 201)
        self.assertEqual(self.session.messages.filter(role='user').count(), 1)

    def test_help_does_not_change_the_recording_prompt_identity(self):
        before = AIStudyWorkflowService.speaking_prompt_id(self.state())
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/message/', {'guided_action': {'action_type': 'simulation_help', 'value': 'continue'}}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['assistant_message']['metadata']['speaking_prompt_id'], before)

    def test_ai_utterance_audio_uses_saved_english_fields_and_does_not_consume_a_turn(self):
        message = self.session.messages.create(role='assistant', text='Orientação em português', metadata={'speaking_turn': {
            'question': "What's your name?", 'demonstration': 'My name is Ana.'}})
        url = f'/api/ai-study/sessions/{self.session.id}/utterance-audio/'
        before, count = self.state(), self.session.messages.count()
        for part, text in [('question', "What's your name?"), ('demonstration', 'My name is Ana.')]:
            response = self.client.post(url, {'message_id': str(message.id), 'part': part, 'text': 'arbitrary client text'}, format='json')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.tts.call_args.args[0], text)
        self.assertEqual(self.state(), before)
        self.assertEqual(self.session.messages.count(), count)

    def test_guided_model_answer_can_be_heard_independently(self):
        message = self.session.messages.create(role='assistant', metadata={'speaking_activity': {'task': guided_task()}})
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/utterance-audio/',
                                    {'message_id': str(message.id), 'part': 'model_answer'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.tts.assert_called_once_with('My name is Ana.')

    def test_unavailable_utterances_and_unowned_sessions_are_rejected(self):
        message = self.session.messages.create(role='assistant', text='Sem fala em inglês')
        url = f'/api/ai-study/sessions/{self.session.id}/utterance-audio/'
        response = self.client.post(url, {'message_id': str(message.id), 'part': 'question'}, format='json')
        self.assertEqual(response.status_code, 400)
        other = User.objects.create_user(email='other-oral@test.com', role='student')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post(url, {'message_id': str(message.id), 'part': 'question'}, format='json').status_code, 404)
        self.tts.assert_not_called()

    def test_tts_failure_does_not_block_a_written_answer(self):
        message = self.session.messages.create(role='assistant', metadata={'speaking_turn': {'question': "What's your name?"}})
        self.tts.side_effect = OSError('unavailable')
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/utterance-audio/',
                                    {'message_id': str(message.id), 'part': 'question'}, format='json')
        self.assertEqual(response.status_code, 503)
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/message/', {'text': 'My name is Gabriel.'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.state()['speaking']['step_index'], 1)

    def test_feedback_preserves_original_recording_and_repetition_does_not_advance_conversation(self):
        original = self.upload()
        feedback = original.data['feedback']
        before = self.state()
        report = deepcopy(self.session.speaking_reports.get().report)
        request_id = uuid.uuid4()
        data = {'audio': SimpleUploadedFile('retry.webm', b'new recording', content_type='audio/webm'),
                'retry_feedback_id': feedback['id'], 'request_id': str(request_id)}
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/audio/', data, format='multipart')
        self.assertEqual(response.status_code, 201)
        repeated = response.data['feedback']
        self.assertEqual(self.state(), before)
        self.turn.assert_called_once()
        self.assertEqual(self.session.speaking_reports.get().report, report)
        self.assertEqual(repeated['learning_feedback']['previous_feedback_id'], feedback['id'])
        self.assertTrue(repeated['learning_feedback']['comparison'])
        self.assertIsNone(repeated['pronunciation_score'])
        self.assertEqual(response.data['assistant_message']['metadata']['speaking_turn']['question'], 'Is this your first class?')
        old = self.session.speaking_feedbacks.get(pk=feedback['id'])
        new = self.session.speaking_feedbacks.get(pk=repeated['id'])
        with old.audio.audio.open('rb') as stream:
            self.assertEqual(stream.read(), b'voice')
        with new.audio.audio.open('rb') as stream:
            self.assertEqual(stream.read(), b'new recording')
        data['audio'] = SimpleUploadedFile('retry.webm', b'new recording', content_type='audio/webm')
        duplicate = self.client.post(f'/api/ai-study/sessions/{self.session.id}/audio/', data, format='multipart')
        self.assertEqual(duplicate.data['feedback']['id'], repeated['id'])
        self.assertEqual(self.session.speaking_feedbacks.count(), 2)
        self.assertEqual(self.transcribe.call_count, 2)

    def test_chunk_practice_keeps_the_full_phrase_for_the_final_repetition(self):
        full = 'My name is Gabriel. Nice to meet you.'
        self.transcribe.return_value = full
        original = self.upload().data['feedback']
        self.assertEqual(' '.join(original['learning_feedback']['chunks']), full)
        before = self.state()
        self.transcribe.return_value = 'My name is Gabriel.'
        response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/audio/', {
            'audio': SimpleUploadedFile('part.webm', b'part', content_type='audio/webm'),
            'retry_feedback_id': original['id'], 'chunk_index': 0,
        }, format='multipart')
        self.assertEqual(response.status_code, 201)
        feedback = response.data['feedback']
        self.assertEqual(self.state(), before)
        self.assertEqual(feedback['learning_feedback']['full_sentence'], full)
        self.assertEqual(feedback['learning_feedback']['practice_target'], 'My name is Gabriel.')
        self.assertEqual(' '.join(feedback['learning_feedback']['chunks']), full)
        self.assertEqual(self.feedback_analysis.call_args.kwargs['target'], 'My name is Gabriel.')
        url = f"/api/ai-study/feedback/{feedback['id']}/tts/"
        for options, expected in [({'chunk_index': 1}, 'Nice to meet you.'), ({'full_sentence': True}, full), ({}, 'My name is Gabriel.')]:
            tts = self.client.post(url, options, format='json')
            self.assertEqual(tts.status_code, 200)
            self.assertEqual(tts.data['text'], expected)
            self.assertEqual(self.tts.call_args.args[0], expected)
        self.assertEqual(self.client.post(url, {'chunk_index': 80}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'chunk_index': -1}, format='json').status_code, 400)

    def test_legacy_tts_cache_is_discarded_and_uses_the_displayed_natural_sentence(self):
        from .models import SpeakingFeedback
        from .serializers import SpeakingFeedbackSerializer
        self.upload()
        feedback = self.session.speaking_feedbacks.get()
        feedback.raw_response = {}
        feedback.natural_sentence = "I'd like a coffee with milk, but no sugar, please."
        feedback.corrected_sentence = 'I would like a coffee, please, with no sugar, with milk.'
        feedback.tts_audio_url = '/old-wrong-audio.mp3'
        feedback.save()
        self.assertIsNone(SpeakingFeedbackSerializer(feedback).data['tts_audio_url'])
        for _ in range(2):
            response = self.client.post(f'/api/ai-study/feedback/{feedback.id}/tts/', {'text': 'arbitrary client text'}, format='json')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['text'], feedback.natural_sentence)
        self.tts.assert_called_once_with(feedback.natural_sentence)
        feedback.refresh_from_db()
        self.assertEqual(feedback.raw_response['tts_text'], feedback.natural_sentence)
        self.assertEqual(feedback.audio.audio.read(), b'voice')

    def test_ambiguous_response_asks_for_clarification_without_advancing(self):
        from .test_speaking_feedback import feedback_payload
        result = feedback_payload()
        result.update(needs_clarification=True, clarification_question='Você quis dizer o seu nome ou o nome do professor?')
        from .speaking_feedback import validate
        self.feedback_analysis.side_effect = None
        self.feedback_analysis.return_value = validate(result, 'My name is Gabriel.')
        AIStudyWorkflowService.ensure_guided_state(self.session, persist=True)
        before = self.state()
        response = self.upload()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.state(), before)
        self.turn.assert_not_called()
        self.assertTrue(response.data['assistant_message']['metadata']['speaking_clarification'])
        feedback = response.data['feedback']
        self.assertEqual(feedback['learning_feedback']['suggested_sentence'], '')
        self.assertEqual(self.client.post(f"/api/ai-study/feedback/{feedback['id']}/tts/").status_code, 400)

    def test_failed_analysis_keeps_the_recording_and_conversation_usable(self):
        from .services import SpeakingContentUnavailable
        self.feedback_analysis.side_effect = SpeakingContentUnavailable()
        response = self.upload()
        self.assertEqual(response.status_code, 201)
        details = response.data['feedback']['learning_feedback']
        self.assertTrue(details['analysis_unavailable'])
        self.assertEqual(details['grammar']['status'], 'not_assessed')
        self.assertEqual(details['pronunciation']['status'], 'not_assessed')
        self.assertEqual(details['suggested_sentence'], 'My name is Gabriel.')
        self.assertEqual(self.state()['speaking']['step_index'], 1)

    def test_only_advanced_learners_can_opt_into_english_feedback(self):
        def upload_language(language):
            return self.client.post(f'/api/ai-study/sessions/{self.session.id}/audio/', {
                'audio': SimpleUploadedFile('voice.webm', b'voice', content_type='audio/webm'),
                'feedback_language': language,
            }, format='multipart')
        self.assertEqual(upload_language('en').data['feedback']['learning_feedback']['feedback_language'], 'pt-BR')
        self.session.guided_state = self.state()
        self.session.guided_state['level'] = 'B2'
        self.session.guided_state['speaking'] = pending_engine()
        self.session.save()
        response = upload_language('en')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.feedback_analysis.call_args.kwargs['language'], 'en')
        self.assertEqual(response.data['feedback']['learning_feedback']['feedback_language'], 'en')

    def test_stale_or_foreign_repetition_is_rejected_before_transcription(self):
        original = self.upload().data['feedback']
        state = self.state()
        state['speaking']['last_question'] = 'A different pending question?'
        self.session.guided_state = state
        self.session.save()
        for reference in [original['id'], str(uuid.uuid4())]:
            response = self.client.post(f'/api/ai-study/sessions/{self.session.id}/audio/', {
                'audio': SimpleUploadedFile('retry.webm', b'voice', content_type='audio/webm'),
                'retry_feedback_id': reference,
            }, format='multipart')
            self.assertEqual(response.status_code, 400)
        self.transcribe.assert_called_once()
