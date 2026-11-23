from io import StringIO
from unittest.mock import patch
import tempfile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from accounts.models import User
from lessons.models import Lesson
from payments.models import Payment


class StoreReviewStudentTests(TestCase):
    @patch('accounts.management.commands.create_store_review_student.getpass.getpass', side_effect=['Fictional-access-482!', 'Fictional-access-482!'])
    def test_review_account_uses_only_fictional_content_and_can_login(self, prompt):
        output = StringIO()
        with tempfile.TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            call_command('create_store_review_student', email='store-review@school.test', stdout=output)
        student = User.objects.get(email='store-review@school.test')
        self.assertFalse(student.is_staff)
        self.assertFalse(student.ai_consent_version)
        self.assertTrue(student.check_password('Fictional-access-482!'))
        self.assertEqual(Lesson.objects.filter(student=student).count(), 4)
        self.assertEqual(Payment.objects.filter(student=student).count(), 0)
        self.assertNotIn('Fictional-access-482!', output.getvalue())
        response = self.client.post('/api/accounts/login/', {'email': student.email, 'password': 'Fictional-access-482!'})
        self.assertEqual(response.status_code, 200)

    def test_existing_accounts_are_never_modified(self):
        user = User.objects.create_user(email='existing@school.test', name='Existing', role='teacher')
        with self.assertRaises(CommandError):
            call_command('create_store_review_student', email=user.email, stdout=StringIO())
        user.refresh_from_db()
        self.assertEqual(user.name, 'Existing')
        self.assertEqual(user.role, 'teacher')
