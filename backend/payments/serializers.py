from decimal import Decimal

from rest_framework import serializers
from django.utils import timezone

from .models import FinancialSettings, StudentFinanceProfile, Payment, PaymentReceipt, FinancialTimelineEntry


class FinancialSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinancialSettings
        fields = [
            'id', 'teacher', 'pix_key_type', 'pix_key', 'default_monthly_fee',
            'default_due_day', 'default_message', 'payment_instructions',
            'whatsapp_number', 'created_at', 'updated_at'
        ]
        read_only_fields = ['teacher', 'created_at', 'updated_at']


class PaymentReceiptSerializer(serializers.ModelSerializer):
    file_url = serializers.FileField(source='file', read_only=True)
    uploaded_by_name = serializers.CharField(source='uploaded_by.name', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.name', read_only=True)

    class Meta:
        model = PaymentReceipt
        fields = [
            'id', 'payment', 'uploaded_by', 'uploaded_by_name', 'file', 'file_url',
            'original_name', 'review_status', 'rejection_reason', 'uploaded_at',
            'reviewed_at', 'reviewed_by', 'reviewed_by_name'
        ]
        read_only_fields = [
            'uploaded_by', 'uploaded_by_name', 'review_status', 'uploaded_at',
            'reviewed_at', 'reviewed_by', 'reviewed_by_name'
        ]


class FinancialTimelineEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = FinancialTimelineEntry
        fields = ['id', 'event_type', 'title', 'description', 'metadata', 'created_at']


class StudentFinanceProfileSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    contract_url = serializers.FileField(source='contract_file', read_only=True)
    payments_count = serializers.SerializerMethodField()

    class Meta:
        model = StudentFinanceProfile
        fields = [
            'id', 'teacher', 'student', 'student_name', 'monthly_fee', 'due_day',
            'notes', 'contract_file', 'contract_url', 'contract_name',
            'payments_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['teacher', 'created_at', 'updated_at', 'contract_url', 'payments_count']

    def get_payments_count(self, obj):
        return obj.payments.count()


class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    receipts = PaymentReceiptSerializer(many=True, read_only=True)
    timeline = FinancialTimelineEntrySerializer(source='timeline_entries', many=True, read_only=True)
    alert = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            'id', 'teacher', 'teacher_name', 'student', 'student_name', 'finance_profile',
            'reference_month', 'due_date', 'amount', 'status', 'payment_method',
            'paid_at', 'confirmed_at', 'notes', 'internal_notes', 'generated_automatically',
            'receipt_submitted_at', 'created_at', 'updated_at', 'receipts', 'timeline', 'alert'
        ]
        read_only_fields = ['teacher', 'confirmed_at', 'created_at', 'updated_at', 'receipt_submitted_at']

    def get_alert(self, obj):
        if not obj.due_date:
            return None
        if obj.status == 'awaiting_confirmation':
            return 'awaiting_confirmation'
        if obj.status == 'paid':
            return None

        delta = (obj.due_date - timezone.localdate()).days
        if delta == 0:
            return 'due_today'
        if delta < 0:
            return 'overdue'
        if delta <= 3:
            return 'upcoming'
        return None


class TeacherDashboardSerializer(serializers.Serializer):
    total_expected = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_received = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_pending = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_overdue = serializers.DecimalField(max_digits=10, decimal_places=2)
    delinquent_students = serializers.IntegerField()
    awaiting_confirmation = serializers.IntegerField()
    pending_items = PaymentSerializer(many=True)
    due_soon_items = PaymentSerializer(many=True)
    overdue_items = PaymentSerializer(many=True)
    awaiting_confirmation_items = PaymentSerializer(many=True)
    monthly_projection = serializers.ListField()


class StudentFinanceSummarySerializer(serializers.Serializer):
    settings = FinancialSettingsSerializer()
    profile = StudentFinanceProfileSerializer(allow_null=True)
    current_payment = PaymentSerializer(allow_null=True)
    upcoming_payments = PaymentSerializer(many=True)
    payment_history = PaymentSerializer(many=True)
    timeline = FinancialTimelineEntrySerializer(many=True)
    pix_payload = serializers.CharField()


def serialize_decimal(value):
    return Decimal(value or 0).quantize(Decimal('0.01'))
