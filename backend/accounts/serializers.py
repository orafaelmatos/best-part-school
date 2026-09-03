from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db import transaction
import json

User = get_user_model()
MAX_PHOTO_SIZE = 8 * 1024 * 1024
STUDENT_TRACKING_FIELDS = [
    'planned_lessons_count',
    'completed_lessons_count',
    'contract_start_date',
    'contract_end_date',
    'learning_goal',
    'taught_content',
    'content_to_teach',
    'strengths',
    'weaknesses',
]


def validate_photo_file(value):
    if not value:
        return value
    allowed = ['.png', '.jpg', '.jpeg', '.webp']
    name = value.name.lower()
    if not any(name.endswith(ext) for ext in allowed):
        raise serializers.ValidationError('Foto deve ser PNG, JPG, JPEG ou WEBP.')
    content_type = getattr(value, 'content_type', '') or ''
    if content_type and not content_type.startswith('image/'):
        raise serializers.ValidationError('Foto deve ser uma imagem valida.')
    if value.size > MAX_PHOTO_SIZE:
        raise serializers.ValidationError('Foto deve ter no maximo 8 MB.')
    return value


def validate_contract_upload(value):
    if not value:
        return value
    allowed = ['.pdf', '.png', '.jpg', '.jpeg']
    name = value.name.lower()
    if not any(name.endswith(ext) for ext in allowed):
        raise serializers.ValidationError('Contrato deve ser PDF, PNG, JPG ou JPEG.')
    if value.size > MAX_PHOTO_SIZE:
        raise serializers.ValidationError('Contrato deve ter no maximo 8 MB.')
    return value


def coerce_schedules_payload(data):
    mutable_data = data.copy()
    for date_field in ['contract_start_date', 'contract_end_date']:
        if mutable_data.get(date_field) == '':
            mutable_data[date_field] = None
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
    return mutable_data

