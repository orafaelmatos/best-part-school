from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db import transaction
import json

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    recurring_schedules = serializers.SerializerMethodField()
    finance_profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'role', 'level', 'listening', 'speaking', 'reading', 'writing', 'recurring_schedules', 'finance_profile']

    def get_recurring_schedules(self, obj):
        from lessons.serializers import StudentRecurringScheduleSerializer
        return StudentRecurringScheduleSerializer(obj.recurring_schedules.filter(active=True), many=True).data

    def get_finance_profile(self, obj):
        from payments.serializers import StudentFinanceProfileSerializer
        if hasattr(obj, 'finance_profile'):
            return StudentFinanceProfileSerializer(obj.finance_profile).data
        return None

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    level = serializers.CharField(required=False, allow_blank=True)
    schedule_day = serializers.IntegerField(required=False, write_only=True, allow_null=True)
    schedule_time = serializers.TimeField(required=False, write_only=True, allow_null=True)
    schedules = serializers.ListField(child=serializers.DictField(), required=False, write_only=True)
    teacher_id = serializers.UUIDField(required=False, write_only=True, allow_null=True)
    monthly_fee = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, write_only=True)
    due_day = serializers.IntegerField(required=False, write_only=True)
    finance_notes = serializers.CharField(required=False, allow_blank=True, write_only=True)
    contract_file = serializers.FileField(required=False, allow_null=True, write_only=True)
    contract_name = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'name', 'email', 'role', 'password', 'level', 'listening', 'speaking',
            'reading', 'writing', 'schedule_day', 'schedule_time', 'schedules', 'teacher_id',
            'monthly_fee', 'due_day', 'finance_notes', 'contract_file', 'contract_name'
        ]

    @transaction.atomic
    def create(self, validated_data):
        schedule_day = validated_data.pop('schedule_day', None)
        schedule_time = validated_data.pop('schedule_time', None)
        schedules = validated_data.pop('schedules', None)
        teacher_id = validated_data.pop('teacher_id', None)
        monthly_fee = validated_data.pop('monthly_fee', None)
        due_day = validated_data.pop('due_day', None)
        finance_notes = validated_data.pop('finance_notes', '')
        contract_file = validated_data.pop('contract_file', None)
        contract_name = validated_data.pop('contract_name', '')

        user = User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            name=validated_data.get('name', ''),
            role=validated_data.get('role', 'student'),
            level=validated_data.get('level', ''),
        )
        user.listening = validated_data.get('listening', 1)
        user.speaking = validated_data.get('speaking', 1)
        user.reading = validated_data.get('reading', 1)
        user.writing = validated_data.get('writing', 1)
        user.save()
        
        if user.role == 'student':
            from lessons.scheduling import create_student_schedule_and_lessons
            from payments.models import FinancialSettings
            from payments.views import upsert_finance_profile, generate_monthly_payments
            teacher = User.objects.filter(id=teacher_id).first() if teacher_id else None
            teacher_settings = FinancialSettings.objects.filter(teacher=teacher).first() if teacher else None
            monthly_fee = monthly_fee if monthly_fee is not None else getattr(teacher_settings, 'default_monthly_fee', 0)
            due_day = due_day or getattr(teacher_settings, 'default_due_day', 10)

            if teacher:
                profile = upsert_finance_profile(
                    student=user,
                    teacher=teacher,
                    monthly_fee=monthly_fee,
                    due_day=due_day,
                    notes=finance_notes,
                    contract_file=contract_file,
                    contract_name=contract_name,
                )
                generate_monthly_payments(profile)
            if schedules is None and schedule_day is not None and schedule_time is not None:
                schedules = [{'day': schedule_day, 'time': schedule_time, 'source': 'js'}]
            try:
                create_student_schedule_and_lessons(user, teacher=teacher, schedule_entries=schedules or [])
            except ValueError as exc:
                raise serializers.ValidationError({'schedule': str(exc)})

        return user

    def to_internal_value(self, data):
        mutable_data = data.copy()
        schedules_value = mutable_data.get('schedules')
        if isinstance(schedules_value, str) and schedules_value:
            try:
                parsed = json.loads(schedules_value)
                if hasattr(mutable_data, 'setlist'):
                    mutable_data.setlist('schedules', parsed)
                else:
                    mutable_data['schedules'] = parsed
            except json.JSONDecodeError:
                raise serializers.ValidationError({'schedules': 'Formato invalido para agenda.'})
        return super().to_internal_value(mutable_data)

    def validate_contract_file(self, value):
        if not value:
            return value
        allowed = ['.pdf', '.png', '.jpg', '.jpeg']
        name = value.name.lower()
        if not any(name.endswith(ext) for ext in allowed):
            raise serializers.ValidationError('Contrato deve ser PDF, PNG, JPG ou JPEG.')
        if value.size > 8 * 1024 * 1024:
            raise serializers.ValidationError('Contrato deve ter no maximo 8 MB.')
        return value

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['name'] = user.name
        token['level'] = user.level
        return token
