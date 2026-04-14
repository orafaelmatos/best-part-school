import uuid
from django.db import models
from django.conf import settings

User = settings.AUTH_USER_MODEL

class Lesson(models.Model):
    LEVEL_CHOICES = (
        ('A1', 'A1'), ('A2', 'A2'), ('B1', 'B1'),
        ('B2', 'B2'), ('C1', 'C1'), ('C2', 'C2'),
    )
    STATUS_CHOICES = (
        ('scheduled', 'Scheduled'),
        ('completed', 'Completed'),
        ('canceled', 'Canceled'),
        ('rescheduled', 'Rescheduled'),
        ('missed', 'Missed'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    level = models.CharField(max_length=2, choices=LEVEL_CHOICES)
    date = models.DateTimeField()
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='lessons_taught')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='lessons_attended')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    notes = models.TextField(blank=True, null=True)
    meeting_url = models.URLField(blank=True, null=True)
    recording_url = models.URLField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} - {self.date}"

class NewWord(models.Model):
    STATUS_CHOICES = (
        ('hard', 'Difícil (Não lembrei)'),
        ('medium', 'Médio (Mais ou menos)'),
        ('easy', 'Fácil (Lembrei)'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    word = models.CharField(max_length=255)
    meaning = models.TextField()
    level = models.CharField(max_length=2, choices=Lesson.LEVEL_CHOICES)
    lesson = models.ForeignKey(Lesson, related_name='new_words', on_delete=models.CASCADE)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, blank=True, null=True)

    def __str__(self):
        return self.word

class Attachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(upload_to='lesson_attachments/')
    lesson = models.ForeignKey(Lesson, related_name='attachments', on_delete=models.CASCADE)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.file.name
