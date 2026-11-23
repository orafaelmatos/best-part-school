import os
import tempfile
import wave
from pathlib import Path
from unittest import SkipTest
from unittest.mock import patch

from django.conf import settings
from django.core.management.base import CommandError
from django.db import connections
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.mobile_demo import (
    DEMO_MARKER, DEMO_PASSWORD, DEMO_STUDENTS, DEMO_TEACHER_EMAIL,
    load_demo_catalog, require_local_demo_database, seed_mobile_demo,
)
from accounts.models import User
from ai_study.models import AIStudySession
from lessons.models import Attachment, Homework, Lesson, LessonSummary, NewWord, StudentRecurringSchedule, VocabularyCard
from marketplace.models import Course
from payments.models import Payment, StudentFinanceProfile


@override_settings(SETTINGS_MODULE='bps_core.settings_mobile')
class MobileDemoGuardTests(SimpleTestCase):
    @override_settings(LOCAL_MOBILE_MODE=False)
    @patch('accounts.mobile_demo.transaction.atomic')
    def test_refuses_other_profiles_before_opening_a_transaction(self, atomic):
        with self.assertRaises(CommandError):
            seed_mobile_demo()
        atomic.assert_not_called()

    @override_settings(SETTINGS_MODULE='bps_core.settings_mobile', LOCAL_MOBILE_MODE=True, LOCAL_MOBILE_DEMO_TEST_DATABASE=False)
    def test_refuses_sqlite_files_outside_isolated_directory(self):
        with patch.dict(connections['default'].settings_dict, NAME='/tmp/another-school.sqlite3'):
            with self.assertRaises(CommandError):
                require_local_demo_database()

    @override_settings(SETTINGS_MODULE='bps_core.settings_mobile', LOCAL_MOBILE_MODE=True)
    def test_refuses_postgresql_even_with_local_profile_flag(self):
        with patch.dict(connections['default'].settings_dict, ENGINE='django.db.backends.postgresql'):
            with self.assertRaises(CommandError):
                require_local_demo_database()


