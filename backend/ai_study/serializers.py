from rest_framework import serializers
from lessons.models import Lesson
from .models import (
    AIContextLesson,
    AIConversationMessage,
    AIStudySession,
    PronunciationReview,
    SpeakingAudio,
    SpeakingFeedback,
)


class AIContextLessonSerializer(serializers.ModelSerializer):
    lesson_title = serializers.CharField(source='lesson.title', read_only=True)
    lesson_date = serializers.DateTimeField(source='lesson.date', read_only=True)
    teacher_name = serializers.CharField(source='lesson.teacher.name', read_only=True)

    class Meta:
        model = AIContextLesson
        fields = ['id', 'lesson', 'lesson_title', 'lesson_date', 'teacher_name', 'snapshot', 'created_at']
        read_only_fields = ['snapshot', 'created_at']


class SpeakingAudioSerializer(serializers.ModelSerializer):
    audio_url = serializers.FileField(source='audio', read_only=True)

    class Meta:
        model = SpeakingAudio
        fields = ['id', 'session', 'audio', 'audio_url', 'mime_type', 'duration_seconds', 'status', 'error_message', 'created_at']
        read_only_fields = ['session', 'mime_type', 'status', 'error_message', 'created_at']


class PronunciationReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = PronunciationReview
        fields = ['id', 'feedback', 'target_sentence', 'reviewed_at', 'difficulty_level', 'notes', 'created_at']
        read_only_fields = ['created_at']


class SpeakingFeedbackSerializer(serializers.ModelSerializer):
    reviews = PronunciationReviewSerializer(many=True, read_only=True)
    audio_url = serializers.FileField(source='audio.audio', read_only=True)

    class Meta:
        model = SpeakingFeedback
        fields = [
            'id', 'session', 'audio', 'audio_url', 'transcript', 'pronunciation_score',
            'fluency_score', 'grammar_score', 'vocabulary_score', 'ai_feedback',
            'corrected_sentence', 'natural_sentence', 'pronunciation_mistakes',
            'grammar_explanation', 'vocabulary_suggestions', 'native_alternative_sentence',
            'tts_audio_url', 'raw_response', 'reviews', 'created_at'
        ]
        read_only_fields = fields


class AIConversationMessageSerializer(serializers.ModelSerializer):
    feedback_detail = SpeakingFeedbackSerializer(source='feedback', read_only=True)
    audio_url = serializers.FileField(source='audio.audio', read_only=True)

    class Meta:
        model = AIConversationMessage
        fields = [
            'id', 'session', 'role', 'content_type', 'text', 'audio', 'audio_url',
            'feedback', 'feedback_detail', 'metadata', 'stream_state', 'created_at'
        ]
        read_only_fields = ['created_at']


class AIStudySessionSerializer(serializers.ModelSerializer):
    context_lessons = AIContextLessonSerializer(many=True, read_only=True)
    messages = AIConversationMessageSerializer(many=True, read_only=True)

    class Meta:
        model = AIStudySession
        fields = [
            'id', 'student', 'mode', 'theme', 'custom_topic', 'status',
            'auto_context', 'streaming_ready', 'context_lessons', 'messages',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['student', 'auto_context', 'context_lessons', 'messages', 'created_at', 'updated_at']

    def validate_theme(self, value):
        if value == 'custom':
            custom_topic = self.initial_data.get('custom_topic')
            if not custom_topic:
                raise serializers.ValidationError('custom_topic is required for custom theme.')
        return value


class LessonContextOptionSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    vocabulary_count = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = ['id', 'title', 'level', 'date', 'status', 'teacher', 'teacher_name', 'category', 'tags', 'vocabulary_count']

    def get_category(self, obj):
        return obj.level

    def get_tags(self, obj):
        tags = [obj.level]
        if obj.status:
            tags.append(obj.status)
        if obj.title:
            tags.extend([part.strip().lower() for part in obj.title.split()[:4]])
        return list(dict.fromkeys(tags))

    def get_vocabulary_count(self, obj):
        return obj.new_words.count()


class SetContextLessonsSerializer(serializers.Serializer):
    lesson_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=True)


class TextMessageSerializer(serializers.Serializer):
    text = serializers.CharField(required=False, allow_blank=True)


class SpeakingAudioUploadSerializer(serializers.Serializer):
    audio = serializers.FileField()
    duration_seconds = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)

    def validate_audio(self, value):
        allowed_types = {'audio/webm', 'audio/wav', 'audio/wave', 'audio/x-wav'}
        content_type = getattr(value, 'content_type', '')
        if content_type not in allowed_types:
            raise serializers.ValidationError('Only .webm or .wav audio uploads are supported.')
        if value.size > 25 * 1024 * 1024:
            raise serializers.ValidationError('Audio file must be 25 MB or smaller.')
        return value
