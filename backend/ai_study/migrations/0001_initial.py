# Generated manually for the AI Study module.

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('lessons', '0013_homework_homeworkquestion_homeworktemplate_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='AIStudySession',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('mode', models.CharField(choices=[('speaking', 'Speaking'), ('listening', 'Listening'), ('writing', 'Writing'), ('weak_points', 'Weak points')], max_length=30)),
                ('theme', models.CharField(choices=[('travel', 'Travel'), ('work', 'Work'), ('interview', 'Interview'), ('casual', 'Casual conversation'), ('restaurant', 'Restaurant'), ('airport', 'Airport'), ('business', 'Business English'), ('minhas_aulas', 'Minhas Aulas'), ('custom', 'Custom')], default='casual', max_length=40)),
                ('custom_topic', models.CharField(blank=True, max_length=255, null=True)),
                ('status', models.CharField(choices=[('active', 'Active'), ('completed', 'Completed'), ('archived', 'Archived')], default='active', max_length=20)),
                ('auto_context', models.JSONField(blank=True, default=dict)),
                ('streaming_ready', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ai_study_sessions', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='SpeakingAudio',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('audio', models.FileField(upload_to='ai_study/speaking_audio/')),
                ('mime_type', models.CharField(max_length=100)),
                ('duration_seconds', models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ('status', models.CharField(choices=[('uploaded', 'Uploaded'), ('transcribed', 'Transcribed'), ('analyzed', 'Analyzed'), ('failed', 'Failed')], default='uploaded', max_length=20)),
                ('error_message', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='speaking_audios', to='ai_study.aistudysession')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ai_study_speaking_audios', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='AIContextLesson',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('snapshot', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('lesson', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ai_study_contexts', to='lessons.lesson')),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='context_lessons', to='ai_study.aistudysession')),
            ],
            options={'ordering': ['-created_at'], 'unique_together': {('session', 'lesson')}},
        ),
        migrations.CreateModel(
            name='SpeakingFeedback',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('transcript', models.TextField()),
                ('pronunciation_score', models.PositiveSmallIntegerField(default=0)),
                ('fluency_score', models.PositiveSmallIntegerField(default=0)),
                ('grammar_score', models.PositiveSmallIntegerField(default=0)),
                ('vocabulary_score', models.PositiveSmallIntegerField(default=0)),
                ('ai_feedback', models.TextField()),
                ('corrected_sentence', models.TextField(blank=True)),
                ('natural_sentence', models.TextField(blank=True)),
                ('pronunciation_mistakes', models.JSONField(blank=True, default=list)),
                ('grammar_explanation', models.TextField(blank=True)),
                ('vocabulary_suggestions', models.JSONField(blank=True, default=list)),
                ('native_alternative_sentence', models.TextField(blank=True)),
                ('tts_audio_url', models.URLField(blank=True, null=True)),
                ('raw_response', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('audio', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='feedback', to='ai_study.speakingaudio')),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='speaking_feedbacks', to='ai_study.aistudysession')),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='AIConversationMessage',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('role', models.CharField(choices=[('system', 'System'), ('user', 'User'), ('assistant', 'Assistant')], max_length=20)),
                ('content_type', models.CharField(choices=[('text', 'Text'), ('audio', 'Audio'), ('feedback', 'Feedback')], default='text', max_length=20)),
                ('text', models.TextField(blank=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('stream_state', models.CharField(default='complete', max_length=30)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('audio', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='conversation_messages', to='ai_study.speakingaudio')),
                ('feedback', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='conversation_messages', to='ai_study.speakingfeedback')),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='ai_study.aistudysession')),
            ],
            options={'ordering': ['created_at']},
        ),
        migrations.CreateModel(
            name='PronunciationReview',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('target_sentence', models.TextField()),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('difficulty_level', models.CharField(choices=[('easy', 'Easy'), ('medium', 'Medium'), ('hard', 'Hard')], default='medium', max_length=20)),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('feedback', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reviews', to='ai_study.speakingfeedback')),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
