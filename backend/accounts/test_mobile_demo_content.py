from datetime import date, timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from accounts.models import User
from accounts.mobile_demo_content import LEVEL_CONTENT, seed_student_content
from lessons.homework_auto import HomeworkAutoCorrectionService
from lessons.models import Homework, Lesson, NewWord, VocabularyCard, VocabularyReviewLog
from lessons.serializers import HomeworkSerializer, LessonSummarySerializer
from lessons.vocabulary import review_queue


class MobileDemoContentTests(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(email='demo-teacher@test.example', name='Demo Teacher', role='teacher')
        self.student = User.objects.create_user(email='demo-student@test.example', name='Demo Student', level='B1')
        self.lessons = [Lesson.objects.create(
            title=f'Demo B1 lesson {index + 1}', order=index + 1, level='B1', teacher=self.teacher,
            student=self.student, status='completed',
        ) for index in range(3)]
        self.anchor = timezone.localdate()

    def seed(self):
        # An accidental AI call must fail this fixture test immediately.
        with patch.object(HomeworkAutoCorrectionService, '_ai_correct', side_effect=AssertionError('No AI calls in demo seeds')):
            return seed_student_content(self.student, self.teacher, self.lessons, self.anchor)

    def test_creates_real_notes_summaries_words_and_review_states(self):
        counts = self.seed()
        self.assertEqual(counts, dict(summaries=3, new_words=9, vocabulary_cards=9, review_logs=8, homework=4, questions=12, answers=8))
        for lesson in self.lessons:
            lesson.refresh_from_db()
            self.assertIn('<h2>', lesson.notes)
            serialized = LessonSummarySerializer(lesson.summary).data
            self.assertEqual(len(serialized['words']), 3)
            self.assertEqual(len(serialized['mistakes']), 1)
            self.assertEqual(len(serialized['next_topics']), 1)
            self.assertEqual(len(serialized['flashcards']), 3)
        cards = VocabularyCard.objects.filter(student=self.student)
        self.assertEqual(set(cards.values_list('difficulty_level', flat=True)), {'new', 'weak', 'learning', 'stable', 'mastered'})
        self.assertEqual(cards.filter(mastered=True).count(), 2)
        self.assertEqual(cards.filter(favorite=True).count(), 3)
        self.assertTrue(cards.filter(next_review_at__lt=timezone.now()).exists())
        self.assertTrue(cards.filter(next_review_at__gt=timezone.now(), last_reviewed_at__isnull=False).exists())
        self.assertGreater(len(review_queue(self.student, limit=20)), 0)
        self.assertEqual(NewWord.objects.filter(lesson__student=self.student).count(), 9)
        for log in VocabularyReviewLog.objects.filter(student=self.student):
            self.assertLess(log.reviewed_at, log.next_review_at)

    def test_homework_statuses_have_consistent_answers_and_student_serialization(self):
        self.seed()
        request = APIRequestFactory().get('/api/lessons/homework/')
        request.user = self.student
        worksheets = {item.status: item for item in Homework.objects.filter(student=self.student)}
        self.assertEqual(set(worksheets), {'pending', 'in_progress', 'sent', 'corrected'})
        self.assertEqual(worksheets['pending'].answers.count(), 0)
        self.assertEqual(worksheets['in_progress'].answers.count(), 2)
        self.assertEqual(worksheets['sent'].answers.count(), 3)
        self.assertFalse(worksheets['sent'].auto_correction_enabled)
        self.assertFalse(worksheets['pending'].auto_correction_enabled)
        corrected = HomeworkSerializer(worksheets['corrected'], context={'request': request}).data
        self.assertEqual(corrected['student_report']['accuracy'], 67)
        self.assertEqual(corrected['student_report']['second_chance_correct'], 1)
        self.assertEqual(corrected['student_report']['incorrect_after_second_chance'], 1)
        self.assertTrue(corrected['teacher_feedback'])
        self.assertTrue(all(answer['is_complete'] for answer in corrected['answers']))
        for question in corrected['questions']:
            self.assertNotIn('correct_option_index', question)
            self.assertNotIn('reference_answer', question)
        progress = HomeworkSerializer(worksheets['in_progress'], context={'request': request}).data
        unfinished = [answer for answer in progress['answers'] if not answer['is_complete']]
        self.assertEqual(len(unfinished), 1)
        self.assertEqual(unfinished[0]['second_chance_question']['type'], 'multiple_choice')
        self.assertTrue(unfinished[0]['answered_at'])

    def test_live_auto_corrected_demo_can_be_finished_without_ai(self):
        self.seed()
        homework = Homework.objects.get(student=self.student, status='in_progress')
        wrong = homework.answers.get(is_correct=False)
        second = wrong.correction_metadata['second_chance_question']
        missing = homework.questions.exclude(id__in=homework.answers.values('question_id')).get()
        with patch.object(HomeworkAutoCorrectionService, '_ai_correct', side_effect=AssertionError('Offline demo should not use AI')):
            HomeworkAutoCorrectionService.submit_second_chance_answer(
                homework, wrong.question, self.student, selected_option_index=second['correct_option_index'],
            )
            HomeworkAutoCorrectionService.submit_primary_answer(
                homework, missing, self.student, selected_option_index=missing.correct_option_index,
            )
        homework.refresh_from_db()
        self.assertEqual(homework.status, 'corrected')
        self.assertEqual(homework.student_report['accuracy'], 100)

    def test_rerun_preserves_edits_and_creates_no_duplicates(self):
        self.seed()
        lesson = self.lessons[0]
        lesson.notes = '<p>Edited by teacher</p>'
        lesson.save(update_fields=['notes'])
        card = VocabularyCard.objects.filter(student=self.student).first()
        card.translation = 'Tradução personalizada'
        card.save(update_fields=['translation'])
        homework = Homework.objects.filter(student=self.student).first()
        question = homework.questions.first()
        question.prompt = 'Edited prompt'
        question.save(update_fields=['prompt'])
        self.assertTrue(all(value == 0 for value in self.seed().values()))
        lesson.refresh_from_db()
        card.refresh_from_db()
        question.refresh_from_db()
        self.assertEqual(lesson.notes, '<p>Edited by teacher</p>')
        self.assertEqual(card.translation, 'Tradução personalizada')
        self.assertEqual(question.prompt, 'Edited prompt')

    def test_all_levels_have_distinct_appropriate_content(self):
        self.assertEqual(set(LEVEL_CONTENT), {'A1/A2', 'B1', 'B2', 'C1', 'C2'})
        for level in LEVEL_CONTENT:
            with self.subTest(level=level):
                self.student.level = level
                self.student.save(update_fields=['level'])
                # A separate student gives each level its own deterministic content scope.
                student = User.objects.create_user(email=f'{level.replace("/", "-")}@demo.example', name=level, level=level)
                lessons = [Lesson.objects.create(title=f'{level} unit {i}', level=level, teacher=self.teacher, student=student, status='completed') for i in range(3)]
                counts = seed_student_content(student, self.teacher, lessons, date(2026, 10, 20))
                self.assertEqual(counts['vocabulary_cards'], 9)
                self.assertEqual(student.homework_received.count(), 4)
                self.assertEqual(student.vocabulary_cards.get(word=LEVEL_CONTENT[level]['words'][0][0]).translation, LEVEL_CONTENT[level]['words'][0][1])

    def test_rejects_lessons_owned_by_other_student(self):
        other = User.objects.create_user(email='other@demo.example', name='Other', level='B1')
        with self.assertRaisesMessage(ValueError, 'owned by'):
            seed_student_content(other, self.teacher, self.lessons, self.anchor)
        self.assertEqual(VocabularyCard.objects.count(), 0)
