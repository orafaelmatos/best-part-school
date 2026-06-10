from django.utils import timezone
from rest_framework import serializers
from lessons.models import Lesson
from .models import (
    AIContextLesson,
    AIConversationMessage,
    AIStudyRecommendation,
    AIStudySession,
    PronunciationReview,
    SpeakingAudio,
    SpeakingFeedback,
    WritingFeedback,
)


def _prefetched_related_items(obj, related_name):
    cached = getattr(obj, '_prefetched_objects_cache', {}).get(related_name)
    if cached is not None:
        return cached
    return list(getattr(obj, related_name).all())


def _resolved_session_lesson(session):
    if session.lesson_id:
        return session.lesson
    cached_contexts = getattr(session, '_prefetched_objects_cache', {}).get('context_lessons')
    if cached_contexts:
        first_context = cached_contexts[0] if cached_contexts else None
        return getattr(first_context, 'lesson', None) if first_context else None
    first_context = session.context_lessons.select_related('lesson').first()
    return first_context.lesson if first_context else None


class LessonReferenceSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)

    class Meta:
        model = Lesson
        fields = ['id', 'title', 'level', 'date', 'status', 'teacher_name']


class AIContextLessonSerializer(serializers.ModelSerializer):
    lesson_title = serializers.CharField(source='lesson.title', read_only=True)
    lesson_date = serializers.DateTimeField(source='lesson.date', read_only=True)
    teacher_name = serializers.CharField(source='lesson.teacher.name', read_only=True)
    lesson_detail = LessonReferenceSerializer(source='lesson', read_only=True)

    class Meta:
        model = AIContextLesson
        fields = ['id', 'lesson', 'lesson_title', 'lesson_date', 'teacher_name', 'lesson_detail', 'snapshot', 'created_at']
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
            'id', 'session', 'audio', 'audio_url', 'transcript', 'overall_score',
            'estimated_level', 'pronunciation_score', 'fluency_score', 'intonation_score',
            'clarity_score', 'grammar_score', 'vocabulary_score', 'ai_feedback',
            'corrected_sentence', 'natural_sentence', 'correct_words', 'problem_words',
            'pronunciation_mistakes', 'error_details', 'grammar_explanation',
            'improvement_tips', 'practice_exercises', 'vocabulary_suggestions',
            'native_alternative_sentence', 'tts_audio_url', 'raw_response', 'reviews', 'created_at'
        ]
        read_only_fields = fields


class WritingFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = WritingFeedback
        fields = [
            'id', 'session', 'student', 'text_type', 'original_text', 'corrected_text',
            'estimated_level', 'writing_score', 'sub_scores', 'general_feedback',
            'level_progress_feedback', 'strengths', 'error_explanations',
            'improvement_tips', 'rewrites', 'exercises', 'grammar_breakdown',
            'vocabulary_flashcards', 'raw_response', 'created_at',
        ]
        read_only_fields = fields


class AIConversationMessageSerializer(serializers.ModelSerializer):
    feedback_detail = SpeakingFeedbackSerializer(source='feedback', read_only=True)
    writing_feedback_detail = WritingFeedbackSerializer(source='writing_feedback', read_only=True)
    audio_detail = SpeakingAudioSerializer(source='audio', read_only=True)
    audio_url = serializers.FileField(source='audio.audio', read_only=True)

    class Meta:
        model = AIConversationMessage
        fields = [
            'id', 'session', 'role', 'content_type', 'text', 'audio', 'audio_url',
            'audio_detail', 'feedback', 'feedback_detail', 'writing_feedback',
            'writing_feedback_detail', 'metadata', 'stream_state', 'created_at'
        ]
        read_only_fields = ['created_at']


class AIStudySessionListSerializer(serializers.ModelSerializer):
    lesson_detail = serializers.SerializerMethodField()
    message_count = serializers.SerializerMethodField()

    class Meta:
        model = AIStudySession
        fields = [
            'id', 'student', 'lesson', 'lesson_detail', 'mode', 'title', 'title_source', 'status',
            'message_count', 'last_interaction_at', 'created_at', 'updated_at'
        ]
        read_only_fields = fields

    def get_lesson_detail(self, obj):
        lesson = _resolved_session_lesson(obj)
        if not lesson:
            return None
        return LessonReferenceSerializer(lesson).data

    def get_message_count(self, obj):
        annotated_count = getattr(obj, 'message_count', None)
        if annotated_count is not None:
            return annotated_count
        return obj.messages.count()


class AIStudySessionDetailSerializer(AIStudySessionListSerializer):
    context_lessons = AIContextLessonSerializer(many=True, read_only=True)
    messages = AIConversationMessageSerializer(many=True, read_only=True)

    class Meta(AIStudySessionListSerializer.Meta):
        fields = AIStudySessionListSerializer.Meta.fields + [
            'mode', 'theme', 'custom_topic', 'auto_context', 'streaming_ready',
            'context_lessons', 'messages',
        ]
        read_only_fields = fields


class AIStudySessionCreateSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=['review', 'speaking', 'writing'], default='review', required=False)
    lesson_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        mode = attrs.get('mode') or 'review'
        lesson_id = attrs.get('lesson_id')
        if mode == 'review' and not lesson_id:
            raise serializers.ValidationError({'lesson_id': 'lesson_id is required for review mode.'})
        return attrs


class LessonContextOptionSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    vocabulary_count = serializers.SerializerMethodField()
    learned_words_count = serializers.SerializerMethodField()
    flashcard_count = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()
    summary_short = serializers.SerializerMethodField()
    last_studied_at = serializers.SerializerMethodField()
    has_pending_activities = serializers.SerializerMethodField()
    is_recent = serializers.SerializerMethodField()
    is_recommended_review = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'level', 'date', 'status', 'teacher', 'teacher_name', 'category', 'tags',
            'vocabulary_count', 'learned_words_count', 'flashcard_count', 'summary_short',
            'last_studied_at', 'has_pending_activities', 'is_recent', 'is_recommended_review',
        ]

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
        return self.get_learned_words_count(obj)

    def get_learned_words_count(self, obj):
        annotated_count = getattr(obj, 'new_words_count', None)
        if annotated_count is not None:
            return annotated_count
        return len(_prefetched_related_items(obj, 'new_words'))

    def get_flashcard_count(self, obj):
        annotated_count = getattr(obj, 'flashcard_count', None)
        if annotated_count is not None:
            return annotated_count
        return len(_prefetched_related_items(obj, 'vocabulary_cards'))

    def get_summary_short(self, obj):
        summary = getattr(obj, 'summary', None)
        pieces = []
        if summary:
            raw_summary = summary.raw_ai_response if isinstance(summary.raw_ai_response, dict) else {}
            pieces.extend([
                raw_summary.get('summary', ''),
                summary.summary or '',
                summary.observations or '',
            ])
        pieces.append(obj.notes or '')
        for piece in pieces:
            cleaned = ' '.join(str(piece or '').split())
            if cleaned:
                return f"{cleaned[:165].rstrip()}..." if len(cleaned) > 165 else cleaned
        return 'Sem resumo salvo para esta aula.'

    def get_last_studied_at(self, obj):
        annotated_value = getattr(obj, 'last_ai_interaction_at', None)
        if annotated_value:
            return annotated_value
        cached_sessions = getattr(obj, '_prefetched_objects_cache', {}).get('ai_study_sessions')
        if cached_sessions:
            ordered = sorted(
                [session.last_interaction_at for session in cached_sessions if session.last_interaction_at],
                reverse=True,
            )
            return ordered[0] if ordered else None
        latest_session = obj.ai_study_sessions.order_by('-last_interaction_at').first()
        return latest_session.last_interaction_at if latest_session else None

    def get_has_pending_activities(self, obj):
        annotated_count = getattr(obj, 'pending_homework_count', None)
        if annotated_count is not None:
            return annotated_count > 0
        return any(item.status in ['pending', 'sent'] for item in _prefetched_related_items(obj, 'homework_items'))

    def get_is_recent(self, obj):
        return str(obj.id) == str(self.context.get('recent_lesson_id') or '')

    def get_is_recommended_review(self, obj):
        if self.get_has_pending_activities(obj):
            return False
        if self.get_is_recent(obj):
            return False
        last_studied_at = self.get_last_studied_at(obj)
        lesson_date = obj.date or timezone.now()
        days_since_lesson = (timezone.now() - lesson_date).days
        if days_since_lesson < 3:
            return False
        if last_studied_at:
            return (timezone.now() - last_studied_at).days >= 7
        return self.get_flashcard_count(obj) > 0 or self.get_learned_words_count(obj) > 0


class SetContextLessonsSerializer(serializers.Serializer):
    lesson_id = serializers.UUIDField(required=False)
    lesson_ids = serializers.ListField(child=serializers.UUIDField(), required=False, allow_empty=False)

    def validate(self, attrs):
        lesson_id = attrs.get('lesson_id')
        lesson_ids = attrs.get('lesson_ids') or []
        selected_ids = [item for item in [lesson_id, *lesson_ids] if item]
        if len(selected_ids) != 1:
            raise serializers.ValidationError('Exactly one lesson must be selected.')
        attrs['selected_lesson_id'] = selected_ids[0]
        return attrs


class RenameConversationSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)

    def validate_title(self, value):
        cleaned = ' '.join(value.split())
        if not cleaned:
            raise serializers.ValidationError('title is required.')
        return cleaned


class TextMessageSerializer(serializers.Serializer):
    text = serializers.CharField(required=False, allow_blank=True)
    text_type = serializers.ChoiceField(
        choices=[choice[0] for choice in WritingFeedback.TEXT_TYPE_CHOICES],
        required=False,
        default='free',
    )


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


class AIStudyRecommendationSerializer(serializers.ModelSerializer):
    lesson_detail = LessonReferenceSerializer(source='lesson', read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)

    class Meta:
        model = AIStudyRecommendation
        fields = [
            'id', 'student', 'teacher', 'teacher_name', 'mode', 'lesson', 'lesson_detail',
            'note', 'created_at', 'updated_at',
        ]
        read_only_fields = ['teacher', 'teacher_name', 'created_at', 'updated_at']


AIStudySessionSerializer = AIStudySessionDetailSerializer
