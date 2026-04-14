import uuid
from django.db import models
from django.conf import settings
from lessons.models import Lesson

User = settings.AUTH_USER_MODEL

class PracticeSession(models.Model):
    MODE_CHOICES = (
        ('listening', 'Listening'),
        ('speaking', 'Speaking'),
        ('writing', 'Writing'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='practice_sessions')
    lesson = models.ForeignKey(Lesson, null=True, blank=True, on_delete=models.SET_NULL)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES)
    scenario = models.CharField(max_length=100) # e.g. "Hotel", "Restaurant"
    status = models.CharField(max_length=20, default='active') # active, completed
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.email} - {self.mode} - {self.scenario}"

class Message(models.Model):
    ROLE_CHOICES = (('system', 'System'), ('user', 'User'), ('assistant', 'Assistant'))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(PracticeSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    text = models.TextField()
    audio_url = models.URLField(blank=True, null=True) # TTS or STT audio ref
    corrections = models.JSONField(blank=True, null=True) # Structural corrections from AI
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']