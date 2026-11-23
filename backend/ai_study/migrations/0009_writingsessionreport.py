import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai_study', '0008_speakingsessionreport'),
    ]

    operations = [
        migrations.CreateModel(
            name='WritingSessionReport',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('run_id', models.UUIDField()),
                ('status', models.CharField(choices=[('active', 'Active'), ('paused', 'Paused'), ('completed', 'Completed')], default='active', max_length=20)),
                ('report', models.JSONField(default=dict)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='writing_reports', to='ai_study.aistudysession')),
            ],
            options={
                'ordering': ['-updated_at', '-id'],
                'constraints': [models.UniqueConstraint(fields=('session', 'run_id'), name='unique_writing_report_run')],
            },
        ),
    ]
