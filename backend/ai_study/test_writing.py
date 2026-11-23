from copy import deepcopy
from unittest.mock import patch

from django.test import TestCase, SimpleTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from lessons.models import Lesson
from . import writing
from .models import AIStudySession, WritingFeedback, WritingSessionReport
from .services import AIStudyOpenAIService


def activity(kind='complete', structure='Where is…?', scenario='Turismo'):
    instructions = {
        'complete': 'Você quer encontrar o hotel. Complete a pergunta: Where ___ the hotel?',
        'order': 'Você quer encontrar o hotel. Organize as palavras abaixo para perguntar onde ele fica.',
        'translate': 'Você procura seu hotel. Traduza: Onde fica o hotel?',
        'build': 'Use as palavras abaixo para perguntar onde fica o hotel.',
        'answer': 'Um turista pergunta: Where do you want to go? Responda que quer ir ao hotel.',
        'correct': 'Você pergunta pelo hotel. Corrija: Where the hotel is?',
        'message': 'Escreva uma mensagem de uma frase à recepção perguntando onde fica o hotel.',
        'dialogue': 'Recepcionista: Hello! Can I help you? Escreva uma fala perguntando onde fica o hotel.',
        'paragraph': 'Escreva um parágrafo de 40 a 70 palavras para um amigo explicando como chegar ao hotel.',
        'text': 'Escreva um e-mail de 80 a 120 palavras à agência solicitando instruções para chegar ao hotel e justificando sua necessidade.',
    }
    return {
        'kind': kind, 'situation': f'No cenário {scenario}, você está em Nova York, na rua, procurando o hotel.',
        'objective': 'Perguntar onde fica um lugar.', 'structure': structure,
        'explanation': 'Where significa onde; is pode significar fica; the bathroom é o banheiro.',
        'construction': [{'text': 'Where', 'translation': 'Onde'}, {'text': 'Where is', 'translation': 'Onde fica'},
                         {'text': 'Where is the bathroom?', 'translation': 'Onde fica o banheiro?'}],
        'example': {'text': 'Where is the bathroom?', 'translation': 'Onde fica o banheiro?'},
        'similar_example': {'text': 'Where is the museum?', 'translation': 'Onde fica o museu?'},
        'instruction': instructions[kind], 'words': ['hotel', 'the', 'is', 'Where'] if kind in {'order', 'build'} else [],
        'vocabulary': [{'text': 'hotel', 'translation': 'hotel'}, {'text': 'where', 'translation': 'onde'}],
        'hint': 'Comece com Where e depois use is.', 'starter': 'Where is',
        'simpler_instruction': 'Você procura o hotel. Pergunte onde ele fica, usando o exemplo do banheiro.',
        'simulation': 'Você chega ao balcão. Recepcionista: Olá, posso ajudar? Agora use sua pergunta para encontrar o hotel.',
    }


def evaluation(outcome='correct'):
    return {
        'outcome': outcome, 'help_action': '', 'feedback': 'Boa! Sua pergunta está correta.',
        'corrected_text': 'Where is the hotel?', 'errors': [], 'used_vocabulary': ['hotel'],
        'review': 'Revise perguntas com Where is…? para pedir informações sobre lugares.',
    }


