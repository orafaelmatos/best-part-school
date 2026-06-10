import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone
from lessons.models import Lesson

User = settings.AUTH_USER_MODEL


class AIStudySession(models.Model):
    MODE_CHOICES = (
        ('review', 'Lesson Review'),
        ('speaking', 'Speaking'),
        ('listening', 'Listening'),
        ('writing', 'Writing'),
        ('weak_points', 'Weak points'),
    )
    THEME_CHOICES = (
        ('travel', 'Travel'),
        ('work', 'Work'),
        ('interview', 'Interview'),
        ('casual', 'Casual conversation'),
        ('restaurant', 'Restaurant'),
        ('airport', 'Airport'),
        ('business', 'Business English'),
        ('minhas_aulas', 'Minhas Aulas'),
        ('custom', 'Custom'),
    )
    STATUS_CHOICES = (
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('archived', 'Archived'),
    )
    TITLE_SOURCE_CHOICES = (
        ('auto', 'Auto'),
        ('manual', 'Manual'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_study_sessions')
    lesson = models.ForeignKey(Lesson, null=True, blank=True, on_delete=models.SET_NULL, related_name='ai_study_sessions')
    mode = models.CharField(max_length=30, choices=MODE_CHOICES)
    theme = models.CharField(max_length=40, choices=THEME_CHOICES, default='casual')
    custom_topic = models.CharField(max_length=255, blank=True, null=True)
    title = models.CharField(max_length=255, blank=True)
    title_source = models.CharField(max_length=20, choices=TITLE_SOURCE_CHOICES, default='auto')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    auto_context = models.JSONField(default=dict, blank=True)
    streaming_ready = models.BooleanField(default=True)
    last_interaction_at = models.DateTimeField(default=timezone.now, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-last_interaction_at', '-created_at']

    def __str__(self):
        return self.title or f"{self.student_id} - {self.mode} - {self.theme}"


class AIContextLesson(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AIStudySession, on_delete=models.CASCADE, related_name='context_lessons')
    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name='ai_study_contexts')
    snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('session', 'lesson')
        ordering = ['-created_at']


class SpeakingAudio(models.Model):
    STATUS_CHOICES = (
        ('uploaded', 'Uploaded'),
        ('transcribed', 'Transcribed'),
        ('analyzed', 'Analyzed'),
        ('failed', 'Failed'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AIStudySession, on_delete=models.CASCADE, related_name='speaking_audios')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_study_speaking_audios')
    audio = models.FileField(upload_to='ai_study/speaking_audio/')
    mime_type = models.CharField(max_length=100)
    duration_seconds = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploaded')
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class SpeakingFeedback(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AIStudySession, on_delete=models.CASCADE, related_name='speaking_feedbacks')
    audio = models.OneToOneField(SpeakingAudio, on_delete=models.CASCADE, related_name='feedback')
    transcript = models.TextField()
    overall_score = models.PositiveSmallIntegerField(default=0)
    estimated_level = models.CharField(max_length=10, blank=True)
    pronunciation_score = models.PositiveSmallIntegerField(default=0)
    fluency_score = models.PositiveSmallIntegerField(default=0)
    intonation_score = models.PositiveSmallIntegerField(default=0)
    clarity_score = models.PositiveSmallIntegerField(default=0)
    grammar_score = models.PositiveSmallIntegerField(default=0)
    vocabulary_score = models.PositiveSmallIntegerField(default=0)
    ai_feedback = models.TextField()
    corrected_sentence = models.TextField(blank=True)
    natural_sentence = models.TextField(blank=True)
    correct_words = models.JSONField(default=list, blank=True)
    problem_words = models.JSONField(default=list, blank=True)
    pronunciation_mistakes = models.JSONField(default=list, blank=True)
    error_details = models.JSONField(default=list, blank=True)
    grammar_explanation = models.TextField(blank=True)
    improvement_tips = models.JSONField(default=list, blank=True)
    practice_exercises = models.JSONField(default=list, blank=True)
    vocabulary_suggestions = models.JSONField(default=list, blank=True)
    native_alternative_sentence = models.TextField(blank=True)
    tts_audio_url = models.URLField(blank=True, null=True)
    raw_response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class WritingFeedback(models.Model):
    TEXT_TYPE_CHOICES = (
        ('free', 'Livre'),
        ('essay', 'Redação'),
        ('email', 'Email'),
        ('self_intro', 'Apresentação pessoal'),
        ('storytelling', 'Storytelling'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AIStudySession, on_delete=models.CASCADE, related_name='writing_feedbacks')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_study_writing_feedbacks')
    text_type = models.CharField(max_length=30, choices=TEXT_TYPE_CHOICES, default='free')
    original_text = models.TextField()
    corrected_text = models.TextField(blank=True)
    estimated_level = models.CharField(max_length=10, blank=True)
    writing_score = models.PositiveSmallIntegerField(default=0)
    sub_scores = models.JSONField(default=dict, blank=True)
    general_feedback = models.TextField(blank=True)
    level_progress_feedback = models.TextField(blank=True)
    strengths = models.JSONField(default=list, blank=True)
    error_explanations = models.JSONField(default=list, blank=True)
    improvement_tips = models.JSONField(default=list, blank=True)
    rewrites = models.JSONField(default=dict, blank=True)
    exercises = models.JSONField(default=list, blank=True)
    grammar_breakdown = models.JSONField(default=list, blank=True)
    vocabulary_flashcards = models.JSONField(default=list, blank=True)
    raw_response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class PronunciationReview(models.Model):
    DIFFICULTY_CHOICES = (
        ('easy', 'Easy'),
        ('medium', 'Medium'),
        ('hard', 'Hard'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    feedback = models.ForeignKey(SpeakingFeedback, on_delete=models.CASCADE, related_name='reviews')
    target_sentence = models.TextField()
    reviewed_at = models.DateTimeField(null=True, blank=True)
    difficulty_level = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES, default='medium')
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class AIConversationMessage(models.Model):
    ROLE_CHOICES = (
        ('system', 'System'),
        ('user', 'User'),
        ('assistant', 'Assistant'),
    )
    CONTENT_TYPE_CHOICES = (
        ('text', 'Text'),
        ('audio', 'Audio'),
        ('feedback', 'Feedback'),
        ('writing_feedback', 'Writing feedback'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AIStudySession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPE_CHOICES, default='text')
    text = models.TextField(blank=True)
    audio = models.ForeignKey(SpeakingAudio, null=True, blank=True, on_delete=models.SET_NULL, related_name='conversation_messages')
    feedback = models.ForeignKey(SpeakingFeedback, null=True, blank=True, on_delete=models.SET_NULL, related_name='conversation_messages')
    writing_feedback = models.ForeignKey(WritingFeedback, null=True, blank=True, on_delete=models.SET_NULL, related_name='conversation_messages')
    metadata = models.JSONField(default=dict, blank=True)
    stream_state = models.CharField(max_length=30, default='complete')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class AIStudyRecommendation(models.Model):
    MODE_CHOICES = (
        ('review', 'Lesson Review'),
        ('speaking', 'Speaking'),
        ('writing', 'Writing'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.OneToOneField(User, on_delete=models.CASCADE, related_name='ai_study_recommendation')
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_study_recommendations_made')
    mode = models.CharField(max_length=20, choices=MODE_CHOICES)
    lesson = models.ForeignKey(Lesson, null=True, blank=True, on_delete=models.SET_NULL, related_name='ai_study_recommendations')
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
