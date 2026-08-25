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

class VocabularyCategory(models.Model):
    DEFAULT_SLUGS = (
        ('grammar', 'Grammar'),
        ('vocabulary', 'Vocabulary'),
        ('expressions', 'Expressions'),
        ('phrasal-verbs', 'Phrasal Verbs'),
        ('pronunciation', 'Pronunciation'),
        ('business-english', 'Business English'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140)
    owner = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='vocabulary_categories')
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['is_default', 'name']
        unique_together = ('owner', 'slug')
        indexes = [
            models.Index(fields=['owner', 'slug']),
            models.Index(fields=['is_default', 'slug']),
        ]

    def __str__(self):
        return self.name

class VocabularyCard(models.Model):
    SOURCE_CHOICES = (
        ('teacher', 'Teacher'),
        ('student', 'Student'),
        ('lesson', 'Lesson'),
    )
    DIFFICULTY_CHOICES = (
        ('new', 'New'),
        ('weak', 'Weak'),
        ('learning', 'Learning'),
        ('stable', 'Stable'),
        ('mastered', 'Mastered'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='vocabulary_cards')
    teacher = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='vocabulary_cards_created')
    lesson = models.ForeignKey(Lesson, null=True, blank=True, on_delete=models.SET_NULL, related_name='vocabulary_cards')
    source_new_word = models.ForeignKey(NewWord, null=True, blank=True, on_delete=models.SET_NULL, related_name='vocabulary_cards')
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='student')
    word = models.CharField(max_length=255)
    translation = models.TextField()
    explanation = models.TextField(blank=True)
    example_sentence = models.TextField(blank=True)
    pronunciation = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    category = models.ForeignKey(VocabularyCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name='cards')
    custom_category = models.CharField(max_length=120, blank=True)
    audio = models.FileField(upload_to='vocabulary/audio/', blank=True, null=True)
    audio_url = models.URLField(blank=True)
    favorite = models.BooleanField(default=False)
    archived = models.BooleanField(default=False)
    mastered = models.BooleanField(default=False)
    easiness_factor = models.FloatField(default=2.5)
    interval_days = models.PositiveIntegerField(default=0)
    repetition_count = models.PositiveIntegerField(default=0)
    failure_count = models.PositiveIntegerField(default=0)
    confidence_level = models.PositiveSmallIntegerField(default=0)
    difficulty_level = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES, default='new')
    last_reviewed_at = models.DateTimeField(null=True, blank=True)
    next_review_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['next_review_at', '-failure_count', 'word']
        indexes = [
            models.Index(fields=['student', 'archived', 'next_review_at']),
            models.Index(fields=['student', 'difficulty_level', 'archived']),
            models.Index(fields=['student', 'mastered', 'archived']),
            models.Index(fields=['teacher', 'created_at']),
        ]

    def save(self, *args, **kwargs):
        from django.utils import timezone
        if not self.next_review_at:
            self.next_review_at = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.word

class VocabularyReviewLog(models.Model):
    RATING_CHOICES = (
        ('very_hard', 'Muito Dificil'),
        ('hard', 'Dificil'),
        ('easy', 'Facil'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(VocabularyCard, on_delete=models.CASCADE, related_name='review_logs')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='vocabulary_review_logs')
    rating = models.CharField(max_length=20, choices=RATING_CHOICES)
    review_quality = models.PositiveSmallIntegerField()
    previous_easiness_factor = models.FloatField()
    new_easiness_factor = models.FloatField()
    previous_interval_days = models.PositiveIntegerField()
    new_interval_days = models.PositiveIntegerField()
    previous_repetition_count = models.PositiveIntegerField()
    new_repetition_count = models.PositiveIntegerField()
    reviewed_at = models.DateTimeField(auto_now_add=True)
    next_review_at = models.DateTimeField()

    class Meta:
        ordering = ['-reviewed_at']
        indexes = [
            models.Index(fields=['student', 'reviewed_at']),
            models.Index(fields=['card', 'reviewed_at']),
        ]

class VocabularyReviewSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='vocabulary_review_sessions')
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    cards_reviewed = models.PositiveIntegerField(default=0)
    easy_count = models.PositiveIntegerField(default=0)
    hard_count = models.PositiveIntegerField(default=0)
    very_hard_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-started_at']

class LessonSummary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lesson = models.OneToOneField(Lesson, on_delete=models.CASCADE, related_name='summary')
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='lesson_summaries')
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='lesson_summaries_created')
    summary = models.TextField(blank=True)
    homework = models.TextField(blank=True)
    observations = models.TextField(blank=True)
    raw_ai_response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['student', '-created_at']),
            models.Index(fields=['teacher', '-created_at']),
            models.Index(fields=['lesson']),
        ]

    def __str__(self):
        return f"Summary - {self.lesson_id}"

