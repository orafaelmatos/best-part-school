import datetime
import base64
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.test.utils import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from lessons.models import Lesson, TeacherAvailability
from lessons.scheduling import create_student_schedule_and_lessons


def sample_photo(name='avatar.png'):
    return SimpleUploadedFile(
        name,
        base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W3KQAAAAASUVORK5CYII='),
        content_type='image/png',
    )

class StudentRegistrationScheduleTests(TestCase):
    def setUp(self):
        self.temp_media_dir = tempfile.mkdtemp()
        self.media_override = override_settings(MEDIA_ROOT=self.temp_media_dir)
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)
        self.addCleanup(lambda: shutil.rmtree(self.temp_media_dir, ignore_errors=True))
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

    def test_student_creation_with_photo(self):
        response = self.client.post('/api/accounts/register/', {
            'email': 'student_photo@test.com',
            'name': 'Photo Student',
            'password': '123',
            'role': 'student',
            'level': 'A1/A2',
            'photo': sample_photo('student-photo.png'),
        }, format='multipart')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        student = User.objects.get(email='student_photo@test.com')
        self.assertTrue(bool(student.photo))

    def test_student_creation_with_custom_lesson_plan_creates_extra_lessons(self):
        response = self.client.post('/api/accounts/register/', {
            'email': 'student_plan@test.com',
            'name': 'Plan Student',
            'password': '123',
            'role': 'student',
            'level': 'A1/A2',
            'planned_lessons_count': 5,
            'completed_lessons_count': 2,
            'learning_goal': 'Conversar em viagens.',
            'taught_content': 'Verb to be.',
            'content_to_teach': 'Past simple.',
            'strengths': 'Boa pronuncia.',
            'weaknesses': 'Precisa praticar listening.',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        student = User.objects.get(email='student_plan@test.com')
        lessons = list(Lesson.objects.filter(student=student).order_by('order'))

        self.assertEqual(student.planned_lessons_count, 5)
        self.assertEqual(student.completed_lessons_count, 2)
        self.assertEqual(student.learning_goal, 'Conversar em viagens.')
        self.assertEqual(len(lessons), 5)
        self.assertEqual([lesson.status for lesson in lessons[:2]], ['completed', 'completed'])
        self.assertTrue(all(lesson.date is None for lesson in lessons[:2]))
        self.assertEqual([lesson.status for lesson in lessons[2:]], ['pending', 'pending', 'pending'])
        self.assertEqual(lessons[-1].title, 'Aula personalizada 5')

        self.client.force_authenticate(self.teacher)
        detail_response = self.client.get(f'/api/accounts/users/{student.id}/')
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data['effective_planned_lessons_count'], 5)
        self.assertEqual(detail_response.data['effective_completed_lessons_count'], 2)
        self.assertEqual(detail_response.data['pending_lessons_count'], 3)

    def test_student_creation_with_schedule_starts_after_previously_completed_lessons(self):
        response = self.client.post('/api/accounts/register/', {
            'email': 'student_midtrack@test.com',
            'name': 'Mid Track',
            'password': '123',
            'role': 'student',
            'level': 'B1',
            'planned_lessons_count': 4,
            'completed_lessons_count': 1,
            'schedule_day': 4,
            'schedule_time': '20:00:00',
            'teacher_id': str(self.teacher.id),
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        student = User.objects.get(email='student_midtrack@test.com')
        lessons = list(Lesson.objects.filter(student=student).order_by('order'))

        self.assertEqual(len(lessons), 4)
        self.assertEqual(lessons[0].status, 'completed')
        self.assertIsNone(lessons[0].date)
        self.assertEqual(lessons[2].title, 'Aula personalizada 3')
        self.assertEqual(lessons[3].title, 'Aula personalizada 4')

        scheduled_lessons = lessons[1:]
        first_scheduled_date = scheduled_lessons[0].date
        expected_first_date = next(
            lesson.date for lesson in scheduled_lessons if lesson.date is not None
        )
        self.assertEqual(first_scheduled_date, expected_first_date)
        for index, lesson in enumerate(scheduled_lessons):
            local_lesson_date = timezone.localtime(lesson.date)
            self.assertEqual(lesson.status, 'scheduled')
            self.assertEqual(local_lesson_date.weekday(), 3)
            self.assertEqual(local_lesson_date.hour, 20)
            self.assertEqual(local_lesson_date.minute, 0)
            if index > 0:
                self.assertEqual((lesson.date - scheduled_lessons[index - 1].date).days, 7)


class UserPhotoUpdateTests(TestCase):
    def setUp(self):
        self.temp_media_dir = tempfile.mkdtemp()
        self.media_override = override_settings(MEDIA_ROOT=self.temp_media_dir)
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)
        self.addCleanup(lambda: shutil.rmtree(self.temp_media_dir, ignore_errors=True))
        self.client = APIClient()
        self.teacher = User.objects.create_user(email='teacher-update@test.com', password='123', role='teacher', name='Teacher')
        self.student = User.objects.create_user(email='student-update@test.com', password='123', role='student', name='Student')
        self.client.force_authenticate(self.teacher)

    def test_user_photo_can_be_updated_and_removed(self):
        update_response = self.client.patch(
            f'/api/accounts/users/{self.student.id}/',
            {'photo': sample_photo()},
            format='multipart',
        )

        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertTrue(bool(self.student.photo))

        remove_response = self.client.patch(
            f'/api/accounts/users/{self.student.id}/',
            {'remove_photo': 'true'},
            format='multipart',
        )

        self.assertEqual(remove_response.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertFalse(bool(self.student.photo))

    def test_user_update_can_sync_student_tracking_finance_and_lesson_plan(self):
        self.student.level = 'B1'
        self.student.save(update_fields=['level'])
        TeacherAvailability.objects.create(
            teacher=self.teacher,
            day_of_week=1,
            start_time=datetime.time(8, 0),
            end_time=datetime.time(20, 0),
        )
        Lesson.objects.create(title='B1 Lesson A', level='B1', is_template=True, status='pending', order=1)
        Lesson.objects.create(title='B1 Lesson B', level='B1', is_template=True, status='pending', order=2)
        create_student_schedule_and_lessons(
            self.student,
            teacher=self.teacher,
            schedule_entries=[{'day_of_week': 1, 'time': '12:00'}],
        )

        response = self.client.patch(
            f'/api/accounts/users/{self.student.id}/',
            {
                'planned_lessons_count': 4,
                'completed_lessons_count': 1,
                'learning_goal': 'Ingles para reunioes.',
                'monthly_fee': '350.00',
                'due_day': 12,
                'finance_notes': 'Plano trimestral.',
                'teacher_id': str(self.teacher.id),
                'schedules': [{'day_of_week': 1, 'time': '12:00'}],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        lessons = list(Lesson.objects.filter(student=self.student, is_template=False).order_by('order'))

        self.assertEqual(self.student.planned_lessons_count, 4)
        self.assertEqual(self.student.completed_lessons_count, 1)
        self.assertEqual(self.student.learning_goal, 'Ingles para reunioes.')
        self.assertEqual(len(lessons), 4)
        self.assertEqual(lessons[0].status, 'completed')
        self.assertIsNone(lessons[0].date)
        self.assertEqual(lessons[-1].title, 'Aula personalizada 4')
        self.assertTrue(all(lesson.status == 'scheduled' for lesson in lessons[1:]))
        self.assertEqual(self.student.finance_profile.monthly_fee, 350)
        self.assertEqual(self.student.finance_profile.due_day, 12)
        self.assertEqual(response.data['pending_lessons_count'], 3)
