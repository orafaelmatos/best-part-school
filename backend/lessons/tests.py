from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.utils import timezone
import datetime
from accounts.models import User
from .models import Lesson, TeacherAvailability

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

        response = self.client.patch(f'/api/lessons/{lesson_to_move.id}/reschedule/', {
            'date': self.lesson_date.isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('horário', response.data['error'])
