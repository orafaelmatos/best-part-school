import uuid
from django.db import models
from django.conf import settings

User = settings.AUTH_USER_MODEL

WEEKDAY_CHOICES = (
    (0, 'Monday'),
    (1, 'Tuesday'),
    (2, 'Wednesday'),
    (3, 'Thursday'),
    (4, 'Friday'),
    (5, 'Saturday'),
    (6, 'Sunday'),
)

class Lesson(models.Model):
    LEVEL_CHOICES = (
        ('A1/A2', 'A1 / A2'), ('A1', 'A1'), ('A2', 'A2'), ('B1', 'B1'),
        ('B2', 'B2'), ('C1', 'C1'), ('C2', 'C2'), ('ALL LEVELS', 'All Levels'),
    )
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('scheduled', 'Scheduled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('canceled', 'Canceled'),
        ('rescheduled', 'Rescheduled'),
        ('missed', 'Missed'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES)
    date = models.DateTimeField(null=True, blank=True)
    teacher = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='lessons_taught')
    student = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='lessons_attended')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    notes = models.TextField(blank=True, null=True)
    meeting_url = models.URLField(blank=True, null=True)
    recording_url = models.URLField(blank=True, null=True)
    is_template = models.BooleanField(default=False)
    template = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='scheduled_lessons'
    )
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} - {self.date}"

class StudentRecurringSchedule(models.Model):
    DAY_CHOICES = WEEKDAY_CHOICES

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recurring_schedules')
    teacher = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='student_recurring_schedules')
    day_of_week = models.IntegerField(choices=DAY_CHOICES)
    start_time = models.TimeField()
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('student', 'teacher', 'day_of_week', 'start_time')
        ordering = ['day_of_week', 'start_time']

    def __str__(self):
        return f"{self.student_id} - {self.get_day_of_week_display()} {self.start_time}"

class TeacherAvailability(models.Model):
    DAY_CHOICES = WEEKDAY_CHOICES
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='availabilities')
    day_of_week = models.IntegerField(choices=DAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        unique_together = ('teacher', 'day_of_week', 'start_time')

    def __str__(self):
        return f"{self.teacher.email} - {self.get_day_of_week_display()} ({self.start_time} to {self.end_time})"

class TeacherBlockedDate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='blocked_dates')
    date = models.DateField()
    reason = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        unique_together = ('teacher', 'date')

    def __str__(self):
        return f"{self.teacher.email} - Blocked on {self.date}"

class NewWord(models.Model):
    STATUS_CHOICES = (
        ('hard', 'Difícil (Não lembrei)'),
        ('medium', 'Médio (Mais ou menos)'),
        ('easy', 'Fácil (Lembrei)'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    word = models.CharField(max_length=255)
    meaning = models.TextField()
    level = models.CharField(max_length=10, choices=Lesson.LEVEL_CHOICES)
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
