from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from accounts.models import User
from lessons.models import Lesson, TeacherAvailability
import datetime

class StudentRegistrationScheduleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(email='teacher@test.com', password='123', role='teacher', name='Teacher')
        TeacherAvailability.objects.create(
            teacher=self.teacher,
            day_of_week=3,
            start_time=datetime.time(8, 0),
            end_time=datetime.time(22, 0),
        )
        
        # Cria alguns templates pra serem gerados
        Lesson.objects.create(title='T1 A1/A2', level='A1/A2', is_template=True, status='pending', order=1)
        Lesson.objects.create(title='T2 A1/A2', level='A1/A2', is_template=True, status='pending', order=2)
        Lesson.objects.create(title='T3 B1', level='B1', is_template=True, status='pending', order=1)
        Lesson.objects.create(title='ALL LEVELS', level='ALL LEVELS', is_template=True, status='pending', order=1)
        
    def test_student_creation_without_schedule(self):
        """Novo aluno criado sem dados de agendamento deve gerar aulas 'pending' sem data"""
        response = self.client.post('/api/accounts/register/', {
            'email': 'student_nosched@test.com',
            'name': 'No Sched',
            'password': '123',
            'role': 'student',
            'level': 'A1/A2'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        student = User.objects.get(email='student_nosched@test.com')
        # Deve ter gerado as 2 do nivel + 1 de all levels = 3
        student_lessons = Lesson.objects.filter(student=student)
        self.assertEqual(student_lessons.count(), 3)
        self.assertTrue(all(l.status == 'pending' for l in student_lessons))
        self.assertTrue(all(l.date is None for l in student_lessons))

    def test_student_creation_with_schedule(self):
        """Novo aluno com agendamento deve gerar aulas escalonadas por semana com data e status 'scheduled'"""
        # Quinta-feira (js Day 4 = Thurdsay) -> schedule_day: 4, schedule_time: '20:00'
        response = self.client.post('/api/accounts/register/', {
            'email': 'student_sched@test.com',
            'name': 'Sched',
            'password': '123',
            'role': 'student',
            'level': 'B1',
            'schedule_day': 4, # Quinta
            'schedule_time': '20:00:00',
            'teacher_id': str(self.teacher.id)
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        student = User.objects.get(email='student_sched@test.com')
        # Template B1 (1) + ALL LEVELS (1) = 2
        student_lessons = Lesson.objects.filter(student=student).order_by('date')
        self.assertEqual(student_lessons.count(), 2)
        
        for lesson in student_lessons:
            local_lesson_date = timezone.localtime(lesson.date)
            self.assertEqual(lesson.status, 'scheduled')
            self.assertEqual(lesson.teacher, self.teacher)
            self.assertIsNotNone(lesson.date)
            # Verificar se foi numa quinta feira no formato Python (0=Mon, 3=Thu)
            self.assertEqual(local_lesson_date.weekday(), 3, "Dia deve ser Quinta-feira")
            self.assertEqual(local_lesson_date.hour, 20)
            self.assertEqual(local_lesson_date.minute, 0)
        
        # Verificar o gap de 1 semana
        first_date = student_lessons[0].date
        second_date = student_lessons[1].date
        self.assertEqual((second_date - first_date).days, 7, "Aulas de template precisam escalar semanalmente")
