from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.utils import timezone
import datetime
from accounts.models import User
from .models import Lesson, NewWord, TeacherAvailability, VocabularyCard
from .vocabulary import schedule_card, vocabulary_stats

class LessonVisibilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        
        self.admin = User.objects.create_user(email='admin@test.com', password='123', role='admin', name='Admin')
        self.teacher = User.objects.create_user(email='teacher@test.com', password='123', role='teacher', name='Teacher')
        self.student1 = User.objects.create_user(email='student1@test.com', password='123', role='student', name='Student 1')
        self.student2 = User.objects.create_user(email='student2@test.com', password='123', role='student', name='Student 2')
        
        # Create a template
        self.template = Lesson.objects.create(
            title='Template Lesson', 
            level='A1/A2', 
            is_template=True, 
            status='pending'
        )
        
        # Create a lesson for student 1 taught by teacher
        self.student1_lesson = Lesson.objects.create(
            title='Student 1 Lesson',
            level='A1/A2',
            student=self.student1,
            teacher=self.teacher,
            status='scheduled'
        )
        
        # Create a lesson for student 2 taught by teacher
        self.student2_lesson = Lesson.objects.create(
            title='Student 2 Lesson',
            level='A1/A2',
            student=self.student2,
            teacher=self.teacher,
            status='pending'
        )

    def test_student_cannot_see_templates(self):
        """Um aluno não deve ver os templates de aulas na aba de listagem"""
        self.client.force_authenticate(user=self.student1)
        response = self.client.get('/api/lessons/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        titles = [item['title'] for item in response.data['results']]
        self.assertIn('Student 1 Lesson', titles)
        self.assertNotIn('Template Lesson', titles, "Alunos não devem ver templates")
        self.assertNotIn('Student 2 Lesson', titles, "Alunos só devem ver as próprias aulas")
        
    def test_teacher_can_see_templates_and_taught_lessons(self):
        """Um professor deve conseguir ver os templates base e as aulas que ele ensina"""
        self.client.force_authenticate(user=self.teacher)
        response = self.client.get('/api/lessons/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        titles = [item['title'] for item in response.data['results']]
        self.assertIn('Template Lesson', titles, "Professores devem ter visibilidade dos templates")
        self.assertIn('Student 1 Lesson', titles)
        self.assertIn('Student 2 Lesson', titles)


class LessonSchedulingValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(email='schedule-teacher@test.com', password='123', role='teacher', name='Teacher')
        self.student1 = User.objects.create_user(email='schedule-student1@test.com', password='123', role='student', name='Student 1', level='B1')
        self.student2 = User.objects.create_user(email='schedule-student2@test.com', password='123', role='student', name='Student 2', level='B1')
        self.template = Lesson.objects.create(title='B1 Template', level='B1', is_template=True, status='pending')
        self.lesson_date = timezone.now().replace(minute=0, second=0, microsecond=0) + datetime.timedelta(days=3)
        TeacherAvailability.objects.create(
            teacher=self.teacher,
            day_of_week=self.lesson_date.weekday(),
            start_time=datetime.time(8, 0),
            end_time=datetime.time(22, 0),
        )

    def test_create_lesson_rejects_conflicting_teacher_slot(self):
        Lesson.objects.create(
            title='Existing',
            level='B1',
            student=self.student1,
            teacher=self.teacher,
            template=self.template,
            date=self.lesson_date,
            status='scheduled',
        )

        response = self.client.post('/api/lessons/', {
            'template': str(self.template.id),
            'student': str(self.student2.id),
            'teacher': str(self.teacher.id),
            'date': self.lesson_date.isoformat(),
            'status': 'scheduled',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('horário', response.data['error'])

    def test_reschedule_rejects_conflicting_teacher_slot(self):
        Lesson.objects.create(
            title='Existing',
            level='B1',
            student=self.student1,
            teacher=self.teacher,
            template=self.template,
            date=self.lesson_date,
            status='scheduled',
        )
        lesson_to_move = Lesson.objects.create(
            title='Move me',
            level='B1',
            student=self.student2,
            teacher=self.teacher,
            template=self.template,
            date=self.lesson_date + datetime.timedelta(days=7),
            status='scheduled',
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(f'/api/lessons/{lesson_to_move.id}/reschedule/', {
            'date': self.lesson_date.isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('horário', response.data['error'])

    def test_teacher_can_reschedule_own_future_lesson_to_available_slot(self):
        lesson = Lesson.objects.create(
            title='Own future lesson',
            level='B1',
            student=self.student1,
            teacher=self.teacher,
            template=self.template,
            date=self.lesson_date,
            status='scheduled',
        )
        new_date = self.lesson_date + datetime.timedelta(days=7)

        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(f'/api/lessons/{lesson.id}/reschedule/', {
            'date': new_date.isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'rescheduled')
        lesson.refresh_from_db()
        self.assertEqual(lesson.date, new_date)

    def test_teacher_cannot_reschedule_past_lesson(self):
        past_date = timezone.now().replace(minute=0, second=0, microsecond=0) - datetime.timedelta(days=1)
        lesson = Lesson.objects.create(
            title='Past lesson',
            level='B1',
            student=self.student1,
            teacher=self.teacher,
            template=self.template,
            date=past_date,
            status='scheduled',
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(f'/api/lessons/{lesson.id}/reschedule/', {
            'date': self.lesson_date.isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('já passou', response.data['error'])

    def test_student_cannot_reschedule_own_future_lesson(self):
        lesson = Lesson.objects.create(
            title='Own future lesson',
            level='B1',
            student=self.student1,
            teacher=self.teacher,
            template=self.template,
            date=self.lesson_date,
            status='scheduled',
        )

        self.client.force_authenticate(user=self.student1)
        response = self.client.patch(f'/api/lessons/{lesson.id}/reschedule/', {
            'date': (self.lesson_date + datetime.timedelta(days=7)).isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Somente professores', str(response.data))

    def test_student_cannot_reschedule_another_students_lesson(self):
        lesson = Lesson.objects.create(
            title='Other student lesson',
            level='B1',
            student=self.student1,
            teacher=self.teacher,
            template=self.template,
            date=self.lesson_date,
            status='scheduled',
        )

        self.client.force_authenticate(user=self.student2)
        response = self.client.patch(f'/api/lessons/{lesson.id}/reschedule/', {
            'date': (self.lesson_date + datetime.timedelta(hours=1)).isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class StudentLessonSequenceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(email='sequence-teacher@test.com', password='123', role='teacher', name='Teacher')
        self.student = User.objects.create_user(email='sequence-student@test.com', password='123', role='student', name='Student', level='B1')
        self.template_a = Lesson.objects.create(title='Lesson A', level='B1', is_template=True, status='pending')
        self.template_b = Lesson.objects.create(title='Lesson B', level='B1', is_template=True, status='pending')
        self.template_c = Lesson.objects.create(title='Lesson C', level='B1', is_template=True, status='pending')

        base_date = timezone.now().replace(minute=0, second=0, microsecond=0) + datetime.timedelta(days=2)
        self.lesson_a = Lesson.objects.create(
            title='Lesson A',
            level='B1',
            student=self.student,
            teacher=self.teacher,
            template=self.template_a,
            date=base_date,
            status='scheduled',
            order=1,
        )
        self.lesson_b = Lesson.objects.create(
            title='Lesson B',
            level='B1',
            student=self.student,
            teacher=self.teacher,
            template=self.template_b,
            date=base_date + datetime.timedelta(days=7),
            status='scheduled',
            order=2,
        )
        self.lesson_c = Lesson.objects.create(
            title='Lesson C',
            level='B1',
            student=self.student,
            teacher=self.teacher,
            template=self.template_c,
            date=base_date + datetime.timedelta(days=14),
            status='rescheduled',
            order=3,
        )

    def test_start_lesson_can_swap_with_another_future_trail_lesson(self):
        original_first_date = self.lesson_a.date
        original_second_date = self.lesson_b.date

        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(f'/api/lessons/{self.lesson_a.id}/start_lesson/', {
            'selected_lesson': str(self.lesson_b.id),
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data['id']), str(self.lesson_b.id))
        self.assertEqual(response.data['status'], 'in_progress')

        self.lesson_a.refresh_from_db()
        self.lesson_b.refresh_from_db()

        self.assertEqual(self.lesson_b.order, 1)
        self.assertEqual(self.lesson_b.date, original_first_date)
        self.assertEqual(self.lesson_b.status, 'in_progress')
        self.assertEqual(self.lesson_a.order, 2)
        self.assertEqual(self.lesson_a.date, original_second_date)

    def test_start_lesson_can_insert_custom_lesson_and_push_remaining_sequence(self):
        original_first_date = self.lesson_a.date
        original_second_date = self.lesson_b.date
        original_third_date = self.lesson_c.date

        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(f'/api/lessons/{self.lesson_a.id}/start_lesson/', {
            'custom_lesson_title': 'Lesson ABC',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Lesson ABC')
        self.assertEqual(response.data['status'], 'in_progress')
        self.assertIsNone(response.data['template'])

        inserted_lesson = Lesson.objects.get(id=response.data['id'])
        self.lesson_a.refresh_from_db()
        self.lesson_b.refresh_from_db()
        self.lesson_c.refresh_from_db()

        self.assertEqual(inserted_lesson.date, original_first_date)
        self.assertEqual(inserted_lesson.order, 1)
        self.assertEqual(inserted_lesson.student, self.student)
        self.assertEqual(inserted_lesson.teacher, self.teacher)

        self.assertEqual(self.lesson_a.date, original_second_date)
        self.assertEqual(self.lesson_a.order, 2)
        self.assertEqual(self.lesson_a.status, 'scheduled')

        self.assertEqual(self.lesson_b.date, original_third_date)
        self.assertEqual(self.lesson_b.order, 3)
        self.assertEqual(self.lesson_b.status, 'rescheduled')

        self.assertEqual(self.lesson_c.order, 4)
        self.assertEqual(self.lesson_c.status, 'rescheduled')
        self.assertEqual(self.lesson_c.date, original_third_date + datetime.timedelta(days=7))

    def test_reorder_student_lessons_updates_future_sequence_dates(self):
        original_first_date = self.lesson_a.date
        original_second_date = self.lesson_b.date
        original_third_date = self.lesson_c.date

        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch('/api/lessons/reorder_student_lessons/', {
            'student': str(self.student.id),
            'lesson_ids': [str(self.lesson_c.id), str(self.lesson_a.id), str(self.lesson_b.id)],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.lesson_a.refresh_from_db()
        self.lesson_b.refresh_from_db()
        self.lesson_c.refresh_from_db()

        self.assertEqual(self.lesson_c.order, 1)
        self.assertEqual(self.lesson_c.date, original_first_date)
        self.assertEqual(self.lesson_c.status, 'scheduled')

        self.assertEqual(self.lesson_a.order, 2)
        self.assertEqual(self.lesson_a.date, original_second_date)
        self.assertEqual(self.lesson_a.status, 'scheduled')

        self.assertEqual(self.lesson_b.order, 3)
        self.assertEqual(self.lesson_b.date, original_third_date)
        self.assertEqual(self.lesson_b.status, 'rescheduled')

    def test_teacher_can_mark_lesson_completed_from_curriculum(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(f'/api/lessons/{self.lesson_a.id}/complete_lesson/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.lesson_a.refresh_from_db()
        self.assertEqual(self.lesson_a.status, 'completed')


class VocabularySpacedRepetitionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = User.objects.create_user(email='vocab-student@test.com', password='123', role='student', name='Vocab Student')
        self.card = VocabularyCard.objects.create(
            student=self.student,
            word='take off',
            translation='decolar; tirar',
            explanation='Phrasal verb with multiple meanings.',
            next_review_at=timezone.now(),
        )

    def test_easy_review_grows_interval_and_confidence(self):
        result = schedule_card(self.card, 'easy')
        self.card.refresh_from_db()

        self.assertEqual(result.log.rating, 'easy')
        self.assertGreaterEqual(self.card.interval_days, 4)
        self.assertGreater(self.card.repetition_count, 0)
        self.assertGreater(self.card.confidence_level, 0)
        self.assertGreater(self.card.next_review_at, timezone.now())

    def test_very_hard_review_resets_learning_state(self):
        schedule_card(self.card, 'easy')
        self.card.refresh_from_db()
        schedule_card(self.card, 'very_hard')
        self.card.refresh_from_db()

        self.assertEqual(self.card.repetition_count, 0)
        self.assertEqual(self.card.difficulty_level, 'weak')
        self.assertGreater(self.card.failure_count, 0)

    def test_dashboard_counts_due_and_difficult_cards(self):
        self.card.difficulty_level = 'weak'
        self.card.confidence_level = 10
        self.card.next_review_at = timezone.now() - datetime.timedelta(days=1)
        self.card.save()

        stats = vocabulary_stats(self.student)
        self.assertEqual(stats['overdue'], 1)
        self.assertEqual(stats['difficult'], 1)


class LessonWordSyncTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(email='word-teacher@test.com', password='123', role='teacher', name='Teacher')
        self.student = User.objects.create_user(email='word-student@test.com', password='123', role='student', name='Student', level='B1')
        self.lesson = Lesson.objects.create(
            title='Lesson with vocabulary',
            level='B1',
            student=self.student,
            teacher=self.teacher,
            status='completed',
            date=timezone.now(),
        )

    def test_creating_new_word_also_creates_student_vocabulary_card(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.post('/api/new-words/', {
            'word': 'turn down',
            'meaning': 'recusar; abaixar o volume',
            'level': 'B1',
            'lesson_id': str(self.lesson.id),
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        new_word = NewWord.objects.get(id=response.data['id'])
        card = VocabularyCard.objects.get(source_new_word=new_word, source_type='lesson')
        self.assertEqual(card.student, self.student)
        self.assertEqual(card.lesson, self.lesson)
        self.assertEqual(card.word, 'turn down')
        self.assertEqual(card.translation, 'recusar; abaixar o volume')

    def test_updating_new_word_keeps_student_card_in_sync(self):
        new_word = NewWord.objects.create(
            word='look up',
            meaning='procurar',
            level='B1',
            lesson=self.lesson,
        )
        card = VocabularyCard.objects.create(
            student=self.student,
            teacher=self.teacher,
            lesson=self.lesson,
            source_new_word=new_word,
            source_type='lesson',
            word='look up',
            translation='procurar',
            next_review_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(f'/api/new-words/{new_word.id}/', {
            'word': 'look up',
            'meaning': 'consultar; procurar informacao',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        card.refresh_from_db()
        self.assertEqual(card.translation, 'consultar; procurar informacao')

    def test_deleting_new_word_removes_auto_created_student_card(self):
        new_word = NewWord.objects.create(
            word='set up',
            meaning='configurar',
            level='B1',
            lesson=self.lesson,
        )
        VocabularyCard.objects.create(
            student=self.student,
            teacher=self.teacher,
            lesson=self.lesson,
            source_new_word=new_word,
            source_type='lesson',
            word='set up',
            translation='configurar',
            next_review_at=timezone.now(),
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.delete(f'/api/new-words/{new_word.id}/')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(VocabularyCard.objects.filter(source_new_word=new_word, source_type='lesson').exists())
