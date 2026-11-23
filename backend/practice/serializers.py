from rest_framework import serializers
from bps_core.media import signed_media_url
from .models import PracticeSession, Message

class MessageSerializer(serializers.ModelSerializer):
    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['audio_url'] = signed_media_url(data['audio_url'])
        return data

    class Meta:
        model = Message
        fields = ['id', 'role', 'text', 'audio_url', 'corrections', 'created_at']

class PracticeSessionSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    def validate_lesson(self, lesson):
        if lesson:
            from lessons.permissions import visible_lessons
            if not visible_lessons(self.context['request'].user).filter(pk=lesson.pk).exists():
                raise serializers.ValidationError('Aula fora do seu vínculo.')
        return lesson

    class Meta:
        model = PracticeSession
        fields = ['id', 'user', 'lesson', 'mode', 'scenario', 'status', 'created_at', 'messages']
        read_only_fields = ['user', 'messages']
