from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from types import SimpleNamespace
from unittest.mock import patch
from accounts.models import User
from lessons.models import Attachment, Lesson, LessonSummary, NewWord, VocabularyCard, VocabularyCategory
from .services import AIStudyContextService, AIStudyOpenAIService, LessonSummaryWorkflowService
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

    def test_student_cannot_access_other_student_session(self):
        session = AIStudySession.objects.create(student=self.other_student, mode='speaking', theme='travel')
        self.client.force_authenticate(user=self.student)
        response = self.client.get(f'/api/ai-study/sessions/{session.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_context_lessons_only_returns_accessible_lessons(self):
        Lesson.objects.create(title='Other lesson', level='B1', student=self.other_student, teacher=self.teacher, status='completed', date=timezone.now())
        self.client.force_authenticate(user=self.student)
        response = self.client.get('/api/ai-study/context-lessons/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [item['title'] for item in response.data]
        self.assertEqual(titles, ['Past lesson'])

    def test_audio_upload_rejects_invalid_file_type(self):
        session = AIStudySession.objects.create(student=self.student, mode='speaking', theme='travel')
        self.client.force_authenticate(user=self.student)
        upload = SimpleUploadedFile('notes.txt', b'not audio', content_type='text/plain')
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/audio/', {'audio': upload}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

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
