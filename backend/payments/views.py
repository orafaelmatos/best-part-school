import datetime
from decimal import Decimal
from urllib.parse import quote

from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import FinancialSettings, StudentFinanceProfile, Payment, PaymentReceipt, FinancialTimelineEntry
from .serializers import (
    FinancialSettingsSerializer,
    StudentFinanceProfileSerializer,
    PaymentSerializer,
    PaymentReceiptSerializer,
    FinancialTimelineEntrySerializer,
)


User = get_user_model()


def current_month_range():
    today = timezone.localdate()
    start = today.replace(day=1)
    if today.month == 12:
        end = today.replace(year=today.year + 1, month=1, day=1)
    else:
        end = today.replace(month=today.month + 1, day=1)
    return start, end


def month_start(date_value):
    return date_value.replace(day=1)


def build_pix_payload(settings, payment):
    key = settings.pix_key if settings else ''
    if not key:
        return ''
    return f"PIX|{key}|{payment.amount}|{payment.student.name}|{payment.due_date.isoformat()}"


def create_timeline(teacher, student, event_type, title, description='', payment=None, metadata=None):
    return FinancialTimelineEntry.objects.create(
        teacher=teacher,
        student=student,
        payment=payment,
        event_type=event_type,
        title=title,
        description=description,
        metadata=metadata or {},
    )


def upsert_finance_profile(student, teacher, monthly_fee, due_day, notes='', contract_file=None, contract_name=''):
    profile, _ = StudentFinanceProfile.objects.get_or_create(
        student=student,
        defaults={
            'teacher': teacher,
            'monthly_fee': monthly_fee,
            'due_day': due_day,
            'notes': notes,
        },
    )
    profile.teacher = teacher
    profile.monthly_fee = monthly_fee
    profile.due_day = due_day
    profile.notes = notes
    if contract_file:
        profile.contract_file = contract_file
        profile.contract_name = contract_name or getattr(contract_file, 'name', '')
        create_timeline(teacher, student, 'contract_uploaded', 'Contrato atualizado', payment=None)
    profile.save()
    return profile


def generate_monthly_payments(profile, months_ahead=3):
    today = timezone.localdate()
    created = []
    for offset in range(months_ahead):
        target = (today.replace(day=1) + datetime.timedelta(days=32 * offset)).replace(day=1)
        due_day = min(profile.due_day, 28)
        due_date = target.replace(day=due_day)
        payment, was_created = Payment.objects.get_or_create(
            student=profile.student,
            reference_month=target,
            defaults={
                'teacher': profile.teacher,
                'finance_profile': profile,
                'due_date': due_date,
                'amount': profile.monthly_fee,
                'payment_method': 'pix_manual',
                'status': 'overdue' if due_date < timezone.localdate() else 'pending',
                'generated_automatically': True,
            },
        )
        if not was_created:
            payment.teacher = profile.teacher
            payment.finance_profile = profile
            payment.due_date = due_date
            payment.amount = profile.monthly_fee
            payment.sync_status(save=False)
            payment.save()
        if was_created:
            create_timeline(
                profile.teacher,
                profile.student,
                'payment_created',
                'Mensalidade criada',
                f"Mensalidade de {target.strftime('%m/%Y')} criada.",
                payment=payment,
            )
        created.append(payment)
    return created


class FinancialSettingsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        settings_obj, _ = FinancialSettings.objects.get_or_create(teacher=request.user)
        return Response(FinancialSettingsSerializer(settings_obj).data)

    def put(self, request):
        settings_obj, _ = FinancialSettings.objects.get_or_create(teacher=request.user)
        serializer = FinancialSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(teacher=request.user)
        return Response(serializer.data)


