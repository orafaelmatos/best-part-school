import tempfile
from pathlib import Path
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User, StudentGroup
from accounts.privacy import AI_CONSENT_VERSION
from ai_study.models import AIStudySession, AIConversationMessage, AIContentReport
from lessons.models import Lesson, Attachment, LessonSummary, Homework, HomeworkQuestion, HomeworkTemplate, VocabularyCategory, VocabularyCard, NewWord
from marketplace.models import Course
from payments.models import StudentFinanceProfile, Payment


class ReleaseFixture:
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(email='teacher@school.test', name='Teacher', role='teacher', password='School-access-49!')
        self.other_teacher = User.objects.create_user(email='other-teacher@school.test', name='Other', role='teacher')
        self.student = User.objects.create_user(email='alice@school.test', name='Alice', role='student', password='School-access-49!')
        self.other = User.objects.create_user(email='bob@school.test', name='Bob', role='student')
        self.admin = User.objects.create_superuser(email='admin@school.test', password='School-access-49!', name='Admin')
        self.profile = StudentFinanceProfile.objects.create(student=self.student, teacher=self.teacher, monthly_fee=100, due_day=10)
        StudentFinanceProfile.objects.create(student=self.other, teacher=self.other_teacher, monthly_fee=100, due_day=10)
        self.lesson = Lesson.objects.create(title='Private lesson', level='B1', student=self.student, teacher=self.teacher)

    def login_as(self, user):
        self.client.force_authenticate(user)


