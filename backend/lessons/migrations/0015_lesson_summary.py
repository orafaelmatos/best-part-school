import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('lessons', '0014_vocabularycategory_vocabularycard_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='LessonSummary',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('summary', models.TextField(blank=True)),
                ('homework', models.TextField(blank=True)),
                ('observations', models.TextField(blank=True)),
                ('raw_ai_response', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('lesson', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='summary', to='lessons.lesson')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lesson_summaries', to=settings.AUTH_USER_MODEL)),
                ('teacher', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lesson_summaries_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='LessonSummaryMistake',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('mistake', models.TextField()),
                ('correction', models.TextField(blank=True)),
                ('lesson_summary', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='mistakes', to='lessons.lessonsummary')),
            ],
            options={
                'ordering': ['id'],
            },
        ),
        migrations.CreateModel(
            name='LessonSummaryNextTopic',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('topic', models.CharField(max_length=255)),
                ('lesson_summary', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='next_topics', to='lessons.lessonsummary')),
            ],
            options={
                'ordering': ['topic'],
            },
        ),
        migrations.CreateModel(
            name='LessonSummaryWord',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('word', models.CharField(max_length=255)),
                ('meaning', models.TextField(blank=True)),
                ('lesson_summary', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='words', to='lessons.lessonsummary')),
            ],
            options={
                'ordering': ['word'],
            },
        ),
        migrations.AddIndex(
            model_name='lessonsummary',
            index=models.Index(fields=['student', '-created_at'], name='lessons_les_student_f92a4c_idx'),
        ),
        migrations.AddIndex(
            model_name='lessonsummary',
            index=models.Index(fields=['teacher', '-created_at'], name='lessons_les_teacher_952617_idx'),
        ),
        migrations.AddIndex(
            model_name='lessonsummary',
            index=models.Index(fields=['lesson'], name='lessons_les_lesson__3bb678_idx'),
        ),
        migrations.AddIndex(
            model_name='lessonsummarymistake',
            index=models.Index(fields=['lesson_summary'], name='lessons_les_lesson__c2d154_idx'),
        ),
        migrations.AddIndex(
            model_name='lessonsummarynexttopic',
            index=models.Index(fields=['lesson_summary', 'topic'], name='lessons_les_lesson__498067_idx'),
        ),
        migrations.AddIndex(
            model_name='lessonsummaryword',
            index=models.Index(fields=['lesson_summary', 'word'], name='lessons_les_lesson__4d07e1_idx'),
        ),
    ]