class StudentFinanceProfileViewSet(viewsets.ModelViewSet):
    serializer_class = StudentFinanceProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = StudentFinanceProfile.objects.select_related('student', 'teacher')
        if user.role == 'student':
            return qs.filter(student=user)
        if user.role == 'teacher':
            return qs.filter(teacher=user)
        return qs

    def perform_create(self, serializer):
        serializer.save(teacher=self.request.user)


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Payment.objects.select_related('student', 'teacher', 'finance_profile').prefetch_related('receipts', 'timeline_entries')
        for payment in qs:
            payment.sync_status()
        qs = Payment.objects.select_related('student', 'teacher', 'finance_profile').prefetch_related('receipts', 'timeline_entries').filter(due_date__isnull=False)

        if user.role == 'student':
            return qs.filter(student=user)
        if user.role == 'teacher':
            return qs.filter(teacher=user)
        return qs

    def perform_create(self, serializer):
        student = serializer.validated_data['student']
        profile = StudentFinanceProfile.objects.filter(student=student).first()
        serializer.save(
            teacher=self.request.user,
            finance_profile=profile,
            payment_method='pix_manual',
        )

    @action(detail=True, methods=['patch'])
    def mark_paid(self, request, pk=None):
        payment = self.get_object()
        payment.status = 'paid'
        payment.paid_at = timezone.now()
        payment.confirmed_at = timezone.now()
        payment.save()
        create_timeline(payment.teacher, payment.student, 'status_changed', 'Pagamento marcado como pago', payment=payment)
        return Response(self.get_serializer(payment).data)

    @action(detail=True, methods=['patch'])
    def mark_pending(self, request, pk=None):
        payment = self.get_object()
        payment.status = 'pending'
        payment.paid_at = None
        payment.confirmed_at = None
        payment.save()
        create_timeline(payment.teacher, payment.student, 'status_changed', 'Pagamento voltou para pendente', payment=payment)
        return Response(self.get_serializer(payment).data)

    @action(detail=True, methods=['post'])
    def upload_receipt(self, request, pk=None):
        payment = self.get_object()
        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'Arquivo obrigatorio.'}, status=status.HTTP_400_BAD_REQUEST)
        lower_name = upload.name.lower()
        if not any(lower_name.endswith(ext) for ext in ['.pdf', '.png', '.jpg', '.jpeg']):
            return Response({'error': 'Comprovante deve ser PDF, PNG, JPG ou JPEG.'}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > 8 * 1024 * 1024:
            return Response({'error': 'Comprovante deve ter no maximo 8 MB.'}, status=status.HTTP_400_BAD_REQUEST)

        receipt = PaymentReceipt.objects.create(
            payment=payment,
            uploaded_by=request.user,
            file=upload,
            original_name=getattr(upload, 'name', ''),
        )
        payment.status = 'awaiting_confirmation'
        payment.receipt_submitted_at = timezone.now()
        payment.save()
        create_timeline(payment.teacher, payment.student, 'receipt_uploaded', 'Comprovante enviado', payment=payment)
        return Response(PaymentReceiptSerializer(receipt).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'])
    def approve_receipt(self, request, pk=None):
        payment = self.get_object()
        receipt = payment.receipts.first()
        if not receipt:
            return Response({'error': 'Nenhum comprovante encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        receipt.review_status = 'approved'
        receipt.reviewed_at = timezone.now()
        receipt.reviewed_by = request.user
        receipt.rejection_reason = ''
        receipt.save()
        payment.status = 'paid'
        payment.paid_at = timezone.now()
        payment.confirmed_at = timezone.now()
        payment.save()
        create_timeline(payment.teacher, payment.student, 'receipt_approved', 'Comprovante aprovado', payment=payment)
        return Response(self.get_serializer(payment).data)

    @action(detail=True, methods=['patch'])
    def reject_receipt(self, request, pk=None):
        payment = self.get_object()
        receipt = payment.receipts.first()
        if not receipt:
            return Response({'error': 'Nenhum comprovante encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        receipt.review_status = 'rejected'
        receipt.reviewed_at = timezone.now()
        receipt.reviewed_by = request.user
        receipt.rejection_reason = request.data.get('reason', '')
        receipt.save()
        payment.status = 'pending'
        payment.save()
        create_timeline(payment.teacher, payment.student, 'receipt_rejected', 'Comprovante rejeitado', receipt.rejection_reason, payment=payment)
        return Response(self.get_serializer(payment).data)

    @action(detail=True, methods=['post'])
    def charge_student(self, request, pk=None):
        payment = self.get_object()
        settings_obj = FinancialSettings.objects.filter(teacher=payment.teacher).first()
        template = settings_obj.default_message if settings_obj else 'Oi, {student_name}! Sua mensalidade de R$ {amount} vence em {due_date}. Chave PIX: {pix_key}.'
        message = template.format(
            student_name=payment.student.name,
            amount=payment.amount,
            due_date=payment.due_date.strftime('%d/%m/%Y'),
            pix_key=settings_obj.pix_key if settings_obj else '',
        )
        number = settings_obj.whatsapp_number if settings_obj else ''
        url = f"https://wa.me/{number}?text={quote(message)}" if number else ''
        create_timeline(payment.teacher, payment.student, 'charge_message_generated', 'Mensagem de cobranca gerada', payment=payment)
        return Response({'message': message, 'url': url})


class TeacherFinanceDashboardAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        payments = list(Payment.objects.filter(teacher=user, due_date__isnull=False).select_related('student', 'teacher', 'finance_profile').prefetch_related('receipts', 'timeline_entries'))
        for payment in payments:
            payment.sync_status()
        payments = list(Payment.objects.filter(teacher=user, due_date__isnull=False).select_related('student', 'teacher', 'finance_profile').prefetch_related('receipts', 'timeline_entries'))

        month_start_date, next_month_start = current_month_range()
        month_payments = [payment for payment in payments if month_start_date <= payment.due_date < next_month_start]
        total_expected = sum((payment.amount for payment in month_payments), Decimal('0.00'))
        total_received = sum((payment.amount for payment in month_payments if payment.status == 'paid'), Decimal('0.00'))
        total_pending = sum((payment.amount for payment in month_payments if payment.status == 'pending'), Decimal('0.00'))
        total_overdue = sum((payment.amount for payment in payments if payment.status == 'overdue'), Decimal('0.00'))
        delinquent_students = len({str(payment.student_id) for payment in payments if payment.status == 'overdue'})
        awaiting_count = len([payment for payment in payments if payment.status == 'awaiting_confirmation'])

        due_soon_cutoff = timezone.localdate() + datetime.timedelta(days=3)
        pending_items = [payment for payment in payments if payment.status == 'pending']
        due_soon_items = [payment for payment in pending_items if payment.due_date <= due_soon_cutoff]
        overdue_items = [payment for payment in payments if payment.status == 'overdue']
        awaiting_items = [payment for payment in payments if payment.status == 'awaiting_confirmation']

        projection = []
        cursor = month_start_date
        for _ in range(4):
            if cursor.month == 12:
                next_cursor = cursor.replace(year=cursor.year + 1, month=1, day=1)
            else:
                next_cursor = cursor.replace(month=cursor.month + 1, day=1)
            items = [payment for payment in payments if cursor <= payment.due_date < next_cursor]
            projection.append({
                'label': cursor.strftime('%b/%Y'),
                'expected': float(sum((payment.amount for payment in items), Decimal('0.00'))),
                'received': float(sum((payment.amount for payment in items if payment.status == 'paid'), Decimal('0.00'))),
                'pending': float(sum((payment.amount for payment in items if payment.status in ['pending', 'awaiting_confirmation', 'overdue']), Decimal('0.00'))),
            })
            cursor = next_cursor

        serializer = PaymentSerializer
        return Response({
            'total_expected': total_expected,
            'total_received': total_received,
            'total_pending': total_pending,
            'total_overdue': total_overdue,
            'delinquent_students': delinquent_students,
            'awaiting_confirmation': awaiting_count,
            'pending_items': serializer(pending_items[:8], many=True).data,
            'due_soon_items': serializer(due_soon_items[:8], many=True).data,
            'overdue_items': serializer(overdue_items[:8], many=True).data,
            'awaiting_confirmation_items': serializer(awaiting_items[:8], many=True).data,
            'monthly_projection': projection,
        })


class StudentFinanceDetailAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, student_id):
        profile = StudentFinanceProfile.objects.select_related('student', 'teacher').filter(student_id=student_id).first()
        if not profile:
            return Response({'error': 'Perfil financeiro nao encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        payments = Payment.objects.filter(student_id=student_id, due_date__isnull=False).select_related('student', 'teacher', 'finance_profile').prefetch_related('receipts', 'timeline_entries')
        for payment in payments:
            payment.sync_status()
        payments = Payment.objects.filter(student_id=student_id, due_date__isnull=False).select_related('student', 'teacher', 'finance_profile').prefetch_related('receipts', 'timeline_entries')
        settings_obj = FinancialSettings.objects.filter(teacher=profile.teacher).first()
        timeline = FinancialTimelineEntry.objects.filter(student_id=student_id, teacher=profile.teacher)[:20]
        return Response({
            'profile': StudentFinanceProfileSerializer(profile).data,
            'settings': FinancialSettingsSerializer(settings_obj).data if settings_obj else None,
            'history': PaymentSerializer(payments, many=True).data,
            'timeline': FinancialTimelineEntrySerializer(timeline, many=True).data,
        })


class MyFinanceAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        student = request.user
        profile = StudentFinanceProfile.objects.select_related('teacher', 'student').filter(student=student).first()
        if not profile:
            return Response({
                'settings': None,
                'profile': None,
                'current_payment': None,
                'upcoming_payments': [],
                'payment_history': [],
                'timeline': [],
                'pix_payload': '',
            })
        payments = list(Payment.objects.filter(student=student, due_date__isnull=False).select_related('student', 'teacher', 'finance_profile').prefetch_related('receipts', 'timeline_entries'))
        for payment in payments:
            payment.sync_status()
        payments = list(Payment.objects.filter(student=student, due_date__isnull=False).select_related('student', 'teacher', 'finance_profile').prefetch_related('receipts', 'timeline_entries'))
        settings_obj = FinancialSettings.objects.filter(teacher=profile.teacher).first()
        current_payment = next((payment for payment in payments if payment.status in ['pending', 'awaiting_confirmation', 'overdue']), None)
        return Response({
            'settings': FinancialSettingsSerializer(settings_obj).data if settings_obj else None,
            'profile': StudentFinanceProfileSerializer(profile).data,
            'current_payment': PaymentSerializer(current_payment).data if current_payment else None,
            'upcoming_payments': PaymentSerializer([payment for payment in payments if payment.status in ['pending', 'awaiting_confirmation', 'overdue']][:6], many=True).data,
            'payment_history': PaymentSerializer(payments[:12], many=True).data,
            'timeline': FinancialTimelineEntrySerializer(FinancialTimelineEntry.objects.filter(student=student)[:20], many=True).data,
            'pix_payload': build_pix_payload(settings_obj, current_payment) if current_payment and settings_obj else '',
        })