class WritingLessonTests(TestCase):
    def setUp(self):
        self.student = User.objects.create_user(email='writer@test.com', role='student', level='A1')
        self.teacher = User.objects.create_user(email='writing-teacher@test.com', role='teacher')
        self.other = User.objects.create_user(email='another-writer@test.com', role='student')
        Lesson.objects.create(student=self.student, teacher=self.teacher, title='Writing', date=timezone.now())
        self.client = APIClient()
        self.client.force_authenticate(self.student)
        generate_patch = patch.object(AIStudyOpenAIService, 'generate_writing_activity')
        self.generate = generate_patch.start()
        self.generate.side_effect = lambda session, state, kind, error='': activity(
            kind, state['writing']['focus_structure'] or 'Where is…?', state['scenario_label'])
        self.addCleanup(generate_patch.stop)
        evaluation_patch = patch.object(AIStudyOpenAIService, 'evaluate_writing_activity', return_value=evaluation())
        self.evaluate = evaluation_patch.start()
        self.addCleanup(evaluation_patch.stop)

    def send(self, session, text='', value=None, action_type='quick_action', expected=200):
        data = {'text': text} if value is None else {'guided_action': {'value': value, 'action_type': action_type}}
        response = self.client.post(f'/api/ai-study/sessions/{session.id}/message/', data, format='json')
        self.assertEqual(response.status_code, expected, response.data)
        session.refresh_from_db()
        return response

    def start(self, mode='surprise', level='A1', custom=False):
        created = self.client.post('/api/ai-study/sessions/', {'mode': 'writing'}, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        session = AIStudySession.objects.get(pk=created.data['id'])
        self.send(session, value='custom' if custom else 'tourism', action_type='scenario')
        if custom:
            self.send(session, text='Feira de artesanato em Londres')
        result = self.send(session, value=level, action_type='level')
        self.assertEqual(result.data['assistant_message']['metadata']['stage'], 'choose_writing_mode')
        self.assertEqual(len(result.data['assistant_message']['metadata']['choices']), 8)
        self.send(session, value=mode, action_type='writing_mode')
        return session

    def test_all_levels_and_modes_support_custom_and_predefined_scenarios(self):
        for level in writing.LEVEL_GUIDANCE:
            for mode in writing.PRACTICE_MODES:
                for custom in (False, True):
                    with self.subTest(level=level, mode=mode, custom=custom):
                        session = self.start(mode, level, custom)
                        engine = session.guided_state['writing']
                        self.assertEqual(engine['activity']['kind'], writing.choose_kind(engine, level))
                        self.assertIn(session.guided_state['scenario_label'], engine['activity']['situation'])
                        self.assertTrue(engine['activity']['example']['translation'])
                        if level in {'A1', 'A2'}:
                            self.assertNotIn(engine['activity']['kind'], {'paragraph', 'text'})

    def test_help_continue_and_simulation_keep_exact_activity_without_counting_answers(self):
        session = self.start()
        initial = deepcopy(session.guided_state['writing']['activity'])
        generate_count = self.generate.call_count
        for value in [*writing.HELP_LABELS, 'continue', 'simulation', 'vocabulary', 'grammar']:
            with self.subTest(action=value):
                response = self.send(session, value=value, action_type='writing_help' if value in writing.HELP_LABELS else 'quick_action')
                self.assertEqual(session.guided_state['writing']['activity'], initial)
                self.assertEqual(response.data['assistant_message']['metadata']['current_task'], initial['instruction'])
        self.assertEqual(self.generate.call_count, generate_count)
        self.evaluate.assert_not_called()
        self.assertEqual(WritingSessionReport.objects.get(session=session).report['attempts'], 0)

    def test_help_typed_in_any_language_is_not_graded_and_keeps_current_task(self):
        session = self.start()
        before = session.guided_state['writing']['activity']['id']
        self.evaluate.return_value = {**evaluation('help'), 'help_action': 'simplify', 'feedback': 'Vamos explicar de novo.'}
        response = self.send(session, text='I do not understand what to write. Can you explain?')
        self.assertEqual(response.data['assistant_message']['metadata']['writing_help']['action'], 'simplify')
        self.assertEqual(session.guided_state['writing']['activity']['id'], before)
        self.assertFalse(WritingFeedback.objects.filter(session=session).exists())

    def test_questions_short_completions_and_correct_alternatives_are_evaluated(self):
        session = self.start()
        for answer in ['is', "Where's the hotel?", 'Where is the hotel located?']:
            response = self.send(session, text=answer)
            correction = response.data['assistant_message']['metadata']['writing_correction']
            self.assertEqual(correction['outcome'], 'correct')
            self.assertEqual(correction['corrected_text'], answer)
        self.assertEqual(self.evaluate.call_count, 3)
        report = WritingSessionReport.objects.get(session=session).report
        self.assertEqual(report['correct'], 3)
        self.assertEqual(report['activities_completed'], 3)
        self.assertEqual(session.guided_state['level'], 'A1')
        self.assertEqual(session.guided_state['writing']['support'], 'light')

    def test_error_is_explained_and_next_exercise_reuses_same_structure_with_full_support(self):
        session = self.start(mode='build')
        previous = session.guided_state['writing']['activity']
        self.evaluate.return_value = {
            **evaluation('needs_work'), 'feedback': 'Quase lá! Use is depois de Where.',
            'errors': [{'excerpt': 'Where the hotel?', 'corrected': 'Where is the hotel?',
                        'explanation': 'Use is depois de Where para perguntar onde fica um lugar.', 'category': 'Estrutura da pergunta'}],
        }
        response = self.send(session, text='Where the hotel?')
        correction = response.data['assistant_message']['metadata']['writing_correction']
        next_activity = response.data['assistant_message']['metadata']['writing_activity']
        self.assertEqual(correction['original'], 'Where the hotel?')
        self.assertEqual(correction['corrected_text'], 'Where is the hotel?')
        self.assertTrue(correction['errors'][0]['explanation'])
        self.assertNotEqual(next_activity['id'], previous['id'])
        self.assertEqual(next_activity['structure'], previous['structure'])
        self.assertEqual(next_activity['support'], 'full')
        report = WritingSessionReport.objects.get(session=session).report
        self.assertEqual((report['attempts'], report['correct'], report['needs_work']), (1, 0, 1))
        self.assertEqual(report['vocabulary'], ['hotel'])

    def test_surprise_varies_activity_types_and_counts_beyond_old_unique_list_limit(self):
        session = self.start()
        kinds = []
        for _ in range(22):
            kinds.append(session.guided_state['writing']['activity']['kind'])
            self.send(session, text='Where is the hotel?')
        report = WritingSessionReport.objects.get(session=session).report
        self.assertEqual(report['activities_completed'], 22)
        self.assertEqual(report['attempts'], 22)
        self.assertEqual(len(set(kinds)), 8)
        self.assertEqual(len(report['responses']), 22)

    def test_report_finalization_is_idempotent_and_new_scenario_preserves_old_run(self):
        session = self.start()
        self.send(session, text='Where is the hotel?')
        old_run = session.guided_state['writing']['run_id']
        response = self.send(session, value='end_session', action_type='session_control')
        final_report = response.data['assistant_message']['metadata']['writing_report']
        self.assertEqual(final_report['activities_completed'], 1)
        self.assertEqual(final_report['structures'], ['Where is…?'])
        self.assertEqual(session.status, 'completed')
        completed_at = WritingSessionReport.objects.get(session=session).completed_at
        self.send(session, value='finalize_session', action_type='session_control')
        self.assertEqual(WritingSessionReport.objects.get(session=session).completed_at, completed_at)
        self.send(session, text='One more answer', expected=400)
        self.send(session, value='new_scenario', action_type='session_control')
        self.send(session, value='hotel', action_type='scenario')
        self.assertEqual(session.guided_state['level'], 'A1')
        self.send(session, value='text', action_type='writing_mode')
        self.assertNotEqual(session.guided_state['writing']['run_id'], old_run)
        self.assertEqual(WritingSessionReport.objects.get(run_id=old_run).report, final_report)
        self.assertEqual(WritingSessionReport.objects.filter(session=session).count(), 2)

    def test_changing_practice_preserves_report_and_starts_new_adapted_run(self):
        session = self.start()
        self.send(session, text='Where is the hotel?')
        self.send(session, value='change_practice')
        self.send(session, value='dialogue', action_type='writing_mode')
        self.assertEqual(session.guided_state['writing']['activity']['kind'], 'dialogue')
        self.assertEqual(session.guided_state['scenario_key'], 'tourism')
        self.assertEqual(WritingSessionReport.objects.filter(session=session, status='paused').count(), 1)

    def test_incomplete_activity_is_retried_then_fails_without_losing_current_state(self):
        session = self.start()
        self.send(session, value='change_practice')
        before = deepcopy(session.guided_state)
        invalid = activity()
        invalid['example'] = {'text': '', 'translation': ''}
        self.generate.side_effect = None
        self.generate.return_value = invalid
        self.send(session, value='surprise', action_type='writing_mode', expected=503)
        self.assertEqual(session.guided_state, before)

    def test_failed_next_activity_preserves_evaluation_and_continue_can_recover(self):
        session = self.start()
        generator = self.generate.side_effect
        self.generate.side_effect = ValueError('Temporarily invalid activity')
        response = self.send(session, text='Where is the hotel?')
        self.assertIn('writing_correction', response.data['assistant_message']['metadata'])
        self.assertNotIn('writing_activity', response.data['assistant_message']['metadata'])
        self.assertEqual(WritingSessionReport.objects.get(session=session).report['attempts'], 1)
        self.assertTrue(session.guided_state['writing']['activity_answered'])
        self.generate.side_effect = generator
        self.send(session, value='continue')
        self.assertFalse(session.guided_state['writing']['activity_answered'])
        self.assertEqual(session.guided_state['writing']['activity_index'], 1)
        self.assertEqual(WritingFeedback.objects.filter(session=session).count(), 1)

    def test_early_finalization_does_not_claim_untested_learning(self):
        session = self.start()
        response = self.send(session, value='end_session', action_type='session_control')
        report = response.data['assistant_message']['metadata']['writing_report']
        self.assertEqual((report['attempts'], report['activities_completed'], report['correct'], report['needs_work']), (0, 0, 0, 0))
        for key in ['structures', 'vocabulary', 'difficulties', 'responses']:
            self.assertEqual(report[key], [])

    def test_teacher_can_read_evidence_but_cannot_change_students_lesson(self):
        session = self.start()
        self.send(session, text='Where is the hotel?')
        record = WritingSessionReport.objects.get(session=session)
        self.client.force_authenticate(self.teacher)
        response = self.client.get(f'/api/ai-study/writing-reports/?student={self.student.id}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['report']['responses'][0]['original'], 'Where is the hotel?')
        overview = self.client.get(f'/api/ai-study/progress/overview/?student={self.student.id}')
        self.assertEqual(overview.data['writing_sessions']['total'], 1)
        self.send(session, text='Change this lesson', expected=403)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/ai-study/writing-reports/{record.id}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/ai-study/writing-reports/?student={self.student.id}').data['count'], 0)
        unrelated_teacher = User.objects.create_user(email='unrelated-writing@test.com', role='teacher')
        self.client.force_authenticate(unrelated_teacher)
        self.assertEqual(self.client.get(f'/api/ai-study/writing-reports/{record.id}/').status_code, 404)


class WritingContractTests(SimpleTestCase):
    def test_beginner_needs_progressive_construction_and_non_generic_task(self):
        payload = activity()
        for change in [{'construction': []}, {'construction': [payload['construction'][0]]},
                       {'instruction': 'Escreva algo sobre turismo.'}, {'vocabulary': []}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                writing.validate_activity({**payload, **change}, 'complete', 'A1')

    def test_correct_alternative_preserves_student_text_and_observed_vocabulary(self):
        result = writing.validate_evaluation({**evaluation(), 'used_vocabulary': ['hotel', 'museum', 'hot']}, "Where's the hotel?")
        self.assertEqual(result['corrected_text'], "Where's the hotel?")
        self.assertEqual(result['used_vocabulary'], ['hotel'])

    def test_error_without_correction_or_explanation_is_rejected(self):
        with self.assertRaises(ValueError):
            writing.validate_evaluation(evaluation('needs_work'), 'Where the hotel?')
