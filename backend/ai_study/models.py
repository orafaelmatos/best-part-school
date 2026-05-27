import uuid
from django.conf import settings
from django.db import models
from lessons.models import Lesson

User = settings.AUTH_USER_MODEL


class AIStudySession(models.Model):
    MODE_CHOICES = (
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

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_study_sessions')
    mode = models.CharField(max_length=30, choices=MODE_CHOICES)
    theme = models.CharField(max_length=40, choices=THEME_CHOICES, default='casual')
    custom_topic = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    auto_context = models.JSONField(default=dict, blank=True)
    streaming_ready = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.student_id} - {self.mode} - {self.theme}"


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
    pronunciation_score = models.PositiveSmallIntegerField(default=0)
    fluency_score = models.PositiveSmallIntegerField(default=0)
    grammar_score = models.PositiveSmallIntegerField(default=0)
    vocabulary_score = models.PositiveSmallIntegerField(default=0)
    ai_feedback = models.TextField()
    corrected_sentence = models.TextField(blank=True)
    natural_sentence = models.TextField(blank=True)
    pronunciation_mistakes = models.JSONField(default=list, blank=True)
    grammar_explanation = models.TextField(blank=True)
    vocabulary_suggestions = models.JSONField(default=list, blank=True)
    native_alternative_sentence = models.TextField(blank=True)
    tts_audio_url = models.URLField(blank=True, null=True)
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
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(AIStudySession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPE_CHOICES, default='text')
    text = models.TextField(blank=True)
    audio = models.ForeignKey(SpeakingAudio, null=True, blank=True, on_delete=models.SET_NULL, related_name='conversation_messages')
    feedback = models.ForeignKey(SpeakingFeedback, null=True, blank=True, on_delete=models.SET_NULL, related_name='conversation_messages')
    metadata = models.JSONField(default=dict, blank=True)
    stream_state = models.CharField(max_length=30, default='complete')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
