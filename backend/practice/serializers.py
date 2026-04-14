from rest_framework import serializers
from .models import PracticeSession, Message

class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'role', 'text', 'audio_url', 'corrections', 'created_at']

class PracticeSessionSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = PracticeSession
        fields = ['id', 'user', 'lesson', 'mode', 'scenario', 'status', 'created_at', 'messages']
        read_only_fields = ['user', 'messages']
