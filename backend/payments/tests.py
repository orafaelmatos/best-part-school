import datetime
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from .models import FinancialSettings, StudentFinanceProfile, Payment
from .views import generate_monthly_payments


class FinanceEndpointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.teacher = User.objects.create_user(email='teacher-fin@test.com', password='123', role='teacher', name='Teacher')
        self.student = User.objects.create_user(email='student-fin@test.com', password='123', role='student', name='Student', level='B1')
        self.settings = FinancialSettings.objects.create(
            teacher=self.teacher,
            pix_key='teacher@test.com',
            default_monthly_fee=Decimal('250.00'),
            default_due_day=10,
            whatsapp_number='5511999999999',
        )
        self.profile = StudentFinanceProfile.objects.create(
            teacher=self.teacher,
            student=self.student,
            monthly_fee=Decimal('250.00'),
            due_day=10,
        )
        generate_monthly_payments(self.profile, months_ahead=2)
        self.payment = Payment.objects.filter(student=self.student).order_by('due_date').first()

    def test_teacher_dashboard_returns_summary(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.get('/api/finance/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('total_expected', response.data)
        self.assertIn('pending_items', response.data)

    def test_student_finance_returns_pix_payload(self):
        self.client.force_authenticate(self.student)
        response = self.client.get('/api/finance/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data['profile']['student']), str(self.student.id))
        self.assertIn('PIX|', response.data['pix_payload'])

    def test_charge_student_returns_whatsapp_url(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.post(f'/api/payments/{self.payment.id}/charge_student/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('wa.me', response.data['url'])
