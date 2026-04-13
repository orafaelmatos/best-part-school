from rest_framework import serializers
from .models import Lesson, NewWord, Attachment

class NewWordSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewWord
        fields = ['id', 'word', 'meaning', 'level']

class AttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.FileField(source='file', read_only=True)
    
    class Meta:
        model = Attachment
        fields = ['id', 'file_url']

class LessonSerializer(serializers.ModelSerializer):
    new_words = NewWordSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    
    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'level', 'date', 'status', 'notes', 
            'recording_url', 'new_words', 'attachments', 
            'teacher', 'student'
        ]
