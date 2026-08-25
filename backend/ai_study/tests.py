from datetime import timedelta
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from types import SimpleNamespace
from unittest.mock import patch
from accounts.models import User
from lessons.models import Attachment, Lesson, LessonSummary, NewWord, VocabularyCard, VocabularyCategory
from .guided_tutor import build_default_guided_state
from .services import AIStudyContextService, AIStudyOpenAIService, AIStudyWorkflowService, LessonSummaryWorkflowService
from .models import AIConversationMessage, AIStudyRecommendation, AIStudySession, SpeakingFeedback, WritingFeedback


class AIStudyAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(email='teacher-ai@test.com', password='123', role='teacher', name='Teacher')
        self.student = User.objects.create_user(email='student-ai@test.com', password='123', role='student', name='Student', level='B1')
        self.other_student = User.objects.create_user(email='other-ai@test.com', password='123', role='student', name='Other', level='B1')
        self.admin = User.objects.create_user(email='admin-ai@test.com', password='123', role='admin', name='Admin')
        self.lesson = Lesson.objects.create(
            title='Past lesson',
            level='B1',
            student=self.student,
            teacher=self.teacher,
            status='completed',
            date=timezone.now(),
            notes='Practiced past tense and travel vocabulary.',
        )

    def activate_guided_session(self, session):
        state = build_default_guided_state(session.mode, suggested_level=self.student.level)
        state.update({
            'stage': 'active',
            'scenario_key': 'restaurant',
            'scenario_label': 'Restaurante',
            'level': 'B1',
            'level_source': 'selected',
            'objective': 'Ganhar confianca para falar em ingles no cenario Restaurante com recursos de nivel B1.',
            'current_task': 'Responda em ingles como faria um pedido em um restaurante.',
            'expected_input': 'audio_or_text' if session.mode == 'speaking' else 'text_submission',
            'input_placeholder': 'Responda em ingles.',
        })
        session.guided_state = state
        session.save(update_fields=['guided_state'])
        return session

    def test_student_can_create_own_ai_study_session(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post('/api/ai-study/sessions/', {'mode': 'review', 'lesson_id': str(self.lesson.id)})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(str(response.data['student']), str(self.student.id))
        self.assertEqual(str(response.data['lesson']), str(self.lesson.id))
        self.assertEqual(response.data['mode'], 'review')
        self.assertTrue(AIConversationMessage.objects.filter(session_id=response.data['id'], role='assistant').exists())

    def test_student_cannot_create_ai_study_session_without_lesson(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post('/api/ai-study/sessions/', {'mode': 'review'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_student_can_create_speaking_session_without_lesson(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post('/api/ai-study/sessions/', {'mode': 'speaking'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['mode'], 'speaking')
        self.assertIsNone(response.data['lesson'])
        self.assertEqual(response.data['guided_state']['stage'], 'choose_scenario')
        self.assertEqual(response.data['messages'][0]['metadata']['stage'], 'choose_scenario')
        self.assertGreater(len(response.data['messages'][0]['metadata']['choices']), 5)

    @patch('ai_study.services.AIStudyOpenAIService.generate_tts', return_value='/media/ai_study/tts/listening-test.mp3')
    @patch('ai_study.services.AIStudyOpenAIService.generate_listening_exercise')
    def test_student_can_create_listening_session_with_topic_and_level(self, generate_exercise_mock, _generate_tts_mock):
        generate_exercise_mock.return_value = {
            'transcript': 'Where is gate twenty four?',
            'instructions': 'Listen carefully and type what you hear.',
            'alternatives': [
                'Where is gate twenty four?',
                'Where is gate twenty five?',
                'Where are seats twenty four?',
                'Where is my bag today?',
            ],
            'correct_option_index': 0,
            'focus_words': ['gate', 'twenty four'],
        }
        self.client.force_authenticate(user=self.student)

        response = self.client.post('/api/ai-study/sessions/', {
            'mode': 'listening',
            'scenario_key': 'airport',
            'scenario_label': 'Aeroporto',
            'level': 'B1',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['mode'], 'listening')
        self.assertEqual(response.data['guided_state']['stage'], 'active')
        self.assertEqual(response.data['guided_state']['scenario_label'], 'Aeroporto')
        self.assertEqual(response.data['guided_state']['level'], 'B1')
        journey = response.data['guided_state']['listening_journey']
        self.assertEqual(len(journey['steps']), 10)
        self.assertEqual(journey['steps'][0]['label'], 'Chegada ao aeroporto')
        self.assertEqual(journey['current_step_index'], 0)
        exercise = response.data['messages'][0]['metadata']['interpreter_exercise']
        self.assertEqual(exercise['tts_audio_url'], '/media/ai_study/tts/listening-test.mp3')
        self.assertEqual(len(exercise['options']), 4)
        self.assertEqual(exercise['correct_option_id'], 'option-1')
        self.assertEqual(exercise['step_title'], 'Chegada ao aeroporto')
        self.assertEqual(exercise['step_index'], 1)
        self.assertEqual(exercise['step_total'], 10)

    @patch('ai_study.services.AIStudyOpenAIService.generate_tts', side_effect=Exception('tts unavailable'))
    @patch('ai_study.services.AIStudyOpenAIService.generate_listening_exercise')
    def test_listening_session_creation_survives_tts_failure(self, generate_exercise_mock, _generate_tts_mock):
        generate_exercise_mock.return_value = {
            'transcript': 'Where is gate twenty four?',
            'instructions': 'Listen carefully and type what you hear.',
            'alternatives': [
                'Where is gate twenty four?',
                'Where is gate twenty five?',
                'Where are seats twenty four?',
                'Where is my bag today?',
            ],
            'correct_option_index': 0,
            'focus_words': ['gate', 'twenty four'],
        }
        self.client.force_authenticate(user=self.student)

        response = self.client.post('/api/ai-study/sessions/', {
            'mode': 'listening',
            'scenario_key': 'airport',
            'scenario_label': 'Aeroporto',
            'level': 'B1',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        exercise = response.data['messages'][0]['metadata']['interpreter_exercise']
        self.assertIsNone(exercise['tts_audio_url'])
        self.assertTrue(exercise['tts_unavailable'])
        self.assertIn('audio nao foi gerado agora', response.data['guided_state']['progress_summary'])

    def test_speaking_session_guided_onboarding_advances_scenario_and_level(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.post('/api/ai-study/sessions/', {'mode': 'speaking'})
        session_id = response.data['id']

        scenario_response = self.client.post(
            f'/api/ai-study/sessions/{session_id}/message/',
            {'guided_action': {'action_type': 'scenario', 'value': 'restaurant', 'label': 'Restaurante'}},
            format='json',
        )
        self.assertEqual(scenario_response.status_code, status.HTTP_200_OK)
        self.assertEqual(scenario_response.data['assistant_message']['metadata']['stage'], 'choose_level')

        level_response = self.client.post(
            f'/api/ai-study/sessions/{session_id}/message/',
            {'guided_action': {'action_type': 'level', 'value': 'B1', 'label': 'B1'}},
            format='json',
        )
        self.assertEqual(level_response.status_code, status.HTTP_200_OK)
        self.assertEqual(level_response.data['assistant_message']['metadata']['stage'], 'active')

        session = AIStudySession.objects.get(id=session_id)
        self.assertEqual(session.guided_state['scenario_label'], 'Restaurante')
        self.assertEqual(session.guided_state['level'], 'B1')
        self.assertEqual(session.guided_state['stage'], 'active')

    def test_sessions_list_returns_full_history_as_array(self):
        sessions = [
            AIStudySession.objects.create(student=self.student, mode='writing', theme='custom', title=f'Writing {index}')
            for index in range(12)
        ]
        self.client.force_authenticate(user=self.student)

        response = self.client.get('/api/ai-study/sessions/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), len(sessions))
        returned_ids = {str(item['id']) for item in response.data}
        expected_ids = {str(session.id) for session in sessions}
        self.assertSetEqual(returned_ids, expected_ids)

    def test_student_can_pin_session_and_pinned_items_come_first(self):
        pinned_session = AIStudySession.objects.create(student=self.student, mode='writing', theme='custom', title='Pinned draft')
        pinned_session.last_interaction_at = timezone.now() - timedelta(days=2)
        pinned_session.save(update_fields=['last_interaction_at'])
        recent_session = AIStudySession.objects.create(student=self.student, mode='writing', theme='custom', title='Recent draft')
        self.client.force_authenticate(user=self.student)

        pin_response = self.client.post(
            f'/api/ai-study/sessions/{pinned_session.id}/pin/',
            {'pinned': True},
            format='json',
        )

        self.assertEqual(pin_response.status_code, status.HTTP_200_OK)
        self.assertTrue(pin_response.data['is_pinned'])

        response = self.client.get('/api/ai-study/sessions/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data[0]['id']), str(pinned_session.id))
        self.assertEqual(str(response.data[1]['id']), str(recent_session.id))

    def test_student_cannot_access_other_student_session(self):
        session = AIStudySession.objects.create(student=self.other_student, mode='speaking', theme='travel')
        self.client.force_authenticate(user=self.student)
        response = self.client.get(f'/api/ai-study/sessions/{session.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch('ai_study.views.AIStudyOpenAIService.translate_selection', return_value='Tenho trabalhado neste projeto desde segunda-feira passada.')
    def test_student_can_translate_selected_text_from_own_session(self, translate_mock):
        session = AIStudySession.objects.create(student=self.student, mode='review', theme='minhas_aulas')
        self.client.force_authenticate(user=self.student)

        response = self.client.post(
            f'/api/ai-study/sessions/{session.id}/translate-selection/',
            {'text': 'I have been working on this project since last Monday.'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data['translation'],
            'Tenho trabalhado neste projeto desde segunda-feira passada.',
        )
        translate_mock.assert_called_once_with('I have been working on this project since last Monday.')

    def test_context_lessons_only_returns_accessible_lessons(self):
        Lesson.objects.create(title='Other lesson', level='B1', student=self.other_student, teacher=self.teacher, status='completed', date=timezone.now())
        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/ai-study/context-lessons/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item['title'] for item in response.data]
        self.assertEqual(titles, ['Past lesson'])

    def test_audio_upload_rejects_invalid_file_type(self):
        session = AIStudySession.objects.create(student=self.student, mode='speaking', theme='travel')
        self.activate_guided_session(session)
        self.client.force_authenticate(user=self.student)
        upload = SimpleUploadedFile('notes.txt', b'not audio', content_type='text/plain')
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/audio/', {'audio': upload}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_audio_upload_requires_onboarding_for_guided_speaking(self):
        session = AIStudySession.objects.create(student=self.student, mode='speaking', theme='travel')
        self.client.force_authenticate(user=self.student)
        upload = SimpleUploadedFile('speech.webm', b'audio bytes', content_type='audio/webm')
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/audio/', {'audio': upload}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('ai_study.services.AIStudyOpenAIService.generate_tts', return_value='/media/ai_study/tts/listening-step-2.mp3')
    @patch('ai_study.services.AIStudyOpenAIService.generate_listening_exercise')
    def test_listening_answer_creates_feedback_and_advances_journey(self, generate_exercise_mock, _generate_tts_mock):
        generate_exercise_mock.return_value = {
            'transcript': 'Do you have a reservation for tonight?',
            'instructions': 'Listen carefully and type what you hear.',
            'alternatives': [
                'Do you have a reservation for tonight?',
                'Do you have a reservation for tomorrow?',
                'Do you need a reservation for tonight?',
                'Would you like a reservation for tonight?',
            ],
            'correct_option_index': 0,
            'focus_words': ['reservation', 'tonight'],
        }
        session = AIStudySession.objects.create(student=self.student, mode='listening', theme='custom')
        AIStudyWorkflowService.prepare_listening_session(session, 'restaurant', 'Restaurante', 'B1')
        challenge = AIConversationMessage.objects.create(
            session=session,
            role='assistant',
            content_type='text',
            text='Could I have a table for two, please?',
            metadata={
                'mode': 'listening',
                'interpreter': True,
                'interpreter_exercise': {
                    'id': 'exercise-1',
                    'round': 1,
                    'scenario_key': 'restaurant',
                    'scenario_label': 'Restaurante',
                    'level': 'B1',
                    'instructions': 'Listen and transcribe.',
                    'tts_audio_url': '/media/ai_study/tts/test.mp3',
                    'correct_option_id': 'option-1',
                    'options': [
                        {'id': 'option-1', 'text': 'Could I have a table for two, please?'},
                        {'id': 'option-2', 'text': 'Could I have a table for three, please?'},
                    ],
                    'focus_words': ['table', 'please'],
                    'step_id': 'arrival',
                    'step_title': 'Chegada ao restaurante',
                    'step_index': 1,
                    'step_total': 6,
                },
            },
        )
        self.client.force_authenticate(user=self.student)

        response = self.client.post(
            f'/api/ai-study/sessions/{session.id}/listening/answer/',
            {
                'message_id': str(challenge.id),
                'response_mode': 'transcription',
                'answer_text': 'Could I have a table for two please',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user_message']['text'], 'Could I have a table for two please')
        self.assertEqual(response.data['assistant_message']['metadata']['interpreter_feedback']['status'], 'correct')
        self.assertEqual(response.data['session']['guided_state']['listening_journey']['current_step_index'], 1)
        self.assertIsNotNone(response.data['follow_up_message'])
        self.assertEqual(response.data['follow_up_message']['metadata']['interpreter_exercise']['step_index'], 2)
        self.assertEqual(
            response.data['follow_up_message']['metadata']['interpreter_exercise']['tts_audio_url'],
            '/media/ai_study/tts/listening-step-2.mp3',
        )

    @patch('ai_study.services.AIStudyOpenAIService.generate_tts', return_value='/media/ai_study/tts/listening-next.mp3')
    @patch('ai_study.services.AIStudyOpenAIService.generate_listening_exercise')
    def test_listening_next_generates_new_audio_message(self, generate_exercise_mock, _generate_tts_mock):
        generate_exercise_mock.return_value = {
            'transcript': 'Where is gate twenty four?',
            'instructions': 'Listen carefully and type what you hear.',
            'alternatives': [
                'Where is gate twenty four?',
                'Where is gate twenty five?',
                'Where are seats twenty four?',
                'Where is my bag today?',
            ],
            'correct_option_index': 0,
            'focus_words': ['gate'],
        }
        session = AIStudySession.objects.create(student=self.student, mode='listening', theme='custom')
        AIStudyWorkflowService.prepare_listening_session(session, 'airport', 'Aeroporto', 'B1')
        self.client.force_authenticate(user=self.student)

        response = self.client.post(f'/api/ai-study/sessions/{session.id}/listening/next/')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['assistant_message']['metadata']['interpreter_exercise']['tts_audio_url'], '/media/ai_study/tts/listening-next.mp3')
        self.assertEqual(response.data['assistant_message']['metadata']['interpreter_exercise']['step_title'], 'Chegada ao aeroporto')
        self.assertEqual(response.data['assistant_message']['metadata']['interpreter_exercise']['step_total'], 10)
        self.assertEqual(response.data['session']['mode'], 'listening')

    def test_listening_final_step_marks_journey_completed(self):
        session = AIStudySession.objects.create(student=self.student, mode='listening', theme='custom')
        AIStudyWorkflowService.prepare_listening_session(session, 'airport', 'Aeroporto', 'B1')
        state = session.guided_state
        state['listening_journey']['current_step_index'] = 9
        state['listening_journey']['completed_step_ids'] = [
            step['id']
            for step in state['listening_journey']['steps'][:9]
        ]
        session.guided_state = state
        session.save(update_fields=['guided_state'])
        challenge = AIConversationMessage.objects.create(
            session=session,
            role='assistant',
            content_type='text',
            text='Please collect your bags from carousel seven.',
            metadata={
                'mode': 'listening',
                'interpreter': True,
                'interpreter_exercise': {
                    'id': 'exercise-final',
                    'round': 10,
                    'scenario_key': 'airport',
                    'scenario_label': 'Aeroporto',
                    'level': 'B1',
                    'instructions': 'Listen and transcribe.',
                    'tts_audio_url': '/media/ai_study/tts/final.mp3',
                    'correct_option_id': 'option-1',
                    'options': [
                        {'id': 'option-1', 'text': 'Please collect your bags from carousel seven.'},
                        {'id': 'option-2', 'text': 'Please leave your bags near carousel seven.'},
                    ],
                    'focus_words': ['carousel', 'bags'],
                    'step_id': 'baggage_claim',
                    'step_title': 'Retirada da bagagem',
                    'step_index': 10,
                    'step_total': 10,
                },
            },
        )
        self.client.force_authenticate(user=self.student)

        response = self.client.post(
            f'/api/ai-study/sessions/{session.id}/listening/answer/',
            {
                'message_id': str(challenge.id),
                'response_mode': 'multiple_choice',
                'selected_option_id': 'option-1',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['assistant_message']['metadata']['interpreter_feedback']['status'], 'correct')
        self.assertEqual(response.data['session']['status'], 'completed')
        self.assertEqual(response.data['session']['guided_state']['session_status'], 'completed')
        self.assertTrue(response.data['follow_up_message']['metadata']['interpreter_journey_completed'])

    @patch('ai_study.services.AIStudyOpenAIService.transcribe', return_value='I go to airport yesterday.')
    @patch('ai_study.services.AIStudyOpenAIService.analyze_speaking')
    def test_audio_upload_saves_structured_feedback(self, analyze_mock, _transcribe_mock):
        analyze_mock.return_value = {
            'transcript': 'I go to airport yesterday.',
            'overall_score': 74,
            'estimated_level': 'B1',
            'pronunciation_score': 72,
            'fluency_score': 68,
            'intonation_score': 66,
            'clarity_score': 71,
            'corrected_sentence': 'I went to the airport yesterday.',
            'natural_sentence': 'I went to the airport yesterday.',
            'ai_feedback': 'Good attempt. Use past tense for yesterday.',
            'correct_words': ['yesterday'],
            'problem_words': ['airport'],
            'pronunciation_mistakes': ['airport stress'],
            'error_details': [{'word': 'airport', 'issue': 'stress on the first syllable', 'tip': 'Say AIR-port'}],
            'grammar_explanation': 'Use went for past tense.',
            'improvement_tips': ['Slow down before the stressed syllable.'],
            'practice_exercises': ['Repeat: airport, boarding, passport.'],
            'vocabulary_suggestions': ['departure gate'],
            'native_alternative_sentence': 'I went to the airport yesterday.',
            'assistant_response': 'Nice work. What did you do at the airport?',
        }
        session = AIStudySession.objects.create(student=self.student, mode='speaking', theme='travel')
        self.activate_guided_session(session)
        self.client.force_authenticate(user=self.student)
        upload = SimpleUploadedFile('speech.webm', b'audio bytes', content_type='audio/webm')
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/audio/', {'audio': upload, 'duration_seconds': '3'}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        feedback = SpeakingFeedback.objects.get(session=session)
        self.assertEqual(feedback.transcript, 'I go to airport yesterday.')
        self.assertEqual(feedback.overall_score, 74)
        self.assertEqual(feedback.estimated_level, 'B1')
        self.assertEqual(feedback.pronunciation_score, 72)
        self.assertEqual(feedback.intonation_score, 66)
        self.assertEqual(feedback.problem_words, ['airport'])

    def test_tts_requires_corrected_or_natural_sentence(self):
        session = AIStudySession.objects.create(student=self.student, mode='speaking', theme='travel')
        audio = session.speaking_audios.create(student=self.student, audio=SimpleUploadedFile('speech.webm', b'audio', content_type='audio/webm'), mime_type='audio/webm')
        feedback = SpeakingFeedback.objects.create(session=session, audio=audio, transcript='Hello', ai_feedback='Good')
        self.client.force_authenticate(user=self.student)
        response = self.client.post(f'/api/ai-study/feedback/{feedback.id}/tts/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_lesson_snapshot_includes_saved_summary_and_visual_references(self):
        LessonSummary.objects.create(
            lesson=self.lesson,
            student=self.student,
            teacher=self.teacher,
            summary='Resumo visível para o professor.',
            raw_ai_response={'summary': 'Contexto sintetizado da aula.'},
        )
        Attachment.objects.create(
            lesson=self.lesson,
            file=SimpleUploadedFile('whiteboard-flow.png', b'image-bytes', content_type='image/png'),
        )

        snapshot = AIStudyContextService.lesson_snapshot(self.lesson)

        self.assertEqual(snapshot['summary_context'], 'Resumo visível para o professor.')
        self.assertEqual(snapshot['ai_context_summary'], 'Contexto sintetizado da aula.')
        self.assertEqual(len(snapshot['visual_references']), 1)
        self.assertTrue(snapshot['visual_references'][0]['name'].startswith('whiteboard-flow'))

    def test_lesson_snapshot_includes_flashcards_and_structured_summary_details(self):
        summary = LessonSummary.objects.create(
            lesson=self.lesson,
            student=self.student,
            teacher=self.teacher,
            summary='Resumo do professor.',
            homework='Praticar perguntas sobre clima.',
            observations='Aluno teve dificuldade com rainy x cloudy.',
            raw_ai_response={'summary': 'Contexto sintetizado focado em weather vocabulary.'},
        )
        summary.words.create(word='forecast', meaning='previsao do tempo')
        summary.mistakes.create(mistake='Is rain today?', correction='Is it raining today?')
        summary.next_topics.create(topic='weather small talk')
        category = VocabularyCategory.objects.create(name='Vocabulary', slug='vocabulary', is_default=True)
        VocabularyCard.objects.create(
            student=self.student,
            teacher=self.teacher,
            lesson=self.lesson,
            source_type='lesson',
            word='drizzle',
            translation='chuvisco',
            explanation='Light rain',
            example_sentence='It is starting to drizzle outside.',
            category=category,
        )

        snapshot = AIStudyContextService.lesson_snapshot(self.lesson)

        self.assertEqual(snapshot['summary_homework'], 'Praticar perguntas sobre clima.')
        self.assertEqual(snapshot['summary_observations'], 'Aluno teve dificuldade com rainy x cloudy.')
        self.assertEqual(snapshot['summary_words'][0]['word'], 'forecast')
        self.assertEqual(snapshot['summary_mistakes'][0]['correction'], 'Is it raining today?')
        self.assertEqual(snapshot['summary_next_topics'], ['weather small talk'])
        self.assertEqual(snapshot['flashcards'][0]['word'], 'drizzle')
        self.assertEqual(snapshot['flashcards'][0]['translation'], 'chuvisco')

    @patch('ai_study.services.AIStudyOpenAIService.generate_lesson_summary')
    def test_teacher_summary_does_not_duplicate_notes_but_ai_context_is_preserved(self, generate_summary_mock):
        NewWord.objects.create(
            lesson=self.lesson,
            word='default profile',
            meaning='perfil padrao',
            level='B1',
        )
        Attachment.objects.create(
            lesson=self.lesson,
            file=SimpleUploadedFile('whiteboard-flow.png', b'image-bytes', content_type='image/png'),
        )
        generate_summary_mock.return_value = {
            'summary': 'A aula explicou visualmente o fluxo para trocar o terminal padrao no VS Code.',
            'newWords': [{'word': 'default profile', 'meaning': 'perfil padrao'}],
            'mistakesCorrected': [],
            'homework': '',
            'nextTopics': [],
            'flashcards': [{'front': 'default profile', 'back': 'perfil padrao'}],
        }

        summary = LessonSummaryWorkflowService.create_or_update_from_ai(self.lesson, self.teacher, {
            'notes': self.lesson.notes,
        })
        snapshot = AIStudyContextService.lesson_snapshot(self.lesson)

        self.assertIn('Palavras aprendidas:', summary.summary)
        self.assertIn('Referências anexadas:', summary.summary)
        self.assertNotIn('Practiced past tense and travel vocabulary.', summary.summary)
        self.assertEqual(
            snapshot['ai_context_summary'],
            'A aula explicou visualmente o fluxo para trocar o terminal padrao no VS Code.',
        )

    def test_prompt_context_prioritizes_selected_lessons_and_includes_flashcards(self):
        category = VocabularyCategory.objects.create(name='Vocabulary', slug='vocabulary', is_default=True)
        VocabularyCard.objects.create(
            student=self.student,
            teacher=self.teacher,
            lesson=self.lesson,
            source_type='lesson',
            word='humidity',
            translation='umidade',
            category=category,
        )
        LessonSummary.objects.create(
            lesson=self.lesson,
            student=self.student,
            teacher=self.teacher,
            summary='Resumo do professor.',
            raw_ai_response={'summary': 'Resumo sintetizado da aula sobre clima.'},
        )
        session = AIStudySession.objects.create(student=self.student, mode='speaking', theme='minhas_aulas')
        AIStudyContextService.set_context_lessons(session, [self.lesson.id])

        prompt_context = AIStudyContextService.prompt_context(session)

        self.assertIn('Use selected_lessons as the primary source of truth', prompt_context)
        self.assertIn('CURRENT SELECTED LESSONS: Past lesson', prompt_context)
        self.assertIn('humidity', prompt_context)
        self.assertIn('Resumo sintetizado da aula sobre clima.', prompt_context)

    @patch('ai_study.services.client.chat.completions.create')
    def test_generate_chat_response_sends_selected_lesson_images_and_context(self, create_mock):
        category = VocabularyCategory.objects.create(name='Vocabulary', slug='vocabulary', is_default=True)
        VocabularyCard.objects.create(
            student=self.student,
            teacher=self.teacher,
            lesson=self.lesson,
            source_type='lesson',
            word='storm',
            translation='tempestade',
            category=category,
        )
        Attachment.objects.create(
            lesson=self.lesson,
            file=SimpleUploadedFile('weather-board.png', b'image-bytes', content_type='image/png'),
        )
        LessonSummary.objects.create(
            lesson=self.lesson,
            student=self.student,
            teacher=self.teacher,
            summary='Resumo do professor.',
            raw_ai_response={'summary': 'A aula focou em descrever o clima com apoio visual do quadro.'},
        )
        session = AIStudySession.objects.create(student=self.student, mode='speaking', theme='minhas_aulas')
        AIStudyContextService.set_context_lessons(session, [self.lesson.id])
        AIConversationMessage.objects.create(session=session, role='user', content_type='text', text='Hi teacher')

        create_mock.return_value = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='Sure.'))]
        )

        AIStudyOpenAIService.generate_chat_response(session, 'Can you review this lesson?')

        create_mock.assert_called_once()
        payload = create_mock.call_args.kwargs
        self.assertEqual(payload['model'], 'gpt-4o')
        messages = payload['messages']
        self.assertIn('Selected lesson context is primary', messages[0]['content'])
        self.assertIsInstance(messages[1]['content'], list)
        text_block = next(block for block in messages[1]['content'] if block['type'] == 'text')
        self.assertIn('storm', text_block['text'])
        self.assertIn('A aula focou em descrever o clima', text_block['text'])
        self.assertTrue(any(block['type'] == 'image_url' for block in messages[1]['content']))

    @patch('ai_study.services.AIStudyOpenAIService.analyze_writing')
    def test_writing_message_creates_structured_feedback(self, analyze_writing_mock):
        analyze_writing_mock.return_value = {
            'estimated_level': 'A2',
            'writing_score': 63,
            'sub_scores': {
                'grammar': 58,
                'vocabulary': 61,
                'naturality': 60,
                'coherence': 66,
                'complexity': 52,
            },
            'corrected_text': 'I went to the park yesterday and it was very fun.',
            'general_feedback': 'Good message with simple ideas.',
            'level_progress_feedback': 'To reach B1, use more connectors and more varied verbs.',
            'strengths': ['Clear meaning'],
            'error_explanations': [
                {
                    'excerpt': 'I go to the park yesterday',
                    'corrected': 'I went to the park yesterday',
                    'explanation': 'Use past simple with yesterday.',
                    'category': 'Grammar',
                }
            ],
            'improvement_tips': ['Use connectors like because, but and so.'],
            'rewrites': {
                'B1': 'Yesterday I went to the park, and I had a great time there.',
                'B2': 'Yesterday I went to the park, where I spent an enjoyable afternoon relaxing and walking.',
                'C1': 'Yesterday I went to the park and found the whole experience genuinely refreshing and enjoyable.',
                'C2': 'Yesterday I visited the park, an outing that proved remarkably invigorating and unexpectedly memorable.',
            },
            'exercises': ['Rewrite three past simple sentences about yesterday.'],
            'grammar_breakdown': ['Past simple is required with finished past time markers like yesterday.'],
            'vocabulary_flashcards': [{'term': 'invigorating', 'meaning': 'revigorante', 'example': 'The walk was invigorating.'}],
            'assistant_response': 'Here is your writing analysis.',
        }
        session = AIStudySession.objects.create(student=self.student, mode='writing', theme='custom')
        self.activate_guided_session(session)
        self.client.force_authenticate(user=self.student)

        response = self.client.post(f'/api/ai-study/sessions/{session.id}/message/', {
            'text': 'I go to the park yesterday and it was very fun.',
            'text_type': 'free',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        feedback = WritingFeedback.objects.get(session=session)
        self.assertEqual(feedback.estimated_level, 'A2')
        self.assertEqual(feedback.writing_score, 63)
        self.assertIn('B2', feedback.rewrites)
        self.assertEqual(response.data['assistant_message']['content_type'], 'writing_feedback')
        self.assertIn('Versao sugerida:', response.data['assistant_message']['text'])
        self.assertNotIn('Proximo passo recomendado', response.data['assistant_message']['text'])

    @patch('ai_study.services.AIStudyOpenAIService.generate_guided_tutor_reply')
    @patch('ai_study.services.AIStudyOpenAIService.analyze_writing')
    def test_writing_request_in_chat_format_uses_tutor_reply_instead_of_analysis(self, analyze_writing_mock, guided_reply_mock):
        guided_reply_mock.return_value = {
            'assistant_response': 'Sure. Here is a short model text about the topic for you to study.',
            'activity_type': 'model_text',
            'recommended_next_step': 'continue',
            'objective': 'Help the student with a model text before asking for a new writing attempt.',
            'difficulty': 'guided',
            'progress_summary': 'The student asked for an example before writing.',
            'learned_words': [],
            'recurring_errors': [],
            'quick_replies': [],
            'expected_input': 'chat',
            'current_task': 'Read the model text and ask for vocabulary or write your own version.',
            'input_placeholder': 'Escreva sua proxima pergunta ou seu proprio texto em ingles.',
            'should_wrap_up': False,
            'session_summary': [],
        }
        session = AIStudySession.objects.create(student=self.student, mode='writing', theme='custom')
        self.activate_guided_session(session)
        self.client.force_authenticate(user=self.student)

        response = self.client.post(f'/api/ai-study/sessions/{session.id}/message/', {
            'text': 'Quero um texto sobre o assunto!',
            'text_type': 'free',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['assistant_message']['content_type'], 'text')
        self.assertEqual(WritingFeedback.objects.filter(session=session).count(), 0)
        analyze_writing_mock.assert_not_called()
        guided_reply_mock.assert_called_once()
        self.assertIn('model text', response.data['assistant_message']['text'])
        self.assertTrue(response.data['assistant_message']['metadata']['choices'])

    @patch('ai_study.services.AIStudyOpenAIService.analyze_writing')
    def test_writing_feedback_sanitizes_json_dump_in_assistant_response(self, analyze_writing_mock):
        analyze_writing_mock.return_value = {
            'estimated_level': 'A1',
            'writing_score': 40,
            'sub_scores': {
                'grammar': 3,
                'vocabulary': 3,
                'naturality': 3,
                'coherence': 2,
                'complexity': 2,
            },
            'corrected_text': 'I went to the park yesterday and it was fun.',
            'general_feedback': 'Your idea is clear, but the verb tense needs adjustment.',
            'level_progress_feedback': 'Use past simple consistently when you describe finished actions.',
            'strengths': ['Clear intention'],
            'error_explanations': [
                {
                    'excerpt': 'I go to the park yesterday and it is fun.',
                    'corrected': 'I went to the park yesterday and it was fun.',
                    'explanation': 'Use past simple with yesterday and keep the sentence in the same time frame.',
                    'category': 'Grammar',
                }
            ],
            'improvement_tips': ['Practice past simple with regular and irregular verbs.'],
            'rewrites': {
                'B1': 'Yesterday I went to the park and had a good time there.',
                'B2': 'Yesterday I went to the park, where I spent an enjoyable afternoon walking and relaxing.',
                'C1': 'Yesterday I went to the park and found the whole outing enjoyable and refreshing.',
                'C2': 'Yesterday I visited the park, an experience that turned out to be both pleasant and memorable.',
            },
            'exercises': ['Write three sentences about what you did yesterday.'],
            'grammar_breakdown': ['Use past simple with finished time markers such as yesterday.'],
            'vocabulary_flashcards': [],
            'assistant_response': '{"estimated_level":"A1","writing_score":40,"general_feedback":"Too much JSON"}',
        }
        session = AIStudySession.objects.create(student=self.student, mode='writing', theme='custom')
        self.activate_guided_session(session)
        self.client.force_authenticate(user=self.student)

        response = self.client.post(f'/api/ai-study/sessions/{session.id}/message/', {
            'text': 'I go to the park yesterday and it is fun.',
            'text_type': 'free',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        assistant_text = response.data['assistant_message']['text']
        self.assertNotIn('"estimated_level"', assistant_text)
        self.assertIn('Versao sugerida:', assistant_text)
        self.assertIn('I went to the park yesterday and it was fun.', assistant_text)
        self.assertIn('Dica rapida:', assistant_text)

    def test_teacher_can_set_and_clear_recommendation(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.post('/api/ai-study/recommendations/current/', {
            'student_id': str(self.student.id),
            'mode': 'speaking',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        recommendation = AIStudyRecommendation.objects.get(student=self.student)
        self.assertEqual(recommendation.mode, 'speaking')

        delete_response = self.client.delete(f'/api/ai-study/recommendations/current/?student={self.student.id}')
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(AIStudyRecommendation.objects.filter(student=self.student).exists())

    def test_progress_overview_returns_speaking_and_writing_history(self):
        session = AIStudySession.objects.create(student=self.student, mode='speaking', theme='custom')
        audio = session.speaking_audios.create(
            student=self.student,
            audio=SimpleUploadedFile('speech.webm', b'audio', content_type='audio/webm'),
            mime_type='audio/webm',
        )
        SpeakingFeedback.objects.create(
            session=session,
            audio=audio,
            transcript='Hello world',
            overall_score=81,
            estimated_level='B1',
            pronunciation_score=80,
            fluency_score=79,
            intonation_score=82,
            clarity_score=83,
            problem_words=['world'],
            ai_feedback='Solid attempt',
        )
        writing_session = AIStudySession.objects.create(student=self.student, mode='writing', theme='custom')
        WritingFeedback.objects.create(
            session=writing_session,
            student=self.student,
            text_type='email',
            original_text='Hello teacher',
            corrected_text='Hello teacher, how are you?',
            estimated_level='A2',
            writing_score=67,
        )

        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/ai-study/progress/overview/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['speaking_history'][0]['overall_score'], 81)
        self.assertEqual(response.data['writing_history'][0]['writing_score'], 67)
