from rest_framework import serializers
from .models import Lesson, NewWord, Attachment, TeacherAvailability, TeacherBlockedDate, StudentRecurringSchedule

class StudentRecurringScheduleSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)

    class Meta:
        model = StudentRecurringSchedule
        fields = ['id', 'student', 'student_name', 'teacher', 'teacher_name', 'day_of_week', 'start_time', 'active']

class TeacherAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherAvailability
        fields = ['id', 'teacher', 'day_of_week', 'start_time', 'end_time']

class TeacherBlockedDateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherBlockedDate
        fields = ['id', 'teacher', 'date', 'reason']

class NewWordSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewWord
        fields = ['id', 'word', 'meaning', 'level', 'status']

class AttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.FileField(source='file', read_only=True)
    
    class Meta:
        model = Attachment
        fields = ['id', 'file', 'file_url', 'lesson']

class LessonSerializer(serializers.ModelSerializer):
    new_words = NewWordSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    student_name = serializers.CharField(source='student.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    template_title = serializers.CharField(source='template.title', read_only=True)
    
    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'level', 'date', 'status', 'notes', 
            'meeting_url', 'recording_url', 'new_words', 'attachments', 
            'teacher', 'student', 'student_name', 'teacher_name', 'is_template',
            'template', 'template_title', 'order'
        ]
