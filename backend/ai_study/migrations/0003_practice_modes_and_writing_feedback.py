import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def migrate_review_sessions(apps, schema_editor):
    AIStudySession = apps.get_model('ai_study', 'AIStudySession')
    AIStudySession.objects.filter(mode='speaking', theme='minhas_aulas', lesson__isnull=False).update(mode='review')


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('ai_study', '0002_alter_aistudysession_options_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='aistudysession',
            name='mode',
            field=models.CharField(
                choices=[
                    ('review', 'Lesson Review'),
                    ('speaking', 'Speaking'),
                    ('listening', 'Listening'),
                    ('writing', 'Writing'),
                    ('weak_points', 'Weak points'),
                ],
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name='speakingfeedback',
            name='clarity_score',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='speakingfeedback',
            name='correct_words',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='speakingfeedback',
            name='error_details',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='speakingfeedback',
            name='estimated_level',
            field=models.CharField(blank=True, max_length=10),
        ),
        migrations.AddField(
            model_name='speakingfeedback',
            name='improvement_tips',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='speakingfeedback',
            name='intonation_score',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='speakingfeedback',
            name='overall_score',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='speakingfeedback',
            name='practice_exercises',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='speakingfeedback',
            name='problem_words',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.CreateModel(
            name='AIStudyRecommendation',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('mode', models.CharField(choices=[('review', 'Lesson Review'), ('speaking', 'Speaking'), ('writing', 'Writing')], max_length=20)),
                ('note', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('lesson', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='ai_study_recommendations', to='lessons.lesson')),
                ('student', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='ai_study_recommendation', to=settings.AUTH_USER_MODEL)),
                ('teacher', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ai_study_recommendations_made', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-updated_at']},
        ),
        migrations.CreateModel(
            name='WritingFeedback',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('text_type', models.CharField(choices=[('free', 'Livre'), ('essay', 'Redação'), ('email', 'Email'), ('self_intro', 'Apresentação pessoal'), ('storytelling', 'Storytelling')], default='free', max_length=30)),
                ('original_text', models.TextField()),
                ('corrected_text', models.TextField(blank=True)),
                ('estimated_level', models.CharField(blank=True, max_length=10)),
                ('writing_score', models.PositiveSmallIntegerField(default=0)),
                ('sub_scores', models.JSONField(blank=True, default=dict)),
                ('general_feedback', models.TextField(blank=True)),
                ('level_progress_feedback', models.TextField(blank=True)),
                ('strengths', models.JSONField(blank=True, default=list)),
                ('error_explanations', models.JSONField(blank=True, default=list)),
                ('improvement_tips', models.JSONField(blank=True, default=list)),
                ('rewrites', models.JSONField(blank=True, default=dict)),
                ('exercises', models.JSONField(blank=True, default=list)),
                ('grammar_breakdown', models.JSONField(blank=True, default=list)),
                ('vocabulary_flashcards', models.JSONField(blank=True, default=list)),
                ('raw_response', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='writing_feedbacks', to='ai_study.aistudysession')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ai_study_writing_feedbacks', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.AddField(
            model_name='aiconversationmessage',
            name='writing_feedback',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='conversation_messages', to='ai_study.writingfeedback'),
        ),
        migrations.RunPython(migrate_review_sessions, migrations.RunPython.noop),
    ]