class UserSerializer(serializers.ModelSerializer):
    recurring_schedules = serializers.SerializerMethodField()
    finance_profile = serializers.SerializerMethodField()
    effective_planned_lessons_count = serializers.SerializerMethodField()
    effective_completed_lessons_count = serializers.SerializerMethodField()
    pending_lessons_count = serializers.SerializerMethodField()
    photo = serializers.FileField(required=False, allow_null=True, write_only=True)
    photo_url = serializers.FileField(source='photo', read_only=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)
    remove_photo = serializers.BooleanField(write_only=True, required=False, default=False)
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
            'id', 'name', 'email', 'role', 'level', 'photo', 'photo_url', 'password', 'remove_photo',
            'listening', 'speaking', 'reading', 'writing',
            *STUDENT_TRACKING_FIELDS,
            'effective_planned_lessons_count', 'effective_completed_lessons_count', 'pending_lessons_count',
            'recurring_schedules', 'finance_profile',
            'schedule_day', 'schedule_time', 'schedules', 'teacher_id',
            'monthly_fee', 'due_day', 'finance_notes', 'contract_file', 'contract_name'
        ]
        extra_kwargs = {
            'photo': {'write_only': True, 'required': False, 'allow_null': True},
        }

    def validate_photo(self, value):
        return validate_photo_file(value)

    def validate_contract_file(self, value):
        return validate_contract_upload(value)

    def get_recurring_schedules(self, obj):
        from lessons.serializers import StudentRecurringScheduleSerializer
        return StudentRecurringScheduleSerializer(obj.recurring_schedules.filter(active=True), many=True).data

    def get_finance_profile(self, obj):
        from payments.serializers import StudentFinanceProfileSerializer
        if hasattr(obj, 'finance_profile'):
            return StudentFinanceProfileSerializer(obj.finance_profile).data
        return None

    def get_effective_planned_lessons_count(self, obj):
        from lessons.scheduling import effective_planned_lesson_count
        return effective_planned_lesson_count(obj)

    def get_effective_completed_lessons_count(self, obj):
        from lessons.scheduling import effective_completed_lesson_count
        return effective_completed_lesson_count(obj)

    def get_pending_lessons_count(self, obj):
        from lessons.scheduling import pending_lesson_count
        return pending_lesson_count(obj)

    def _resolve_teacher(self, teacher_id=None, student=None):
        if teacher_id:
            return User.objects.filter(id=teacher_id).first()

        request = self.context.get('request')
        request_user = getattr(request, 'user', None)
        if getattr(request_user, 'is_authenticated', False) and getattr(request_user, 'role', None) == 'teacher':
            return request_user

        if student and hasattr(student, 'finance_profile'):
            return student.finance_profile.teacher

        if student:
            return User.objects.filter(lessons_taught__student=student, lessons_taught__is_template=False).first()
        return None

    def _finance_payload_was_sent(self, values):
        return any(value is not serializers.empty for value in values)

    def _update_finance_profile(self, student, teacher, monthly_fee, due_day, finance_notes, contract_file, contract_name):
        if not teacher:
            return
        if not self._finance_payload_was_sent([monthly_fee, due_day, finance_notes, contract_file, contract_name]):
            return

        from payments.models import FinancialSettings
        from payments.views import generate_monthly_payments, upsert_finance_profile

        current_profile = getattr(student, 'finance_profile', None)
        teacher_settings = FinancialSettings.objects.filter(teacher=teacher).first()
        resolved_monthly_fee = (
            monthly_fee
            if monthly_fee is not serializers.empty
            else getattr(current_profile, 'monthly_fee', getattr(teacher_settings, 'default_monthly_fee', 0))
        )
        resolved_due_day = (
            due_day
            if due_day is not serializers.empty
            else getattr(current_profile, 'due_day', getattr(teacher_settings, 'default_due_day', 10))
        )
        resolved_notes = (
            finance_notes
            if finance_notes is not serializers.empty
            else getattr(current_profile, 'notes', '')
        )
        resolved_contract_file = None if contract_file is serializers.empty else contract_file
        resolved_contract_name = '' if contract_name is serializers.empty else contract_name

        profile = upsert_finance_profile(
            student=student,
            teacher=teacher,
            monthly_fee=resolved_monthly_fee,
            due_day=resolved_due_day,
            notes=resolved_notes,
            contract_file=resolved_contract_file,
            contract_name=resolved_contract_name,
        )
        generate_monthly_payments(profile)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        planned_count = attrs.get('planned_lessons_count', getattr(self.instance, 'planned_lessons_count', 0) if self.instance else 0) or 0
        completed_count = attrs.get('completed_lessons_count', getattr(self.instance, 'completed_lessons_count', 0) if self.instance else 0) or 0
        if planned_count and completed_count > planned_count:
            raise serializers.ValidationError({
                'completed_lessons_count': 'Aulas ja feitas nao podem passar da quantidade total de aulas.'
            })

        start_date = attrs.get('contract_start_date', getattr(self.instance, 'contract_start_date', None) if self.instance else None)
        end_date = attrs.get('contract_end_date', getattr(self.instance, 'contract_end_date', None) if self.instance else None)
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({
                'contract_end_date': 'A data final do contrato precisa ser depois da data inicial.'
            })
        return attrs

    def to_internal_value(self, data):
        return super().to_internal_value(coerce_schedules_payload(data))

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        remove_photo = validated_data.pop('remove_photo', False)
        schedule_day = validated_data.pop('schedule_day', None)
        schedule_time = validated_data.pop('schedule_time', None)
        schedules = validated_data.pop('schedules', None)
        teacher_id = validated_data.pop('teacher_id', None)
        monthly_fee = validated_data.pop('monthly_fee', serializers.empty)
        due_day = validated_data.pop('due_day', serializers.empty)
        finance_notes = validated_data.pop('finance_notes', serializers.empty)
        contract_file = validated_data.pop('contract_file', serializers.empty)
        contract_name = validated_data.pop('contract_name', serializers.empty)
        new_photo = validated_data.get('photo')
        old_photo = instance.photo
        old_photo_name = old_photo.name if old_photo else None
        old_photo_storage = old_photo.storage if old_photo else None
        should_sync_lessons = any(field in validated_data for field in ['planned_lessons_count', 'completed_lessons_count'])

        if remove_photo:
            validated_data['photo'] = None

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.save()

        current_photo_name = instance.photo.name if instance.photo else None
        if old_photo_name and old_photo_storage:
            should_delete_old_photo = remove_photo or (new_photo and old_photo_name != current_photo_name)
            if should_delete_old_photo:
                old_photo_storage.delete(old_photo_name)

        if instance.role == 'student':
            teacher = self._resolve_teacher(teacher_id=teacher_id, student=instance)
            self._update_finance_profile(
                instance,
                teacher,
                monthly_fee,
                due_day,
                finance_notes,
                contract_file,
                contract_name,
            )

            if schedules is None and schedule_day is not None and schedule_time is not None:
                schedules = [{'day': schedule_day, 'time': schedule_time, 'source': 'js'}]
            if schedules is not None:
                from lessons.scheduling import recurring_schedule_entries_match, replace_student_recurring_schedules
                if not recurring_schedule_entries_match(instance, teacher=teacher, schedule_entries=schedules):
                    try:
                        replace_student_recurring_schedules(instance, teacher=teacher, schedule_entries=schedules)
                    except ValueError as exc:
                        raise serializers.ValidationError({'schedule': str(exc)})
                    should_sync_lessons = True

            if should_sync_lessons:
                from lessons.scheduling import sync_student_lesson_plan
                try:
                    sync_student_lesson_plan(instance, teacher=teacher)
                except ValueError as exc:
                    raise serializers.ValidationError({'schedule': str(exc)})

        return instance

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    level = serializers.CharField(required=False, allow_blank=True)
    photo = serializers.FileField(required=False, allow_null=True)
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
            'id', 'name', 'email', 'role', 'password', 'level', 'photo', 'listening', 'speaking',
            'reading', 'writing',
            *STUDENT_TRACKING_FIELDS,
            'schedule_day', 'schedule_time', 'schedules', 'teacher_id',
            'monthly_fee', 'due_day', 'finance_notes', 'contract_file', 'contract_name'
        ]
        extra_kwargs = {
            'photo': {'write_only': True, 'required': False, 'allow_null': True},
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        planned_count = attrs.get('planned_lessons_count', 0) or 0
        completed_count = attrs.get('completed_lessons_count', 0) or 0
        if planned_count and completed_count > planned_count:
            raise serializers.ValidationError({
                'completed_lessons_count': 'Aulas ja feitas nao podem passar da quantidade total de aulas.'
            })

        start_date = attrs.get('contract_start_date')
        end_date = attrs.get('contract_end_date')
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({
                'contract_end_date': 'A data final do contrato precisa ser depois da data inicial.'
            })
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        photo = validated_data.pop('photo', None)
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
        for field in STUDENT_TRACKING_FIELDS:
            if field in validated_data:
                setattr(user, field, validated_data.get(field))
        if photo:
            user.photo = photo
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
        return super().to_internal_value(coerce_schedules_payload(data))

    def validate_contract_file(self, value):
        return validate_contract_upload(value)

    def validate_photo(self, value):
        return validate_photo_file(value)

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['name'] = user.name
        token['level'] = user.level
        return token