@override_settings(SETTINGS_MODULE='bps_core.settings_mobile', LOCAL_MOBILE_DEMO_TEST_DATABASE=True)
class MobileDemoSeedTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        if os.environ.get('DJANGO_SETTINGS_MODULE') != 'bps_core.settings_mobile':
            raise SkipTest('Execute com --settings=bps_core.settings_mobile para usar SQLite isolado.')
        media = tempfile.TemporaryDirectory()
        cls.addClassCleanup(media.cleanup)
        media_settings = override_settings(MEDIA_ROOT=media.name, SETTINGS_MODULE='bps_core.settings_mobile')
        media_settings.enable()
        cls.addClassCleanup(media_settings.disable)
        with patch('socket.socket.connect', side_effect=AssertionError('A demonstração deve ser offline.')):
            cls.seed_result = seed_mobile_demo()

    def test_tracks_are_created_by_registration_from_level_and_shared_templates(self):
        catalog = load_demo_catalog()
        self.assertEqual(len(catalog), 124)
        teacher = User.objects.get(email=DEMO_TEACHER_EMAIL)
        self.assertEqual(teacher.role, 'teacher')
        self.assertFalse(teacher.is_staff)
        self.assertFalse(teacher.is_superuser)
        self.assertEqual(teacher.availabilities.count(), 5)
        for email, _, level, _ in DEMO_STUDENTS:
            with self.subTest(level=level):
                student = User.objects.get(email=email)
                lessons = Lesson.objects.filter(student=student, is_template=False)
                self.assertEqual(student.level, level)
                self.assertEqual(student.first_name, DEMO_MARKER)
                for skill in ['listening', 'speaking', 'reading', 'writing']:
                    self.assertGreaterEqual(getattr(student, skill), 1)
                    self.assertLessEqual(getattr(student, skill), 10)
                self.assertEqual(lessons.count(), 44 if level == 'A1/A2' else 24)
                self.assertFalse(lessons.filter(template__isnull=True).exists())
                self.assertFalse(lessons.exclude(teacher=teacher).exists())
                self.assertEqual(lessons.filter(level='ALL LEVELS').count(), 4)
                allowed = {'A1', 'A2', 'A1/A2', 'ALL LEVELS'} if level == 'A1/A2' else {level, 'ALL LEVELS'}
                self.assertTrue(set(lessons.values_list('level', flat=True)).issubset(allowed))
                self.assertEqual(lessons.filter(status='completed').count(), 3)
                self.assertTrue(lessons.filter(status='scheduled', date__gt=timezone.now()).exists())
                self.assertEqual(StudentRecurringSchedule.objects.filter(student=student, active=True).count(), 1)
                self.assertEqual(student.planned_lessons_count, lessons.count())
        self.assertEqual(self.seed_result['lessons'], 140)

    def test_demo_accounts_can_login_without_changing_other_accounts(self):
        client = APIClient()
        for email in [DEMO_TEACHER_EMAIL, *[row[0] for row in DEMO_STUDENTS]]:
            with self.subTest(email=email):
                response = client.post('/api/accounts/login/', {'email': email, 'password': DEMO_PASSWORD})
                self.assertEqual(response.status_code, 200)
                self.assertIn('access', response.data)
                self.assertIn('refresh', response.data)
        self.assertEqual(User.objects.filter(first_name=DEMO_MARKER).count(), 6)

    def test_student_api_lists_and_details_remain_isolated(self):
        ana = User.objects.get(email=DEMO_STUDENTS[0][0])
        bruno = User.objects.get(email=DEMO_STUDENTS[1][0])
        client = APIClient()
        client.force_authenticate(ana)
        response = client.get('/api/lessons/?all=true&is_template=false')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 44)
        self.assertTrue(all(str(row['student']) == str(ana.pk) for row in response.data))
        other_lesson = Lesson.objects.filter(student=bruno).first()
        self.assertEqual(client.get(f'/api/lessons/{other_lesson.pk}/').status_code, 404)
        client.force_authenticate(bruno)
        response = client.get('/api/lessons/?all=true&is_template=false')
        self.assertEqual(len(response.data), 24)
        self.assertTrue(all(str(row['student']) == str(bruno.pk) for row in response.data))

    def test_local_lesson_materials_have_readable_pdf_svg_and_nonempty_audio(self):
        student = User.objects.get(email=DEMO_STUDENTS[0][0])
        attachments = list(Attachment.objects.filter(lesson__student=student))
        self.assertEqual(len(attachments), 3)
        by_extension = {Path(item.file.name).suffix: item for item in attachments}
        with by_extension['.pdf'].file.open('rb') as document:
            self.assertTrue(document.read().startswith(b'%PDF-'))
        with by_extension['.svg'].file.open('rb') as image:
            self.assertIn(b'<svg', image.read())
        with by_extension['.wav'].file.open('rb') as audio:
            with wave.open(audio) as recording:
                self.assertGreater(recording.getnframes(), recording.getframerate() * 2)
                self.assertGreaterEqual(recording.getframerate(), 8000)

    def test_saved_ai_modes_render_feedback_audio_and_listening_metadata_without_network(self):
        student = User.objects.get(email=DEMO_STUDENTS[0][0])
        client = APIClient()
        client.force_authenticate(student)
        sessions = AIStudySession.objects.filter(student=student)
        self.assertEqual(set(sessions.values_list('mode', flat=True)), {'review', 'speaking', 'writing', 'listening'})
        with patch('socket.socket.connect', side_effect=AssertionError('Somente histórico local deve ser consultado.')):
            for session in sessions:
                response = client.get(f'/api/ai-study/sessions/{session.pk}/')
                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertTrue(payload['messages'])
                if session.mode == 'speaking':
                    feedback = next(message['feedback_detail'] for message in payload['messages'] if message['feedback_detail'])
                    self.assertIsNone(feedback['overall_score'])
                    self.assertIn('/media/mobile-demo/audio/', feedback['audio_url'])
                elif session.mode == 'writing':
                    feedback = next(message['writing_feedback_detail'] for message in payload['messages'] if message['writing_feedback_detail'])
                    self.assertTrue(feedback['corrected_text'])
                    self.assertTrue(feedback['error_explanations'])
                elif session.mode == 'listening':
                    challenge = next(message['metadata']['interpreter_exercise'] for message in payload['messages'] if 'interpreter_exercise' in message['metadata'])
                    self.assertIn(challenge['correct_option_id'], [option['id'] for option in challenge['options']])
                    self.assertTrue(challenge['tts_audio_url'].startswith('/media/'))

    def test_finance_and_teacher_views_have_demo_profiles_history_and_three_global_courses(self):
        teacher = User.objects.get(email=DEMO_TEACHER_EMAIL)
        self.assertEqual(StudentFinanceProfile.objects.filter(teacher=teacher).count(), 5)
        self.assertEqual(Course.objects.filter(created_by=teacher).count(), 3)
        self.assertEqual(teacher.financial_settings.pix_key, '')
        self.assertTrue(Payment.objects.filter(teacher=teacher, status='paid').exists())
        self.assertTrue(Payment.objects.filter(teacher=teacher, status='overdue').exists())
        self.assertTrue(Payment.objects.filter(teacher=teacher, status='awaiting_confirmation').exists())
        client = APIClient()
        client.force_authenticate(teacher)
        response = client.get('/api/lessons/?all=true&is_template=false')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 140)
        self.assertEqual(client.get('/api/finance/dashboard/').status_code, 200)
        student = User.objects.get(email=DEMO_STUDENTS[0][0])
        client.force_authenticate(student)
        response = client.get('/api/finance/me/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(student.finance_profile.contract_file)

    def test_rerun_preserves_edited_data_passwords_and_unrelated_accounts(self):
        student = User.objects.get(email=DEMO_STUDENTS[0][0])
        student.name = 'Nome editado localmente'
        student.set_password('A different locally edited passphrase!')
        student.save(update_fields=['name', 'password'])
        lesson = Lesson.objects.filter(student=student, status='completed').first()
        lesson.notes = '<p>Anotação editada pelo professor.</p>'
        lesson.save(update_fields=['notes'])
        template = lesson.template
        template.title = 'Template ajustado para teste'
        template.save(update_fields=['title'])
        unrelated = User.objects.create_user(email='minha-conta-local@example.test', password='Independent account 324!')
        before = {model: model.objects.count() for model in [User, Lesson, LessonSummary, NewWord, VocabularyCard, Homework]}
        result = seed_mobile_demo()
        self.assertEqual(result['students_created'], 0)
        self.assertEqual(result['students_preserved'], 5)
        self.assertEqual(result['templates_created'], 0)
        self.assertFalse(result['teacher_created'])
        for model, count in before.items():
            self.assertEqual(model.objects.count(), count)
        student.refresh_from_db()
        lesson.refresh_from_db()
        template.refresh_from_db()
        unrelated.refresh_from_db()
        self.assertEqual(student.name, 'Nome editado localmente')
        self.assertTrue(student.check_password('A different locally edited passphrase!'))
        self.assertEqual(lesson.notes, '<p>Anotação editada pelo professor.</p>')
        self.assertEqual(template.title, 'Template ajustado para teste')
        self.assertTrue(unrelated.check_password('Independent account 324!'))

    def test_reserved_email_collision_is_refused_without_modifying_any_records(self):
        student = User.objects.get(email=DEMO_STUDENTS[0][0])
        student.first_name = ''
        student.save(update_fields=['first_name'])
        before = (User.objects.count(), Lesson.objects.count(), Homework.objects.count())
        with self.assertRaises(CommandError):
            seed_mobile_demo()
        student.refresh_from_db()
        self.assertEqual(student.first_name, '')
        self.assertEqual((User.objects.count(), Lesson.objects.count(), Homework.objects.count()), before)


@override_settings(SETTINGS_MODULE='bps_core.settings_mobile', LOCAL_MOBILE_DEMO_TEST_DATABASE=True)
class MobileDemoRollbackTests(TestCase):
    def setUp(self):
        if os.environ.get('DJANGO_SETTINGS_MODULE') != 'bps_core.settings_mobile':
            self.skipTest('Execute com --settings=bps_core.settings_mobile para usar SQLite isolado.')

    @patch('accounts.mobile_demo_content.seed_student_content', side_effect=RuntimeError('Conteúdo indisponível'))
    def test_creation_failure_rolls_back_accounts_templates_and_tracks(self, content):
        with self.assertRaisesRegex(RuntimeError, 'Conteúdo indisponível'):
            seed_mobile_demo()
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(Lesson.objects.count(), 0)
        self.assertEqual(StudentRecurringSchedule.objects.count(), 0)
