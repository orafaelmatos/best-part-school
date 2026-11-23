from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import StudentGroup, User
from .models import Homework, HomeworkAnswer, HomeworkQuestion, HomeworkTemplate, Lesson


class HomeworkDeletionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.teacher = User.objects.create_user(email='delete-teacher@test.com', role='teacher')
        cls.other_teacher = User.objects.create_user(email='delete-other-teacher@test.com', role='teacher')
        cls.student = User.objects.create_user(email='delete-student@test.com', role='student')
        cls.admin = User.objects.create_user(email='delete-admin@test.com', role='admin')
        cls.lesson = Lesson.objects.create(
            title='Homework lesson', level='B1', teacher=cls.teacher, student=cls.student,
        )

    def setUp(self):
        self.client = APIClient()
        self.homework = Homework.objects.create(
            title='Writing task', status='pending', teacher=self.teacher,
            student=self.student, lesson=self.lesson,
        )
        self.url = f'/api/homework/{self.homework.id}/'

    def test_teacher_can_delete_homework_in_every_status(self):
        self.client.force_authenticate(user=self.teacher)
        for homework_status, _ in Homework.STATUS_CHOICES:
            with self.subTest(status=homework_status):
                homework = Homework.objects.create(
                    title='Task', status=homework_status, teacher=self.teacher,
                    student=self.student, lesson=self.lesson,
                )
                response = self.client.delete(f'/api/homework/{homework.id}/')
                self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
                self.assertFalse(Homework.objects.filter(pk=homework.pk).exists())

    def test_deletion_removes_questions_answers_and_student_access(self):
        question = HomeworkQuestion.objects.create(
            homework=self.homework, type='open_text', prompt='Write about your weekend.',
        )
        answer = HomeworkAnswer.objects.create(
            homework=self.homework, question=question, student=self.student, answer_text='My weekend',
        )
        self.client.force_authenticate(user=self.teacher)
        self.assertEqual(self.client.delete(self.url).status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(HomeworkQuestion.objects.filter(pk=question.pk).exists())
        self.assertFalse(HomeworkAnswer.objects.filter(pk=answer.pk).exists())
        self.assertTrue(Lesson.objects.filter(pk=self.lesson.pk).exists())

        self.client.force_authenticate(user=self.student)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.get('/api/homework/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 0)

    def test_student_cannot_delete_received_homework(self):
        self.client.force_authenticate(user=self.student)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Homework.objects.filter(pk=self.homework.pk).exists())

    def test_unrelated_teacher_cannot_delete_homework(self):
        self.client.force_authenticate(user=self.other_teacher)
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Homework.objects.filter(pk=self.homework.pk).exists())

    def test_lesson_teacher_can_delete_legacy_homework_without_teacher(self):
        self.homework.teacher = None
        self.homework.save(update_fields=['teacher'])
        self.client.force_authenticate(user=self.teacher)
        self.assertEqual(self.client.delete(self.url).status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Homework.objects.filter(pk=self.homework.pk).exists())

    def test_admin_can_delete_homework(self):
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.delete(self.url).status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Homework.objects.filter(pk=self.homework.pk).exists())

    def test_anonymous_user_cannot_delete_homework(self):
        self.assertEqual(self.client.delete(self.url).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(Homework.objects.filter(pk=self.homework.pk).exists())

    def test_deletion_preserves_other_group_students_and_saved_templates(self):
        other_student = User.objects.create_user(email='delete-other-student@test.com', role='student')
        group = StudentGroup.objects.create(name='Group', teacher=self.teacher)
        group.students.add(self.student, other_student)
        self.lesson.student = None
        self.lesson.group = group
        self.lesson.save(update_fields=['student', 'group'])
        self.homework.group = group
        self.homework.save(update_fields=['group'])
        other_homework = Homework.objects.create(
            title=self.homework.title, status='pending', teacher=self.teacher,
            student=other_student, lesson=self.lesson, group=group,
        )
        template = HomeworkTemplate.objects.create(
            title='Reusable task', teacher=self.teacher, source_homework=self.homework,
            questions=[{'type': 'open_text', 'prompt': 'Write about your weekend.'}],
        )

        self.client.force_authenticate(user=self.teacher)
        self.assertEqual(self.client.delete(self.url).status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Homework.objects.filter(pk=self.homework.pk).exists())
        self.assertTrue(Homework.objects.filter(pk=other_homework.pk).exists())
        template.refresh_from_db()
        self.assertIsNone(template.source_homework_id)
        self.assertEqual(template.questions[0]['prompt'], 'Write about your weekend.')
