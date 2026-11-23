from django.utils import timezone
from rest_framework import serializers
from lessons.models import Lesson
from .models import (
    AIContextLesson,
    AIConversationMessage,
    AIStudyRecommendation,
    AIStudySession,
    LessonReviewReport,
    PronunciationReview,
    SpeakingAudio,
    SpeakingFeedback,
    SpeakingSessionReport,
    WritingFeedback,
    WritingSessionReport,
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
    learning_feedback = serializers.SerializerMethodField()

    def get_learning_feedback(self, obj):
        from .speaking_feedback import public_details
        return public_details(obj)

    def to_representation(self, instance):
        from .speaking_feedback import sentence
        data = super().to_representation(instance)
        # Historical scores were inferred from transcripts, not audio evidence.
        for field in ['overall_score', 'pronunciation_score', 'fluency_score', 'intonation_score', 'clarity_score', 'grammar_score', 'vocabulary_score']:
            data[field] = None
        data['pronunciation_mistakes'] = []
        data['correct_words'] = []
        data['problem_words'] = []
        data['error_details'] = []
        if (instance.raw_response or {}).get('tts_text') != sentence(instance):
            data['tts_audio_url'] = None
        return data

    class Meta:
        model = SpeakingFeedback
        fields = [
            'id', 'session', 'audio', 'audio_url', 'transcript', 'overall_score',
            'estimated_level', 'pronunciation_score', 'fluency_score', 'intonation_score',
            'clarity_score', 'grammar_score', 'vocabulary_score', 'ai_feedback',
            'corrected_sentence', 'natural_sentence', 'correct_words', 'problem_words',
            'pronunciation_mistakes', 'error_details', 'grammar_explanation',
            'improvement_tips', 'practice_exercises', 'vocabulary_suggestions',
            'native_alternative_sentence', 'tts_audio_url', 'raw_response', 'reviews', 'created_at', 'learning_feedback'
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


class LessonReviewReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessonReviewReport
        fields = ['id', 'session', 'lesson', 'lesson_title', 'started_at', 'completed_at',
                  'duration_seconds', 'correct_count', 'incorrect_count', 'difficulties', 'activities', 'attempts']
        read_only_fields = fields


class AIStudySessionListSerializer(serializers.ModelSerializer):
    lesson_detail = serializers.SerializerMethodField()
    message_count = serializers.SerializerMethodField()
    review_report = serializers.SerializerMethodField()

    class Meta:
        model = AIStudySession
        fields = [
            'id', 'student', 'lesson', 'lesson_detail', 'mode', 'title', 'title_source', 'is_pinned', 'status',
            'message_count', 'guided_state', 'review_report', 'last_interaction_at', 'created_at', 'updated_at'
        ]
        read_only_fields = fields

    def get_review_report(self, obj):
        try:
            return LessonReviewReportSerializer(obj.review_report).data
        except LessonReviewReport.DoesNotExist:
            return None

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


class SpeakingSessionReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpeakingSessionReport
        fields = ['id', 'session', 'run_id', 'status', 'report', 'completed_at', 'created_at', 'updated_at']
        read_only_fields = fields


class SpeakingReportFilterSerializer(serializers.Serializer):
    student = serializers.UUIDField(required=False)
    session = serializers.UUIDField(required=False)


class InterpreterPlaybackRateField(serializers.FloatField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if value not in [0.6, 0.75, 0.8, 0.9, 1, 1.25]:
            raise serializers.ValidationError('Escolha uma velocidade disponível entre 0,6x e 1,25x.')
        return value


class InterpreterSettingsSerializer(serializers.Serializer):
    direction = serializers.ChoiceField(choices=['en_pt', 'pt_en', 'alternating'], default='en_pt')
    interpretation_mode = serializers.ChoiceField(choices=['consecutive', 'guided', 'simultaneous'], default='consecutive')
    session_style = serializers.ChoiceField(choices=['journey', 'free'], default='journey')
    duration_minutes = serializers.IntegerField(min_value=2, max_value=15, default=5)
    prepare_vocabulary = serializers.BooleanField(default=False)
    realistic = serializers.BooleanField(default=False)
    segment_duration_seconds = serializers.ChoiceField(choices=[30, 60, 90, 120], required=False)
    playback_speed = InterpreterPlaybackRateField(required=False)

    def validate(self, attrs):
        if attrs['interpretation_mode'] == 'simultaneous':
            attrs.setdefault('segment_duration_seconds', 60)
            attrs.setdefault('playback_speed', 1.0)
        else:
            attrs.pop('segment_duration_seconds', None)
            attrs.pop('playback_speed', None)
        return attrs


class WritingSessionReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = WritingSessionReport
        fields = ['id', 'session', 'run_id', 'status', 'report', 'completed_at', 'created_at', 'updated_at']
        read_only_fields = fields


class AIStudySessionCreateSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=['review', 'speaking', 'writing', 'listening'], default='review', required=False)
    lesson_id = serializers.UUIDField(required=False, allow_null=True)
    scenario_key = serializers.CharField(required=False, allow_blank=True, max_length=120)
    scenario_label = serializers.CharField(required=False, allow_blank=True, max_length=120)
    level = serializers.ChoiceField(choices=['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], required=False)
    interpreter_settings = InterpreterSettingsSerializer(required=False)

    def validate(self, attrs):
        mode = attrs.get('mode') or 'review'
        lesson_id = attrs.get('lesson_id')
        if 'interpreter_settings' in attrs and mode != 'listening':
            raise serializers.ValidationError({'interpreter_settings': 'Estas configurações são exclusivas do Intérprete IA.'})
        if mode == 'review' and not lesson_id:
            raise serializers.ValidationError({'lesson_id': 'lesson_id is required for review mode.'})
        if mode == 'listening':
            scenario_label = ' '.join(str(attrs.get('scenario_label') or '').split())
            scenario_key = ' '.join(str(attrs.get('scenario_key') or '').split())
            level = attrs.get('level')
            if not scenario_label:
                raise serializers.ValidationError({'scenario_label': 'scenario_label is required for listening mode.'})
            if not level:
                raise serializers.ValidationError({'level': 'level is required for listening mode.'})
            attrs['scenario_label'] = scenario_label
            attrs['scenario_key'] = scenario_key or 'custom'
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


class PinConversationSerializer(serializers.Serializer):
    pinned = serializers.BooleanField()


class TextMessageSerializer(serializers.Serializer):
    text = serializers.CharField(required=False, allow_blank=True)
    text_type = serializers.ChoiceField(
        choices=[choice[0] for choice in WritingFeedback.TEXT_TYPE_CHOICES],
        required=False,
        default='free',
    )
    guided_action = serializers.JSONField(required=False)
    review_revision = serializers.IntegerField(required=False, min_value=0)

    def validate_guided_action(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('guided_action must be an object.')
        action_type = ' '.join(str(value.get('action_type') or '').split())
        action_value = ' '.join(str(value.get('value') or '').split())
        label = ' '.join(str(value.get('label') or '').split())
        if not action_type or not action_value:
            raise serializers.ValidationError('guided_action requires action_type and value.')
        return {
            'action_type': action_type,
            'value': action_value,
            'label': label,
        }


class TextSelectionTranslationSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=280)

    def validate_text(self, value):
        cleaned = ' '.join(str(value or '').split())
        if len(cleaned) < 2:
            raise serializers.ValidationError('text must contain at least 2 characters.')
        return cleaned


class ListeningAnswerSerializer(serializers.Serializer):
    message_id = serializers.UUIDField()
    response_mode = serializers.ChoiceField(choices=['multiple_choice', 'transcription'])
    selected_option_id = serializers.CharField(required=False, allow_blank=True, max_length=80)
    answer_text = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate(self, attrs):
        response_mode = attrs.get('response_mode')
        selected_option_id = ' '.join(str(attrs.get('selected_option_id') or '').split())
        answer_text = ' '.join(str(attrs.get('answer_text') or '').split())
        if response_mode == 'multiple_choice' and not selected_option_id:
            raise serializers.ValidationError({'selected_option_id': 'selected_option_id is required for multiple_choice mode.'})
        if response_mode == 'transcription' and not answer_text:
            raise serializers.ValidationError({'answer_text': 'answer_text is required for transcription mode.'})
        attrs['selected_option_id'] = selected_option_id
        attrs['answer_text'] = answer_text
        return attrs


class SpeakingVocabularyAudioSerializer(serializers.Serializer):
    message_id = serializers.UUIDField()
    part = serializers.ChoiceField(choices=['word', 'example'])


class SpeakingSimulationAudioSerializer(serializers.Serializer):
    message_id = serializers.UUIDField()


class SpeakingUtteranceAudioSerializer(serializers.Serializer):
    message_id = serializers.UUIDField()
    part = serializers.ChoiceField(choices=['question', 'demonstration', 'model_answer'])


class SpeakingAudioUploadSerializer(serializers.Serializer):
    review_revision = serializers.IntegerField(required=False, min_value=0)
    request_id = serializers.UUIDField(required=False)
    prompt_id = serializers.CharField(required=False, max_length=64)
    retry_feedback_id = serializers.UUIDField(required=False)
    chunk_index = serializers.IntegerField(required=False, min_value=0, max_value=100)
    feedback_language = serializers.ChoiceField(choices=['pt-BR', 'en'], default='pt-BR')
    audio = serializers.FileField(error_messages={'empty': 'A gravação está vazia. Grave novamente ou responda por texto.'})
    duration_seconds = serializers.DecimalField(max_digits=8, decimal_places=2, required=False, min_value=0)

    def validate_audio(self, value):
        allowed_types = {'audio/webm', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/ogg'}
        content_type = getattr(value, 'content_type', '').split(';')[0].lower().strip()
        if content_type not in allowed_types:
            raise serializers.ValidationError('Envie áudio WebM, MP4/M4A, OGG ou WAV, ou responda por texto.')
        if not value.size:
            raise serializers.ValidationError('A gravação está vazia. Grave novamente ou responda por texto.')
        if value.size > 25 * 1024 * 1024:
            raise serializers.ValidationError('A gravação pode ter até 25 MB. Grave uma resposta mais curta ou responda por texto.')
        return value


class SimultaneousSegmentSerializer(serializers.Serializer):
    recording_start_seconds = serializers.FloatField(min_value=0, max_value=1200)
    recording_end_seconds = serializers.FloatField(min_value=0, max_value=1200)
    source_start_seconds = serializers.FloatField(min_value=0, max_value=600)
    source_end_seconds = serializers.FloatField(min_value=0, max_value=600)
    playback_rate = InterpreterPlaybackRateField()


class SimultaneousTimingSerializer(serializers.Serializer):
    version = serializers.ChoiceField(choices=[1])
    source_duration_seconds = serializers.FloatField(min_value=0.001, max_value=600)
    recording_duration_seconds = serializers.FloatField(min_value=0.001, max_value=1200)
    source_completed = serializers.BooleanField()
    segments = SimultaneousSegmentSerializer(many=True, allow_empty=False, max_length=200)

    def validate(self, attrs):
        import math
        values = [attrs['source_duration_seconds'], attrs['recording_duration_seconds']]
        for segment in attrs['segments']:
            values.extend(segment.values())
        if not all(math.isfinite(value) for value in values):
            raise serializers.ValidationError('Os tempos da gravação precisam ser números finitos.')
        if not attrs['source_completed']:
            raise serializers.ValidationError('Ouça a fala completa durante a gravação antes de enviar.')
        previous_source_end = previous_recording_end = 0
        for segment in attrs['segments']:
            start, end = segment['source_start_seconds'], segment['source_end_seconds']
            recording_start, recording_end = segment['recording_start_seconds'], segment['recording_end_seconds']
            if (abs(start - previous_source_end) > 0.25 or end <= start
                    or recording_start < previous_recording_end - 0.05 or recording_end <= recording_start
                    or end > attrs['source_duration_seconds'] + 0.25
                    or recording_end > attrs['recording_duration_seconds'] + 0.25):
                raise serializers.ValidationError('A linha do tempo da interpretação está inconsistente. Grave novamente.')
            expected_seconds = (end - start) / segment['playback_rate']
            if abs(recording_end - recording_start - expected_seconds) > max(0.75, expected_seconds * 0.1):
                raise serializers.ValidationError('A velocidade e os tempos de reprodução não correspondem.')
            previous_source_end, previous_recording_end = end, recording_end
        if abs(previous_source_end - attrs['source_duration_seconds']) > 0.25:
            raise serializers.ValidationError('A gravação precisa acompanhar a fala original até o fim.')
        return attrs


class InterpreterAnswerSerializer(SpeakingAudioUploadSerializer):
    request_id = serializers.UUIDField()
    message_id = serializers.UUIDField()
    response_mode = serializers.ChoiceField(choices=['voice', 'text', 'multiple_choice'])
    audio = serializers.FileField(required=False)
    answer_text = serializers.CharField(required=False, max_length=12000)
    selected_option_index = serializers.IntegerField(required=False, min_value=0, max_value=3)
    simultaneous_timing = serializers.JSONField(required=False)

    def validate_simultaneous_timing(self, value):
        if isinstance(value, str):
            import json
            try:
                value = json.loads(value)
            except (ValueError, TypeError):
                raise serializers.ValidationError('Não foi possível ler os tempos da gravação.')
        serializer = SimultaneousTimingSerializer(data=value)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    def validate(self, attrs):
        mode = attrs['response_mode']
        field = {'voice': 'audio', 'text': 'answer_text', 'multiple_choice': 'selected_option_index'}[mode]
        if field not in attrs:
            raise serializers.ValidationError({field: 'Envie sua interpretação antes de continuar.'})
        return attrs


class InterpreterRetrySerializer(serializers.Serializer):
    message_id = serializers.UUIDField()


class InterpreterAudioSerializer(serializers.Serializer):
    message_id = serializers.UUIDField(required=False)
    part = serializers.ChoiceField(choices=['original', 'suggested', 'vocabulary', 'example'])
    vocabulary_index = serializers.IntegerField(required=False, min_value=0, max_value=7)

    def validate(self, attrs):
        key = 'message_id' if attrs['part'] in ['original', 'suggested'] else 'vocabulary_index'
        if key not in attrs:
            raise serializers.ValidationError({key: 'Selecione o trecho ou a expressão.'})
        return attrs


class SpeakingFeedbackAudioSerializer(serializers.Serializer):
    chunk_index = serializers.IntegerField(required=False, min_value=0, max_value=100)
    full_sentence = serializers.BooleanField(default=False)


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
