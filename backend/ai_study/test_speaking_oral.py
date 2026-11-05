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
        self.assertIsNone(response.data['feedback'])
        self.assertFalse(self.session.speaking_feedbacks.exists())
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