class ReleaseAuthorizationTests(ReleaseFixture, TestCase):
    def test_students_cannot_delete_school_summaries_or_change_shared_categories(self):
        summary = LessonSummary.objects.create(lesson=self.lesson, student=self.student, teacher=self.teacher, summary='School summary')
        shared = VocabularyCategory.objects.create(name='Shared category', slug='shared-release', is_default=True)
        self.login_as(self.student)
        self.assertEqual(self.client.delete(f'/api/lesson-summaries/{summary.pk}/').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/vocabulary-categories/{shared.pk}/', {'name': 'Changed'}).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/vocabulary-categories/{shared.pk}/').status_code, 404)
        response = self.client.post('/api/vocabulary-categories/', {'name': 'My category', 'slug': 'personal-release'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.client.patch(f'/api/vocabulary-categories/{response.data["id"]}/', {'name': 'Personal updated'}).status_code, 200)
        self.assertEqual(self.client.post('/api/blocked-dates/', {'date': '2026-12-01'}).status_code, 403)

    def test_student_imports_group_words_only_into_their_own_vocabulary(self):
        group = StudentGroup.objects.create(name='Group', teacher=self.teacher)
        group.students.set([self.student, self.other])
        lesson = Lesson.objects.create(title='Group lesson', group=group, teacher=self.teacher, level='B1')
        NewWord.objects.create(lesson=lesson, word='privacy', meaning='privacidade')
        self.login_as(self.student)
        response = self.client.post('/api/vocabulary-cards/import_lesson_words/', {'lesson': str(lesson.pk)})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(VocabularyCard.objects.filter(student=self.student, lesson=lesson).exists())
        self.assertFalse(VocabularyCard.objects.filter(student=self.other, lesson=lesson).exists())

    def test_homework_template_refreshes_private_media_without_saving_temporary_links(self):
        from urllib.parse import urlsplit
        with tempfile.TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            homework = Homework.objects.create(title='Draft', teacher=self.teacher, student=self.student, lesson=self.lesson, status='draft')
            question = HomeworkQuestion.objects.create(homework=homework, type='open_text', prompt='Describe the photo')
            question.image.save('photo.png', ContentFile(b'question image'))
            original = f'/media/{question.image.name}?access=expired'
            template = HomeworkTemplate.objects.create(title='Template', teacher=self.teacher, source_homework=homework, questions=[{'image_path': question.image.name, 'image_url': original}])
            self.login_as(self.teacher)
            response = self.client.get(f'/api/homework-templates/{template.pk}/')
            self.assertEqual(response.status_code, 200, response.data)
            refreshed = response.data['questions'][0]['image_url']
            self.assertNotIn('expired', refreshed)
            parsed = urlsplit(refreshed)
            file_response = self.client.get(f'{parsed.path}?{parsed.query}')
            self.assertEqual(file_response.status_code, 200)
            self.assertEqual(b''.join(file_response.streaming_content), b'question image')
            template.refresh_from_db()
            self.assertEqual(template.questions[0]['image_url'], original)
            self.login_as(self.other_teacher)
            self.assertEqual(self.client.get(f'/api/homework-templates/{template.pk}/').status_code, 404)

    def test_embedded_lesson_and_summary_images_renew_only_owned_attachment_links(self):
        import re
        from html import unescape
        from urllib.parse import urlsplit
        with tempfile.TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            attachment = Attachment.objects.create(lesson=self.lesson)
            attachment.file.save('photo.png', ContentFile(b'lesson image'))
            source = f'http://testserver/media/{attachment.file.name}?access=expired'
            foreign = '/media/lesson_attachments/another-student.png'
            markup = f'<p>Material</p><img src="{source}"><img src="{foreign}">'
            self.lesson.notes = markup
            self.lesson.save()
            summary = LessonSummary.objects.create(lesson=self.lesson, student=self.student, teacher=self.teacher, summary=markup)
            self.login_as(self.student)
            for path, field in [(f'/api/lessons/{self.lesson.pk}/', 'notes'), (f'/api/lesson-summaries/{summary.pk}/', 'summary')]:
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200, response.data)
                sources = re.findall(r'src="([^"]+)"', response.data[field])
                refreshed = unescape(sources[0])
                self.assertIn('access=', refreshed)
                self.assertNotIn('expired', refreshed)
                self.assertEqual(sources[1], foreign)
                parsed = urlsplit(refreshed)
                file_response = self.client.get(f'{parsed.path}?{parsed.query}')
                self.assertEqual(file_response.status_code, 200)
                self.assertEqual(b''.join(file_response.streaming_content), b'lesson image')

    def test_anonymous_cannot_read_school_data_or_write_courses(self):
        for path in ['/api/accounts/users/', '/api/lessons/', '/api/calendar/', '/api/lessons-attachments/', '/api/new-words/', '/api/finance/me/']:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.client.post('/api/accounts/register/', {'role': 'admin'}).status_code, 401)
        self.assertEqual(self.client.post('/api/courses/', {'title': 'Unauthorized', 'description': 'No'}).status_code, 401)
        self.assertEqual(self.client.get('/api/courses/').status_code, 200)

    def test_student_scope_blocks_other_accounts_and_privilege_fields(self):
        self.login_as(self.student)
        listing = self.client.get('/api/accounts/users/').data
        self.assertEqual([row['id'] for row in listing['results']], [str(self.student.pk)])
        for method in ['get', 'patch', 'delete']:
            self.assertEqual(getattr(self.client, method)(f'/api/accounts/users/{self.other.pk}/').status_code, 404)
        response = self.client.patch(f'/api/accounts/users/{self.student.pk}/', {'role': 'admin', 'monthly_fee': '0'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.student.refresh_from_db()
        self.assertEqual(self.student.role, 'student')

    def test_teacher_can_manage_only_linked_students(self):
        self.login_as(self.teacher)
        self.assertEqual(self.client.patch(f'/api/accounts/users/{self.student.pk}/', {'name': 'Alice updated'}).status_code, 200)
        self.assertEqual(self.client.patch(f'/api/accounts/users/{self.other.pk}/', {'name': 'Changed'}).status_code, 404)
        self.assertEqual(self.client.patch(f'/api/accounts/users/{self.student.pk}/', {'role': 'admin'}).status_code, 400)
        Lesson.objects.create(title='Shared student', level='B1', student=self.student, teacher=self.other_teacher)
        self.assertEqual(self.client.delete(f'/api/accounts/users/{self.student.pk}/').status_code, 403)

    def test_teacher_can_delete_an_exclusively_managed_student(self):
        self.login_as(self.teacher)
        user_id = self.student.pk
        self.assertEqual(self.client.delete(f'/api/accounts/users/{user_id}/').status_code, 204)
        self.assertFalse(User.objects.filter(pk=user_id).exists())

    def test_registration_cannot_create_staff_or_transfer_teacher_links(self):
        self.login_as(self.teacher)
        payload = {'email': 'new@school.test', 'name': 'New student', 'password': 'Student-onboarding-49!'}
        for role in ['teacher', 'admin']:
            self.assertEqual(self.client.post('/api/accounts/register/', {**payload, 'role': role}).status_code, 400)
        self.assertEqual(self.client.post('/api/accounts/register/', {**payload, 'teacher_id': str(self.other_teacher.pk)}).status_code, 400)
        response = self.client.post('/api/accounts/register/', payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(User.objects.get(pk=response.data['id']).finance_profile.teacher_id, self.teacher.pk)

    def test_courses_are_mutable_only_by_owner_or_admin(self):
        course = Course.objects.create(title='Course', description='School material', created_by=self.teacher)
        self.login_as(self.other_teacher)
        self.assertEqual(self.client.patch(f'/api/courses/{course.pk}/', {'price': '0'}).status_code, 404)
        self.login_as(self.student)
        self.assertEqual(self.client.post('/api/courses/', {'title': 'Course', 'description': 'No'}).status_code, 403)
        self.login_as(self.teacher)
        self.assertEqual(self.client.patch(f'/api/courses/{course.pk}/', {'price': '12'}).status_code, 200)
        self.login_as(self.admin)
        self.assertEqual(self.client.delete(f'/api/courses/{course.pk}/').status_code, 204)

    def test_student_cannot_mark_payments_paid_or_edit_financial_profiles(self):
        payment = Payment.objects.create(student=self.student, teacher=self.teacher, finance_profile=self.profile, amount=100, due_date=timezone.localdate())
        self.login_as(self.student)
        self.assertEqual(self.client.patch(f'/api/payments/{payment.pk}/mark_paid/').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/finance-profiles/{self.profile.pk}/', {'monthly_fee': '0'}).status_code, 403)
        self.assertEqual(self.client.get(f'/api/finance/student/{self.other.pk}/').status_code, 404)
        payment.refresh_from_db()
        self.assertNotEqual(payment.status, 'paid')

    def test_media_paths_cannot_be_injected_into_homeworks(self):
        self.login_as(self.teacher)
        response = self.client.post('/api/homework/', {
            'title': 'Draft', 'status': 'draft', 'student': str(self.student.pk),
            'questions': [{'type': 'open_text', 'prompt': 'Prompt', 'audio_path': 'finance/contracts/private.pdf'}],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_self_password_changes_require_current_password(self):
        self.login_as(self.student)
        path = f'/api/accounts/users/{self.student.pk}/'
        self.assertEqual(self.client.patch(path, {'password': 'Changed-access-49!'}).status_code, 400)
        response = self.client.patch(path, {'current_password': 'School-access-49!', 'password': 'Changed-access-49!'})
        self.assertEqual(response.status_code, 200, response.data)


class AIPrivacyTests(ReleaseFixture, TestCase):
    def test_teacher_cannot_send_student_content_without_student_consent(self):
        self.teacher.ai_consent_version = AI_CONSENT_VERSION
        self.teacher.ai_consent_at = timezone.now()
        self.teacher.save()
        self.login_as(self.teacher)
        path = f'/api/lessons/{self.lesson.pk}/generate-summary/'
        response = self.client.post(path)
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(response.data['code'], 'student_ai_consent_required')

    def test_consent_is_required_before_ai_and_can_be_revoked(self):
        self.login_as(self.student)
        with patch('ai_study.services.AIStudyOpenAIService.generate_tts') as generate:
            response = self.client.post('/api/ai-study/sessions/', {'mode': 'speaking'}, format='json')
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.data['code'], 'ai_consent_required')
            generate.assert_not_called()
        self.assertFalse(AIStudySession.objects.filter(student=self.student).exists())
        self.assertEqual(self.client.put('/api/accounts/ai-consent/', {'accepted': True, 'version': 'old'}, format='json').status_code, 400)
        self.assertEqual(self.client.put('/api/accounts/ai-consent/', {'accepted': True, 'version': AI_CONSENT_VERSION}, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/ai-study/sessions/', {'mode': 'speaking'}, format='json').status_code, 201)
        self.assertEqual(self.client.delete('/api/accounts/ai-consent/').status_code, 204)
        self.assertEqual(self.client.post('/api/ai-study/sessions/', {'mode': 'speaking'}, format='json').status_code, 403)
        self.assertEqual(self.client.get('/api/ai-study/sessions/').status_code, 200)
        self.assertEqual(list(self.student.ai_consent_records.values_list('accepted', flat=True)), [True, False])

    def test_reporting_checks_ownership_and_retains_moderation_context(self):
        session = AIStudySession.objects.create(student=self.student, mode='speaking')
        message = AIConversationMessage.objects.create(session=session, role='assistant', text='Generated response')
        self.login_as(self.other)
        self.assertEqual(self.client.post('/api/ai-study/content-reports/', {'message_id': str(message.pk), 'reason': 'unsafe'}).status_code, 400)
        self.login_as(self.student)
        response = self.client.post('/api/ai-study/content-reports/', {'message_id': str(message.pk), 'reason': 'unsafe', 'details': 'Please review'})
        self.assertEqual(response.status_code, 201, response.data)
        report = AIContentReport.objects.get()
        self.assertEqual(report.reported_text, message.text)
        self.assertEqual(report.reporter, self.student)
        self.assertEqual(report.status, 'open')

    def test_account_deletion_requires_password_and_removes_files_and_access(self):
        with tempfile.TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            self.student.photo.save('photo.png', ContentFile(b'private photo'))
            file_path = Path(self.student.photo.path)
            token = str(RefreshToken.for_user(self.student).access_token)
            self.login_as(self.student)
            self.assertEqual(self.client.post('/api/accounts/me/delete/', {'password': 'wrong', 'confirmation': 'EXCLUIR'}).status_code, 400)
            user_id = self.student.pk
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post('/api/accounts/me/delete/', {'password': 'School-access-49!', 'confirmation': 'EXCLUIR'})
            self.assertEqual(response.status_code, 204, response.data)
            self.assertFalse(User.objects.filter(pk=user_id).exists())
            self.assertFalse(file_path.exists())
            authenticated = APIClient()
            authenticated.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
            self.assertEqual(authenticated.get('/api/accounts/users/').status_code, 401)
