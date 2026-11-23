import json
import shutil
import tempfile
import uuid
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from lessons.models import Lesson
from .models import AIStudySession, SpeakingAudio


def make_plan():
    return {
        'situation': 'Christopher, pastor americano, visita uma igreja no Brasil e conversa com a anfitriã Ana.',
        'characters': [{'name': 'Christopher', 'role': 'Pastor americano', 'language': 'en'},
                       {'name': 'Ana', 'role': 'Anfitriã brasileira', 'language': 'pt'}],
        'steps': [{'title': title, 'goal': f'Conduzir {title.lower()} na igreja.'}
                  for title in ['Saudação', 'Introdução', 'Desenvolvimento', 'Reflexão', 'Encerramento']],
        'vocabulary': [{'expression': word, 'translation': translation, 'example': f'This is {word}.',
                        'example_translation': f'Isto é {translation}.'}
                       for word, translation in [('faith', 'fé'), ('prayer', 'oração'), ('blessing', 'bênção'), ('forgiveness', 'perdão')]],
    }


def make_turn(source='en', target='pt'):
    interpretation = 'É uma bênção estar aqui com vocês nesta noite.' if target == 'pt' else 'It is a blessing to be here with you tonight.'
    return dict(speaker='Christopher' if source == 'en' else 'Ana', source_language=source, target_language=target,
                transcript='It is a blessing to be here with you tonight.' if source == 'en' else 'É uma bênção estar aqui com vocês nesta noite.',
                suggested_interpretation=interpretation, key_information=['É uma bênção estar presente com o público nesta noite.'],
                hint='Preserve a ideia de gratidão pela presença junto ao público.',
                alternatives=[interpretation, 'Uma reunião acontecerá amanhã.', 'Precisamos sair imediatamente.', 'A igreja está fechada.'], correct_option_index=0)


def make_assessment(text):
    return dict(summary='Muito bem! Você transmitiu a mensagem corretamente.', meaning_score=95, naturalness_score=95,
                target_language_observed=True, information=[dict(unit_index=0, status='preserved', evidence=text,
                explanation='Você manteve a ideia de bênção e o encontro com o público nesta noite.')],
                strengths=['Você preservou o significado sem depender de uma tradução literal.'], improvements=[], difficult_vocabulary=[])


class InterpreterAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.student = User.objects.create_user(email='interpreter@test.com', role='student', name='Aluno')
        cls.other = User.objects.create_user(email='interpreter-other@test.com', role='student', name='Outro')
        cls.teacher = User.objects.create_user(email='interpreter-teacher@test.com', role='teacher', name='Professor')
        cls.unrelated_teacher = User.objects.create_user(email='interpreter-unrelated@test.com', role='teacher', name='Outro professor')
        Lesson.objects.create(title='Interpretação', student=cls.student, teacher=cls.teacher, level='A2', date=timezone.now())

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.student)
        self.media = tempfile.mkdtemp(prefix='bps-interpreter-media-')
        self.settings_override = override_settings(MEDIA_ROOT=self.media)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(shutil.rmtree, self.media)
        self.provider = patch('ai_study.services.AIStudyOpenAIService._speaking_json', side_effect=self.respond).start()
        self.addCleanup(patch.stopall)

    def respond(self, messages, name, contract):
        data = json.loads(messages[1]['content'])
        if name == 'interpreter_plan':
            return make_plan()
        if name == 'interpreter_turn':
            turn = make_turn(data['source_language'], data['target_language'])
            if data.get('interpretation_mode') == 'simultaneous':
                turn['transcript'] = ' '.join([turn['transcript']] * max(1, data['policy']['words'] // len(turn['transcript'].split())))
            return turn
        if name == 'interpreter_assessment':
            return make_assessment(data['student_response'])
        raise AssertionError(f'Unexpected contract {name}')

    def create_session(self, **settings):
        payload = dict(mode='listening', scenario_key='preaching', scenario_label='Pregação', level='A2',
                       interpreter_settings={'direction': 'en_pt', **settings})
        response = self.client.post('/api/ai-study/sessions/', payload, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def post(self, session, action, data=None, format='json'):
        return self.client.post(f"/api/ai-study/sessions/{session['id']}/interpreter/{action}/", data or {}, format=format)

    def submit(self, session, text='Que bênção poder estar com vocês hoje à noite!', **extra):
        state = session['guided_state']['interpreter']
        return self.post(session, 'answer', dict(message_id=state['active_turn_id'], response_mode='text',
                         request_id=str(uuid.uuid4()), answer_text=text, **extra))

    def test_creation_has_real_characters_five_stages_and_voice_workflow(self):
        session = self.create_session()
        state = session['guided_state']['interpreter']
        self.assertEqual(state['version'], 1)
        self.assertEqual(len(state['plan']['steps']), 5)
        self.assertEqual(state['status'], 'active')
        self.assertEqual(session['messages'][0]['metadata']['interpretation_turn']['speaker'], 'Christopher')

    def test_vocabulary_is_optional_and_can_precede_the_first_turn(self):
        session = self.create_session(prepare_vocabulary=True)
        self.assertEqual(session['messages'], [])
        self.assertEqual(session['guided_state']['interpreter']['status'], 'ready')
        started = self.post(session, 'next')
        self.assertEqual(started.status_code, 200)
        self.assertEqual(len(started.data['messages']), 1)

    def test_portuguese_to_english_respected_for_generation_and_assessment(self):
        session = self.create_session(direction='pt_en')
        turn = session['messages'][0]['metadata']['interpretation_turn']
        self.assertEqual((turn['source_language'], turn['target_language']), ('pt', 'en'))
        response = self.submit(session, text='What a blessing to join you this evening!')
        self.assertEqual(response.status_code, 200)
        payload = json.loads(self.provider.call_args.args[0][1]['content'])
        self.assertEqual(payload['target_language'], 'en')

    def test_alternating_keeps_language_and_character_schedule(self):
        session = self.create_session(direction='alternating')
        for expected in [('en', 'pt', 'Christopher'), ('pt', 'en', 'Ana'), ('en', 'pt', 'Christopher')]:
            turn = next(m for m in session['messages'] if m['id'] == session['guided_state']['interpreter']['active_turn_id'])['metadata']['interpretation_turn']
            self.assertEqual((turn['source_language'], turn['target_language'], turn['speaker']), expected)
            response = self.submit(session)
            self.assertEqual(response.status_code, 200)
            session = self.post(response.data, 'next').data

    def test_consecutive_next_cannot_skip_an_unanswered_turn(self):
        session = self.create_session()
        response = self.post(session, 'next')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['messages']), 1)
        self.assertEqual(response.data['guided_state']['interpreter']['active_turn_id'], session['guided_state']['interpreter']['active_turn_id'])

    def test_meaning_feedback_accepts_provider_evaluated_paraphrase_and_does_not_auto_advance(self):
        session = self.create_session()
        response = self.submit(session)
        self.assertEqual(response.status_code, 200)
        feedback = response.data['messages'][-1]['metadata']['interpretation_feedback']
        self.assertEqual(feedback['meaning_score'], 95)
        self.assertEqual(feedback['completeness_score'], 100)
        self.assertIsNone(feedback['pronunciation_score'])
        self.assertIsNone(feedback['fluency_score'])
        self.assertEqual(response.data['guided_state']['interpreter']['next_index'], 1)
        self.assertEqual(len(response.data['messages']), 3)

    @patch('ai_study.services.AIStudyOpenAIService.transcribe', return_value='Que bênção estar aqui com vocês nesta noite!')
    def test_voice_upload_is_persisted_for_playback_and_retries_are_idempotent(self, transcribe):
        session = self.create_session()
        request_id = str(uuid.uuid4())
        def upload():
            return self.post(session, 'answer', dict(message_id=session['guided_state']['interpreter']['active_turn_id'],
                response_mode='voice', request_id=request_id, audio=SimpleUploadedFile('interpretacao.webm', b'audio-data', content_type='audio/webm'), duration_seconds=10), format='multipart')
        first = upload()
        second = upload()
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(transcribe.call_count, 1)
        self.assertEqual(SpeakingAudio.objects.count(), 1)
        self.assertTrue(first.data['messages'][1]['audio_url'])
        self.assertEqual(second.data['guided_state']['interpreter']['report']['oral_segments'], 1)

    def test_text_upload_and_invalid_duration_are_rejected_before_provider(self):
        session = self.create_session()
        calls = self.provider.call_count
        response = self.post(session, 'answer', dict(message_id=session['guided_state']['interpreter']['active_turn_id'],
            response_mode='voice', request_id=str(uuid.uuid4()), audio=SimpleUploadedFile('bad.txt', b'text', content_type='text/plain')), format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.provider.call_count, calls)

    def test_stale_answers_and_duplicate_challenge_answers_do_not_change_state(self):
        session = self.create_session()
        first = self.submit(session)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(self.submit(session).status_code, 400)
        current = self.post(session, 'next').data
        self.assertEqual(self.submit(session).status_code, 400)
        self.assertEqual(len(current['messages']), 4)

    def test_multiple_choice_uses_target_language_and_is_identified_in_report(self):
        session = self.create_session()
        response = self.post(session, 'answer', dict(message_id=session['guided_state']['interpreter']['active_turn_id'],
            request_id=str(uuid.uuid4()), response_mode='multiple_choice', selected_option_index=0))
        self.assertEqual(response.status_code, 200)
        report = response.data['guided_state']['interpreter']['report']
        self.assertEqual(report['oral_segments'], 0)
        self.assertIsNone(report['naturalness_score'])
        self.assertEqual(response.data['messages'][-1]['metadata']['interpretation_feedback']['response_mode'], 'multiple_choice')

    def test_wrong_target_language_receives_no_credit(self):
        session = self.create_session()
        assessment = make_assessment('English')
        assessment['target_language_observed'] = False
        self.provider.side_effect = lambda *args: assessment
        response = self.submit(session, text='English')
        self.assertEqual(response.status_code, 200)
        result = response.data['messages'][-1]['metadata']['interpretation_feedback']
        self.assertEqual(result['meaning_score'], 0)
        self.assertEqual(result['completeness_score'], 0)

    def test_invalid_evidence_never_creates_a_response_or_report(self):
        session = self.create_session()
        self.provider.side_effect = lambda *args: make_assessment('invented evidence')
        response = self.submit(session)
        self.assertEqual(response.status_code, 503)
        saved = AIStudySession.objects.get(pk=session['id'])
        self.assertEqual(saved.messages.count(), 1)
        self.assertIsNone(saved.guided_state['interpreter']['report'])

    def test_malformed_plan_rolls_back_new_session(self):
        self.provider.side_effect = lambda *args: {'situation': 'invalid'}
        response = self.client.post('/api/ai-study/sessions/', dict(mode='listening', scenario_label='Pregação', level='A2', interpreter_settings={}), format='json')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(AIStudySession.objects.count(), 0)

    def test_wrong_direction_from_provider_is_rejected_without_advancing(self):
        session = self.create_session(prepare_vocabulary=True)
        self.provider.side_effect = lambda *args: make_turn('pt', 'en')
        response = self.post(session, 'next')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(AIStudySession.objects.get(pk=session['id']).guided_state['interpreter']['next_index'], 0)

    def test_complete_session_has_report_and_cannot_continue(self):
        session = self.create_session()
        for index in range(5):
            response = self.submit(session)
            self.assertEqual(response.status_code, 200)
            session = response.data
            if index < 4:
                session = self.post(session, 'next').data
        self.assertEqual(session['status'], 'completed')
        state = session['guided_state']['interpreter']
        self.assertEqual(state['report']['interpreted_segments'], 5)
        self.assertEqual(len(state['report']['preserved']), 5)
        self.assertEqual(self.post(session, 'next').status_code, 400)

    def test_early_finish_has_no_invented_performance_and_is_idempotent(self):
        session = self.create_session(prepare_vocabulary=True)
        first = self.post(session, 'finish').data['guided_state']['interpreter']
        second = self.post(session, 'finish').data['guided_state']['interpreter']
        self.assertEqual(first['completed_at'], second['completed_at'])
        self.assertEqual(first['report']['interpreted_segments'], 0)
        self.assertIsNone(first['report']['meaning_score'])

    def test_review_replaces_report_attempt_without_duplicating_segment_or_advancing(self):
        session = self.submit(self.create_session()).data
        original = session['guided_state']['interpreter']['active_turn_id']
        closed = self.post(session, 'finish').data
        review = self.post(closed, 'retry', {'message_id': original})
        self.assertEqual(review.status_code, 200)
        self.assertEqual(review.data['guided_state']['interpreter']['status'], 'reviewing')
        answered = self.submit(review.data)
        self.assertEqual(answered.status_code, 200)
        state = answered.data['guided_state']['interpreter']
        self.assertEqual(state['status'], 'completed')
        self.assertEqual(state['active_turn_id'], review.data['guided_state']['interpreter']['active_turn_id'])
        self.assertEqual(state['next_index'], 1)
        self.assertEqual(state['report']['interpreted_segments'], 1)
        self.assertEqual(len(state['report']['preserved']), 1)

    def test_review_preserves_an_unanswered_main_turn_and_its_language_schedule(self):
        session = self.submit(self.create_session(direction='alternating')).data
        original = session['guided_state']['interpreter']['active_turn_id']
        main = self.post(session, 'next').data
        main_id = main['guided_state']['interpreter']['active_turn_id']
        review = self.post(main, 'retry', {'message_id': original}).data
        state = self.submit(review).data['guided_state']['interpreter']
        self.assertEqual(state['active_turn_id'], main_id)
        self.assertEqual(state['next_index'], 2)
        self.assertEqual(state['status'], 'active')
        resumed = self.post(main, 'next').data
        self.assertEqual(resumed['guided_state']['interpreter']['active_turn_id'], main_id)

    def test_free_duration_controls_turn_budget_and_retains_story_plan(self):
        short = self.create_session(session_style='free', duration_minutes=2)
        long = self.create_session(session_style='free', duration_minutes=15)
        self.assertGreater(long['guided_state']['interpreter']['total_turns'], short['guided_state']['interpreter']['total_turns'])
        self.assertEqual(len(long['guided_state']['interpreter']['plan']['steps']), 5)

    @patch('ai_study.services.AIStudyOpenAIService.generate_tts', return_value='/media/interpretacao.mp3')
    def test_tts_uses_correct_language_for_original_suggestion_and_vocabulary_and_is_cached(self, tts):
        session = self.create_session(direction='pt_en')
        message_id = session['guided_state']['interpreter']['active_turn_id']
        payload = {'message_id': message_id, 'part': 'original'}
        self.assertEqual(self.post(session, 'audio', payload).status_code, 200)
        self.assertIn('Brazilian Portuguese', tts.call_args.kwargs['instructions'])
        self.post(session, 'audio', payload)
        self.assertEqual(tts.call_count, 1)
        self.post(session, 'audio', {'message_id': message_id, 'part': 'suggested'})
        self.assertIn('Speak only English', tts.call_args.kwargs['instructions'])
        self.assertEqual(self.post(session, 'audio', {'part': 'vocabulary', 'vocabulary_index': 0}).status_code, 200)

    def test_only_linked_teacher_can_read_and_teacher_cannot_mutate_student_session(self):
        session = self.submit(self.create_session()).data
        path = f"/api/ai-study/sessions/{session['id']}/"
        for user in [self.other, self.unrelated_teacher]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(path).status_code, 404)
        self.client.force_authenticate(self.teacher)
        detail = self.client.get(path)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['guided_state']['interpreter']['report']['interpreted_segments'], 1)
        self.assertEqual(self.post(session, 'finish').status_code, 403)
        self.assertEqual(self.post(session, 'next').status_code, 403)
        self.assertEqual(self.client.delete(path).status_code, 403)

    def test_student_filter_is_validated_and_never_bypasses_permissions(self):
        session = self.create_session()
        self.client.force_authenticate(self.other)
        response = self.client.get('/api/ai-study/sessions/', {'student': str(self.student.id), 'modes': 'listening'})
        self.assertEqual(response.data, [])
        self.assertEqual(self.client.get('/api/ai-study/sessions/', {'student': 'invalid'}).status_code, 400)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get('/api/ai-study/sessions/', {'student': str(self.student.id)}).data[0]['id'], session['id'])

    def test_teacher_can_practice_in_own_simulator_without_modifying_student_reports(self):
        self.client.force_authenticate(self.teacher)
        session = self.create_session()
        self.assertEqual(self.client.get(f"/api/ai-study/sessions/{session['id']}/").status_code, 200)
        self.assertEqual(self.submit(session).status_code, 200)

    def test_legacy_listening_actions_cannot_mutate_new_simulator(self):
        session = self.create_session()
        response = self.client.post(f"/api/ai-study/sessions/{session['id']}/listening/next/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(AIStudySession.objects.get(pk=session['id']).messages.count(), 1)

    def test_simultaneous_settings_have_defaults_and_a_longer_continuous_speech_budget(self):
        session = self.create_session(interpretation_mode='simultaneous')
        state = session['guided_state']['interpreter']
        self.assertEqual(state['settings']['segment_duration_seconds'], 60)
        self.assertEqual(state['settings']['playback_speed'], 1)
        self.assertEqual(state['policy']['words'], 100)
        self.assertGreater(len(session['messages'][0]['text'].split()), 50)

    def test_simultaneous_duration_and_speed_are_bounded(self):
        for settings in [{'segment_duration_seconds': 900}, {'playback_speed': 0}, {'playback_speed': 9}]:
            response = self.client.post('/api/ai-study/sessions/', dict(mode='listening', scenario_label='Pregação', level='A2',
                interpreter_settings={'interpretation_mode': 'simultaneous', **settings}), format='json')
            self.assertEqual(response.status_code, 400)

    def test_simultaneous_free_turn_budget_uses_audio_length_and_speed(self):
        short = self.create_session(interpretation_mode='simultaneous', session_style='free', duration_minutes=15, segment_duration_seconds=30)
        long = self.create_session(interpretation_mode='simultaneous', session_style='free', duration_minutes=15, segment_duration_seconds=120, playback_speed=0.75)
        self.assertGreater(short['guided_state']['interpreter']['total_turns'], long['guided_state']['interpreter']['total_turns'])
        self.assertEqual(long['guided_state']['interpreter']['policy']['speed'], 0.75)
        compact = self.create_session(interpretation_mode='simultaneous', session_style='free', duration_minutes=2, segment_duration_seconds=120)
        self.assertEqual(compact['guided_state']['interpreter']['total_turns'], 1)

    def simultaneous_upload(self, session, timing=None, request_id=None):
        data = dict(message_id=session['guided_state']['interpreter']['active_turn_id'], response_mode='voice',
            request_id=request_id or str(uuid.uuid4()), duration_seconds=12,
            audio=SimpleUploadedFile('simultanea.webm', b'encoded-recording', content_type='audio/webm'))
        if timing is not None:
            data['simultaneous_timing'] = json.dumps(timing)
        return self.post(session, 'answer', data, format='multipart')

    def make_timing(self):
        return dict(version=1, source_duration_seconds=10, recording_duration_seconds=12, source_completed=True, segments=[
            dict(recording_start_seconds=0, recording_end_seconds=4, source_start_seconds=0, source_end_seconds=4, playback_rate=1),
            dict(recording_start_seconds=4, recording_end_seconds=12, source_start_seconds=4, source_end_seconds=10, playback_rate=0.75),
        ])

    @patch('ai_study.services.AIStudyOpenAIService.transcribe', return_value='É uma bênção estar aqui com vocês nesta noite.')
    def test_simultaneous_voice_persists_timeline_for_teacher_and_deduplicates_retries(self, transcribe):
        session = self.create_session(interpretation_mode='simultaneous', playback_speed=0.75)
        request_id = str(uuid.uuid4())
        first = self.simultaneous_upload(session, self.make_timing(), request_id)
        second = self.simultaneous_upload(session, self.make_timing(), request_id)
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(transcribe.call_count, 1)
        answer = first.data['messages'][1]
        self.assertEqual(answer['metadata']['interpreter_answer']['simultaneous_timing'], self.make_timing())
        self.assertEqual(second.data['guided_state']['interpreter']['report']['simultaneous_segments'], 1)
        self.assertIsNone(second.data['messages'][-1]['metadata']['interpretation_feedback']['fluency_score'])
        self.client.force_authenticate(self.teacher)
        detail = self.client.get(f"/api/ai-study/sessions/{session['id']}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['messages'][1]['metadata']['interpreter_answer']['simultaneous_timing'], self.make_timing())

    @patch('ai_study.services.AIStudyOpenAIService.transcribe')
    def test_simultaneous_incomplete_or_invalid_timeline_never_reaches_transcription(self, transcribe):
        session = self.create_session(interpretation_mode='simultaneous')
        invalid = []
        for field, value in [('source_completed', False), ('source_duration_seconds', float('nan')), ('recording_duration_seconds', 2)]:
            timing = self.make_timing(); timing[field] = value; invalid.append(timing)
        for field, value in [('source_start_seconds', 6), ('source_end_seconds', 3), ('recording_start_seconds', 1), ('playback_rate', 0.6)]:
            timing = self.make_timing(); timing['segments'][1][field] = value; invalid.append(timing)
        invalid.extend([{'version': 1}, 'invalid JSON'])
        for timing in invalid:
            response = self.simultaneous_upload(session, timing)
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.simultaneous_upload(session).status_code, 400)
        transcribe.assert_not_called()
        self.assertEqual(AIStudySession.objects.get(pk=session['id']).messages.count(), 1)

    def test_simultaneous_text_alternative_does_not_claim_oral_simultaneous_performance(self):
        session = self.create_session(interpretation_mode='simultaneous')
        response = self.submit(session)
        self.assertEqual(response.status_code, 200)
        report = response.data['guided_state']['interpreter']['report']
        self.assertEqual(report['simultaneous_segments'], 0)
        self.assertEqual(report['oral_segments'], 0)

    def test_non_simultaneous_sessions_reject_timeline_metadata(self):
        session = self.create_session()
        response = self.submit(session, simultaneous_timing=self.make_timing())
        self.assertEqual(response.status_code, 400)

    def test_unknown_interpretation_mode_is_rejected(self):
        response = self.client.post('/api/ai-study/sessions/', dict(mode='listening', scenario_label='Pregação', level='A2',
                                   interpreter_settings={'interpretation_mode': 'unknown'}), format='json')
        self.assertEqual(response.status_code, 400)
