from rest_framework import serializers
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db import transaction

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    recurring_schedules = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'role', 'level', 'listening', 'speaking', 'reading', 'writing', 'recurring_schedules']

    def get_recurring_schedules(self, obj):
        from lessons.serializers import StudentRecurringScheduleSerializer
        return StudentRecurringScheduleSerializer(obj.recurring_schedules.filter(active=True), many=True).data

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    level = serializers.CharField(required=False, allow_blank=True)
    schedule_day = serializers.IntegerField(required=False, write_only=True, allow_null=True)
    schedule_time = serializers.TimeField(required=False, write_only=True, allow_null=True)
    schedules = serializers.ListField(child=serializers.DictField(), required=False, write_only=True)
    teacher_id = serializers.UUIDField(required=False, write_only=True, allow_null=True)

    class Meta:
        model = User
        fields = ['id', 'name', 'email', 'role', 'password', 'level', 'listening', 'speaking', 'reading', 'writing', 'schedule_day', 'schedule_time', 'schedules', 'teacher_id']

    @transaction.atomic
    def create(self, validated_data):
        schedule_day = validated_data.pop('schedule_day', None)
        schedule_time = validated_data.pop('schedule_time', None)
        schedules = validated_data.pop('schedules', None)
        teacher_id = validated_data.pop('teacher_id', None)

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
            teacher = User.objects.filter(id=teacher_id).first() if teacher_id else None
            if schedules is None and schedule_day is not None and schedule_time is not None:
                schedules = [{'day': schedule_day, 'time': schedule_time, 'source': 'js'}]
            try:
                create_student_schedule_and_lessons(user, teacher=teacher, schedule_entries=schedules or [])
            except ValueError as exc:
                raise serializers.ValidationError({'schedule': str(exc)})

        return user

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['name'] = user.name
        token['level'] = user.level
        return token
