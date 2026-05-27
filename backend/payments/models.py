import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone


User = settings.AUTH_USER_MODEL


class FinancialSettings(models.Model):
    PIX_KEY_TYPE_CHOICES = (
        ('cpf', 'CPF'),
        ('email', 'E-mail'),
        ('phone', 'Telefone'),
        ('random', 'Chave Aleatoria'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teacher = models.OneToOneField(User, on_delete=models.CASCADE, related_name='financial_settings')
    pix_key_type = models.CharField(max_length=20, choices=PIX_KEY_TYPE_CHOICES, default='email')
    pix_key = models.CharField(max_length=255, blank=True)
    default_monthly_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    default_due_day = models.PositiveSmallIntegerField(default=10)
    default_message = models.TextField(
        default='Oi, {student_name}! Sua mensalidade de R$ {amount} vence em {due_date}. Chave PIX: {pix_key}.'
    )
    payment_instructions = models.TextField(blank=True)
    whatsapp_number = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Settings {self.teacher_id}"


class StudentFinanceProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='student_finance_profiles')
    student = models.OneToOneField(User, on_delete=models.CASCADE, related_name='finance_profile')
    monthly_fee = models.DecimalField(max_digits=10, decimal_places=2)
    due_day = models.PositiveSmallIntegerField(default=10)
    notes = models.TextField(blank=True)
    contract_file = models.FileField(upload_to='finance/contracts/', blank=True, null=True, max_length=768)
    contract_name = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.student_id} finance profile"


class Payment(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pendente'),
        ('awaiting_confirmation', 'Aguardando Confirmacao'),
        ('paid', 'Pago'),
        ('overdue', 'Vencido'),
    )
    METHOD_CHOICES = (
        ('pix_manual', 'PIX Manual'),
        ('future_gateway', 'Gateway Futuro'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payments_received', null=True, blank=True)
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payments')
    finance_profile = models.ForeignKey(
        StudentFinanceProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payments'
    )
    reference_month = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default='pending')
    payment_method = models.CharField(max_length=32, choices=METHOD_CHOICES, default='pix_manual')
    paid_at = models.DateTimeField(blank=True, null=True)
    confirmed_at = models.DateTimeField(blank=True, null=True)
    notes = models.TextField(blank=True)
    internal_notes = models.TextField(blank=True)
    generated_automatically = models.BooleanField(default=True)
    receipt_submitted_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['due_date', 'created_at']
        unique_together = ('student', 'reference_month')

    def __str__(self):
        return f"{self.student_id} - {self.reference_month}"

    @property
    def is_overdue(self):
        return bool(self.due_date and self.status in ['pending', 'awaiting_confirmation'] and self.due_date < timezone.localdate())

    def sync_status(self, save=True):
        if self.status == 'paid':
            return
        if self.status == 'awaiting_confirmation':
            return
        if not self.due_date:
            return
        self.status = 'overdue' if self.due_date < timezone.localdate() else 'pending'
        if save:
            self.save(update_fields=['status', 'updated_at'])


class PaymentReceipt(models.Model):
    REVIEW_STATUS_CHOICES = (
        ('pending', 'Pendente'),
        ('approved', 'Aprovado'),
        ('rejected', 'Rejeitado'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='receipts')
    uploaded_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='uploaded_payment_receipts')
    file = models.FileField(upload_to='finance/receipts/')
    original_name = models.CharField(max_length=255, blank=True)
    review_status = models.CharField(max_length=20, choices=REVIEW_STATUS_CHOICES, default='pending')
    rejection_reason = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    reviewed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='reviewed_payment_receipts'
    )

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"Receipt {self.payment_id}"


class FinancialTimelineEntry(models.Model):
    EVENT_CHOICES = (
        ('payment_created', 'Pagamento criado'),
        ('status_changed', 'Status alterado'),
        ('receipt_uploaded', 'Comprovante enviado'),
        ('receipt_approved', 'Comprovante aprovado'),
        ('receipt_rejected', 'Comprovante rejeitado'),
        ('contract_uploaded', 'Contrato enviado'),
        ('note_added', 'Observacao adicionada'),
        ('charge_message_generated', 'Cobranca gerada'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='financial_timeline_entries')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='financial_timeline')
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='timeline_entries', blank=True, null=True)
    event_type = models.CharField(max_length=40, choices=EVENT_CHOICES)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title