class LessonSummaryWord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lesson_summary = models.ForeignKey(LessonSummary, on_delete=models.CASCADE, related_name='words')
    word = models.CharField(max_length=255)
    meaning = models.TextField(blank=True)

    class Meta:
        ordering = ['word']
        indexes = [models.Index(fields=['lesson_summary', 'word'])]

    def __str__(self):
        return self.word

class LessonSummaryMistake(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lesson_summary = models.ForeignKey(LessonSummary, on_delete=models.CASCADE, related_name='mistakes')
    mistake = models.TextField()
    correction = models.TextField(blank=True)

    class Meta:
        ordering = ['id']
        indexes = [models.Index(fields=['lesson_summary'])]

    def __str__(self):
        return self.mistake[:80]

class LessonSummaryNextTopic(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lesson_summary = models.ForeignKey(LessonSummary, on_delete=models.CASCADE, related_name='next_topics')
    topic = models.CharField(max_length=255)

    class Meta:
        ordering = ['topic']
        indexes = [models.Index(fields=['lesson_summary', 'topic'])]

    def __str__(self):
        return self.topic

class Attachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(upload_to='lesson_attachments/')
    lesson = models.ForeignKey(Lesson, related_name='attachments', on_delete=models.CASCADE)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.file.name

class Homework(models.Model):
    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('sent', 'Sent'),
        ('corrected', 'Corrected'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    classification = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    due_date = models.DateTimeField(null=True, blank=True)
    auto_correction_enabled = models.BooleanField(default=True)
    teacher_feedback = models.TextField(blank=True, null=True)
    student_report = models.JSONField(default=dict, blank=True)
    report_generated_at = models.DateTimeField(blank=True, null=True)
    teacher = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='homework_created')
    student = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='homework_received')
    lesson = models.ForeignKey(Lesson, related_name='homework_items', on_delete=models.CASCADE)
    template = models.ForeignKey('HomeworkTemplate', null=True, blank=True, on_delete=models.SET_NULL, related_name='homework_items')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title

class HomeworkQuestion(models.Model):
    TYPE_CHOICES = (
        ('open_text', 'Open text'),
        ('multiple_choice', 'Multiple choice'),
    )
    SECOND_CHANCE_CHOICES = (
        ('none', 'None'),
        ('ai_generated', 'AI generated'),
        ('reserve', 'Reserve question'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    homework = models.ForeignKey(Homework, related_name='questions', on_delete=models.CASCADE)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    prompt = models.TextField()
    image = models.FileField(upload_to='homework/questions/images/', blank=True, null=True)
    audio = models.FileField(upload_to='homework/questions/audio/', blank=True, null=True)
    audio_transcript = models.TextField(blank=True)
    options = models.JSONField(default=list, blank=True)
    correct_option_index = models.PositiveIntegerField(null=True, blank=True)
    reference_answer = models.TextField(blank=True)
    correction_instructions = models.TextField(blank=True)
    explanation = models.TextField(blank=True)
    second_chance_mode = models.CharField(max_length=20, choices=SECOND_CHANCE_CHOICES, default='ai_generated')
    reserve_type = models.CharField(max_length=20, choices=TYPE_CHOICES, blank=True, default='open_text')
    reserve_prompt = models.TextField(blank=True)
    reserve_options = models.JSONField(default=list, blank=True)
    reserve_correct_option_index = models.PositiveIntegerField(null=True, blank=True)
    reserve_reference_answer = models.TextField(blank=True)
    reserve_explanation = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return self.prompt[:80]

class HomeworkAnswer(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    homework = models.ForeignKey(Homework, related_name='answers', on_delete=models.CASCADE)
    question = models.ForeignKey(HomeworkQuestion, related_name='answers', on_delete=models.CASCADE)
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name='homework_answers')
    answer_text = models.TextField(blank=True, null=True)
    selected_option_index = models.PositiveIntegerField(null=True, blank=True)
    is_correct = models.BooleanField(blank=True, null=True)
    auto_feedback = models.TextField(blank=True)
    auto_explanation = models.TextField(blank=True)
    expected_answer = models.TextField(blank=True)
    correction_metadata = models.JSONField(default=dict, blank=True)
    answered_at = models.DateTimeField(blank=True, null=True)
    second_chance_answer_text = models.TextField(blank=True, null=True)
    second_chance_selected_option_index = models.PositiveIntegerField(null=True, blank=True)
    second_chance_is_correct = models.BooleanField(blank=True, null=True)
    second_chance_feedback = models.TextField(blank=True)
    second_chance_explanation = models.TextField(blank=True)
    second_chance_expected_answer = models.TextField(blank=True)
    second_chance_answered_at = models.DateTimeField(blank=True, null=True)
    teacher_feedback = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('question', 'student')
        ordering = ['question__order']

    def __str__(self):
        return f"{self.student_id} - {self.question_id}"

class HomeworkTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    classification = models.CharField(max_length=100, blank=True, null=True)
    teacher = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name='homework_templates')
    source_homework = models.ForeignKey(Homework, null=True, blank=True, on_delete=models.SET_NULL, related_name='saved_templates')
    questions = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title
