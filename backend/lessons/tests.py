from django.test import TestCase
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APIClient
from django.utils import timezone
import datetime
from unittest.mock import patch
import json
from accounts.models import User
from .models import Homework, HomeworkAnswer, HomeworkQuestion, Lesson, NewWord, StudentRecurringSchedule, TeacherAvailability, VocabularyCard
from .scheduling import create_student_schedule_and_lessons, next_occurrence
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

    def test_teacher_can_save_notes_without_changing_lesson_student(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(f'/api/lessons/{self.student1_lesson.id}/', {
            'student': str(self.student1.id),
            'notes': '<p>Plano salvo para esta aula.</p>',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.student1_lesson.refresh_from_db()
        self.assertEqual(self.student1_lesson.student, self.student1)
        self.assertEqual(self.student1_lesson.notes, '<p>Plano salvo para esta aula.</p>')

    def test_teacher_cannot_move_existing_lesson_to_another_student(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(f'/api/lessons/{self.student1_lesson.id}/', {
            'student': str(self.student2.id),
            'notes': '<p>Plano no aluno errado.</p>',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.student1_lesson.refresh_from_db()
        self.assertEqual(self.student1_lesson.student, self.student1)
        self.assertNotEqual(self.student1_lesson.notes, '<p>Plano no aluno errado.</p>')


class LessonSchedulingValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(email='schedule-teacher@test.com', password='123', role='teacher', name='Teacher')
        self.student1 = User.objects.create_user(email='schedule-student1@test.com', password='123', role='student', name='Student 1', level='B1')
        self.student2 = User.objects.create_user(email='schedule-student2@test.com', password='123', role='student', name='Student 2', level='B1')
        self.template = Lesson.objects.create(title='B1 Template', level='B1', is_template=True, status='pending')
        future_date = timezone.localdate() + datetime.timedelta(days=3)
        self.lesson_date = timezone.make_aware(datetime.datetime.combine(future_date, datetime.time(12, 0)))
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
        past_date = timezone.make_aware(
            datetime.datetime.combine(
                timezone.localdate() - datetime.timedelta(days=1),
                datetime.time(12, 0),
            )
        )
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

    def test_teacher_availability_api_returns_half_hour_slots_and_blocks_overlaps(self):
        TeacherAvailability.objects.filter(teacher=self.teacher).delete()
        TeacherAvailability.objects.create(
            teacher=self.teacher,
            day_of_week=self.lesson_date.weekday(),
            start_time=datetime.time(8, 0),
            end_time=datetime.time(21, 30),
        )
        Lesson.objects.create(
            title='Half hour lesson',
            level='B1',
            student=self.student1,
            teacher=self.teacher,
            template=self.template,
            date=self.lesson_date.replace(hour=12, minute=30),
            status='scheduled',
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.get(
            f'/api/teacher-availability/{self.teacher.id}/',
            {'date': self.lesson_date.date().isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        slots_by_time = {slot['time']: slot for slot in response.data['time_slots']}

        self.assertTrue(slots_by_time['11:30']['available'])
        self.assertFalse(slots_by_time['12:00']['available'])
        self.assertEqual(slots_by_time['12:00']['reason'], 'busy')
        self.assertFalse(slots_by_time['12:30']['available'])
        self.assertEqual(slots_by_time['12:30']['reason'], 'busy')
        self.assertFalse(slots_by_time['13:00']['available'])
        self.assertEqual(slots_by_time['13:00']['reason'], 'busy')
        self.assertTrue(slots_by_time['13:30']['available'])
        self.assertTrue(slots_by_time['20:30']['available'])
        self.assertNotIn('21:00', slots_by_time)

    def test_recurring_schedule_rejects_half_hour_overlap_for_same_teacher(self):
        StudentRecurringSchedule.objects.create(
            student=self.student1,
            teacher=self.teacher,
            day_of_week=self.lesson_date.weekday(),
            start_time=datetime.time(12, 30),
            active=True,
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.post('/api/student-schedules/', {
            'student': str(self.student2.id),
            'teacher': str(self.teacher.id),
            'day_of_week': self.lesson_date.weekday(),
            'start_time': '13:00:00',
            'active': True,
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('se sobrepõe', response.data['start_time'][0])

    def test_recurring_schedule_accepts_next_half_hour_slot_after_lesson_window(self):
        StudentRecurringSchedule.objects.create(
            student=self.student1,
            teacher=self.teacher,
            day_of_week=self.lesson_date.weekday(),
            start_time=datetime.time(12, 30),
            active=True,
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.post('/api/student-schedules/', {
            'student': str(self.student2.id),
            'teacher': str(self.teacher.id),
            'day_of_week': self.lesson_date.weekday(),
            'start_time': '13:30:00',
            'active': True,
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['start_time'], '13:30:00')


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

    def test_start_lesson_renames_existing_custom_placeholder(self):
        placeholder = Lesson.objects.create(
            title='Aula personalizada 4',
            level='B1',
            student=self.student,
            teacher=self.teacher,
            date=self.lesson_c.date + datetime.timedelta(days=7),
            status='scheduled',
            order=4,
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(f'/api/lessons/{placeholder.id}/start_lesson/', {
            'custom_lesson_title': 'Conversation practice',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data['id']), str(placeholder.id))

        placeholder.refresh_from_db()
        self.assertEqual(placeholder.title, 'Conversation practice')
        self.assertEqual(placeholder.status, 'in_progress')
        self.assertEqual(Lesson.objects.filter(student=self.student, is_template=False).count(), 4)

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


class StudentRecurringScheduleChangeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(
            email='schedule-change-teacher@test.com',
            password='123',
            role='teacher',
            name='Teacher',
        )
        self.other_student = User.objects.create_user(
            email='other-student@test.com',
            password='123',
            role='student',
            name='Other Student',
            level='B1',
        )
        self.student = User.objects.create_user(
            email='schedule-change-student@test.com',
            password='123',
            role='student',
            name='Student',
            level='B1',
        )
        for title in ['Lesson A', 'Lesson B', 'Lesson C']:
            Lesson.objects.create(title=title, level='B1', is_template=True, status='pending')

        TeacherAvailability.objects.create(
            teacher=self.teacher,
            day_of_week=1,
            start_time=datetime.time(8, 0),
            end_time=datetime.time(20, 0),
        )
        TeacherAvailability.objects.create(
            teacher=self.teacher,
            day_of_week=4,
            start_time=datetime.time(18, 30),
            end_time=datetime.time(21, 0),
        )

        create_student_schedule_and_lessons(
            self.student,
            teacher=self.teacher,
            schedule_entries=[{'day_of_week': 1, 'time': '12:00'}],
        )
        self.schedule = StudentRecurringSchedule.objects.get(student=self.student, teacher=self.teacher)

    def test_teacher_can_change_student_recurring_schedule_and_shift_future_lessons(self):
        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(
            f'/api/student-schedules/{self.schedule.id}/change_slot/',
            {
                'day_of_week': 4,
                'start_time': '18:30:00',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['updated_lessons'], 3)

        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.day_of_week, 4)
        self.assertEqual(self.schedule.start_time, datetime.time(18, 30))

        lessons = list(
            Lesson.objects.filter(student=self.student, teacher=self.teacher, is_template=False).order_by('order')
        )
        expected_first_date = next_occurrence(4, datetime.time(18, 30))
        if expected_first_date <= timezone.now():
            expected_first_date += datetime.timedelta(days=7)

        for index, lesson in enumerate(lessons):
            localized_lesson_date = timezone.localtime(lesson.date)
            expected_lesson_date = timezone.localtime(expected_first_date + datetime.timedelta(weeks=index))
            self.assertEqual(localized_lesson_date.weekday(), 4)
            self.assertEqual(localized_lesson_date.time(), datetime.time(18, 30))
            self.assertEqual(localized_lesson_date, expected_lesson_date)

    def test_change_slot_rejects_conflicting_recurring_slot(self):
        StudentRecurringSchedule.objects.create(
            student=self.other_student,
            teacher=self.teacher,
            day_of_week=4,
            start_time=datetime.time(18, 30),
            active=True,
        )

        self.client.force_authenticate(user=self.teacher)
        response = self.client.patch(
            f'/api/student-schedules/{self.schedule.id}/change_slot/',
            {
                'day_of_week': 4,
                'start_time': '18:30:00',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('se sobrepõe', response.data['start_time'][0])
        self.schedule.refresh_from_db()
        self.assertEqual(self.schedule.day_of_week, 1)
        self.assertEqual(self.schedule.start_time, datetime.time(12, 0))


class HomeworkSubmissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(email='homework-teacher@test.com', password='123', role='teacher', name='Teacher')
        self.student = User.objects.create_user(email='homework-student@test.com', password='123', role='student', name='Student')
        self.lesson = Lesson.objects.create(
            title='Homework lesson',
            level='B1',
            student=self.student,
            teacher=self.teacher,
            status='completed',
            date=timezone.now(),
        )
        self.homework = Homework.objects.create(
            title='Writing task',
            status='pending',
            auto_correction_enabled=False,
            teacher=self.teacher,
            student=self.student,
            lesson=self.lesson,
        )
        self.question = HomeworkQuestion.objects.create(
            homework=self.homework,
            type='open_text',
            prompt='Write a paragraph about your weekend.',
            order=0,
        )

    def test_student_can_resubmit_homework_and_teacher_sees_latest_answer(self):
        self.client.force_authenticate(user=self.student)

        first_response = self.client.post(
            f'/api/homework/{self.homework.id}/submit_answers/',
            {
                'answers': [
                    {
                        'question': str(self.question.id),
                        'answer_text': 'First version.',
                        'selected_option_index': None,
                    }
                ]
            },
            format='json',
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.homework.refresh_from_db()
        self.assertEqual(self.homework.status, 'sent')
        first_answer = HomeworkAnswer.objects.get(homework=self.homework, question=self.question, student=self.student)
        self.assertEqual(first_answer.answer_text, 'First version.')

        second_response = self.client.post(
            f'/api/homework/{self.homework.id}/submit_answers/',
            {
                'answers': [
                    {
                        'question': str(self.question.id),
                        'answer_text': 'Updated version for the teacher.',
                        'selected_option_index': None,
                    }
                ]
            },
            format='json',
        )

        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.homework.refresh_from_db()
        self.assertEqual(self.homework.status, 'sent')

        answers = HomeworkAnswer.objects.filter(homework=self.homework, question=self.question, student=self.student)
        self.assertEqual(answers.count(), 1)
        self.assertEqual(answers.first().answer_text, 'Updated version for the teacher.')

    def test_auto_correction_generates_second_chance_and_final_report(self):
        auto_homework = Homework.objects.create(
            title='Grammar drill',
            status='pending',
            auto_correction_enabled=True,
            teacher=self.teacher,
            student=self.student,
            lesson=self.lesson,
        )
        auto_question = HomeworkQuestion.objects.create(
            homework=auto_homework,
            type='multiple_choice',
            prompt='Choose the correct sentence.',
            options=['He go to school every day.', 'He goes to school every day.'],
            correct_option_index=1,
            explanation='Use third person singular in the simple present.',
            second_chance_mode='reserve',
            reserve_type='multiple_choice',
            reserve_prompt='Choose the correct sentence about Anna.',
            reserve_options=['Anna work at home.', 'Anna works at home.'],
            reserve_correct_option_index=1,
            reserve_explanation='Remember to add -s for he, she and it.',
            order=0,
        )

        self.client.force_authenticate(user=self.student)

        list_response = self.client.get(f'/api/homework/{auto_homework.id}/')
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertNotIn('correct_option_index', list_response.data['questions'][0])

        first_response = self.client.post(
            f'/api/homework/{auto_homework.id}/answer_question/',
            {
                'question': str(auto_question.id),
                'selected_option_index': 0,
            },
            format='json',
        )
        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        auto_homework.refresh_from_db()
        self.assertEqual(auto_homework.status, 'in_progress')
        first_answer = HomeworkAnswer.objects.get(homework=auto_homework, question=auto_question, student=self.student)
        self.assertFalse(first_answer.is_correct)
        self.assertIsNotNone(first_response.data['answer']['second_chance_question'])

        second_response = self.client.post(
            f'/api/homework/{auto_homework.id}/answer_second_chance/',
            {
                'question': str(auto_question.id),
                'selected_option_index': 1,
            },
            format='json',
        )
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        auto_homework.refresh_from_db()
        self.assertEqual(auto_homework.status, 'corrected')
        first_answer.refresh_from_db()
        self.assertTrue(first_answer.second_chance_is_correct)
        self.assertEqual(auto_homework.student_report.get('accuracy'), 100)
        self.assertEqual(auto_homework.student_report.get('second_chance_correct'), 1)

    def test_student_can_request_second_chance_after_incorrect_answer(self):
        auto_homework = Homework.objects.create(
            title='Transport review',
            status='pending',
            auto_correction_enabled=True,
            teacher=self.teacher,
            student=self.student,
            lesson=self.lesson,
        )
        auto_question = HomeworkQuestion.objects.create(
            homework=auto_homework,
            type='open_text',
            prompt='How do you go to work?',
            reference_answer='I go to work by car.',
            explanation='Use a complete answer with transport.',
            second_chance_mode='reserve',
            reserve_type='open_text',
            reserve_prompt='Now answer: How do you go to school?',
            reserve_reference_answer='I go to school by bus.',
            reserve_explanation='Use the same structure with another transport.',
            order=0,
        )

        self.client.force_authenticate(user=self.student)
        first_response = self.client.post(
            f'/api/homework/{auto_homework.id}/answer_question/',
            {
                'question': str(auto_question.id),
                'answer_text': 'cars para la',
            },
            format='json',
        )
        self.assertEqual(first_response.status_code, status.HTTP_200_OK)

        request_response = self.client.post(
            f'/api/homework/{auto_homework.id}/request_second_chance/',
            {
                'question': str(auto_question.id),
            },
            format='json',
        )
        self.assertEqual(request_response.status_code, status.HTTP_200_OK)
        self.assertEqual(request_response.data['homework']['status'], 'in_progress')
        self.assertEqual(
            request_response.data['answer']['second_chance_question']['prompt'],
            'Now answer: How do you go to school?',
        )


class HomeworkQuestionMediaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(email='media-homework-teacher@test.com', password='123', role='teacher', name='Teacher')
        self.student = User.objects.create_user(email='media-homework-student@test.com', password='123', role='student', name='Student')
        self.lesson = Lesson.objects.create(
            title='Listening lesson',
            level='B1',
            student=self.student,
            teacher=self.teacher,
            status='completed',
            date=timezone.now(),
        )

    @patch('ai_study.services.AIStudyOpenAIService.transcribe', return_value='Hello from the uploaded audio.')
    def test_teacher_can_create_homework_question_with_image_and_audio(self, transcribe_mock):
        self.client.force_authenticate(user=self.teacher)

        image = SimpleUploadedFile(
            'prompt.png',
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR',
            content_type='image/png',
        )
        audio = SimpleUploadedFile(
            'prompt.webm',
            b'audio bytes',
            content_type='audio/webm',
        )
        questions_payload = json.dumps([
            {
                'type': 'open_text',
                'prompt': 'Listen and describe the picture.',
                'options': [],
                'correct_option_index': None,
                'order': 0,
            }
        ])

        response = self.client.post('/api/homework/', {
            'title': 'Listening prompt',
            'description': 'Use the attached media.',
            'classification': 'listening',
            'status': 'pending',
            'teacher': str(self.teacher.id),
            'student': str(self.student.id),
            'lesson': str(self.lesson.id),
            'questions_payload': questions_payload,
            'question_image_0': image,
            'question_audio_0': audio,
        }, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        homework = Homework.objects.get(id=response.data['id'])
        question = homework.questions.get()

        self.assertTrue(bool(question.image))
        self.assertTrue(bool(question.audio))
        self.assertEqual(question.audio_transcript, 'Hello from the uploaded audio.')
        self.assertTrue(response.data['questions'][0]['image_url'])
        self.assertTrue(response.data['questions'][0]['audio_url'])
        self.assertEqual(response.data['questions'][0]['audio_transcript'], 'Hello from the uploaded audio.')
        transcribe_mock.assert_called_once()


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
