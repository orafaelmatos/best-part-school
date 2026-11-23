from io import StringIO
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings


class LocalMobileStudentTests(TestCase):
    def setUp(self):
        if settings.SETTINGS_MODULE != 'bps_core.settings_mobile':
            self.skipTest('Execute com --settings=bps_core.settings_mobile para usar SQLite isolado.')

    @patch('accounts.management.commands.create_mobile_student.getpass.getpass')
    def test_creates_student_with_hashed_password_that_can_login(self, prompt):
        password = 'A test passphrase with 324!'
        prompt.side_effect = [password, password]
        output = StringIO()
        call_command('create_mobile_student', email='local-student@example.test', stdout=output)
        user = get_user_model().objects.get(email='local-student@example.test')
        self.assertEqual(user.role, 'student')
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertNotEqual(user.password, password)
        self.assertNotIn(password, output.getvalue())
        response = self.client.post('/api/accounts/login/', {'email': user.email, 'password': password})
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.json())

    @patch('accounts.management.commands.create_mobile_student.getpass.getpass')
    def test_existing_user_is_not_modified(self, prompt):
        user = get_user_model().objects.create_user(email='existing@example.test', role='teacher')
        with self.assertRaises(CommandError):
            call_command('create_mobile_student', email=user.email)
        prompt.assert_not_called()
        user.refresh_from_db()
        self.assertEqual(user.role, 'teacher')

    @override_settings(LOCAL_MOBILE_MODE=False)
    @patch('accounts.management.commands.create_mobile_student.get_user_model')
    def test_refuses_other_profiles_before_database_access(self, user_model):
        with self.assertRaises(CommandError):
            call_command('create_mobile_student', email='local@example.test')
        user_model.assert_not_called()

    @patch('accounts.management.commands.create_mobile_student.getpass.getpass', side_effect=['one', 'two'])
    def test_mismatched_passwords_do_not_create_user(self, prompt):
        with self.assertRaises(CommandError):
            call_command('create_mobile_student', email='mismatch@example.test')
        self.assertFalse(get_user_model().objects.exists())

    def test_health_identifies_local_profile(self):
        response = self.client.get('/api/local/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'mode': 'mobile-local', 'database': 'sqlite-local'})
