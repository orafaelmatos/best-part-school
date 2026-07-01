from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai_study', '0005_aistudysession_guided_state'),
    ]

    operations = [
        migrations.AddField(
            model_name='aistudysession',
            name='is_pinned',
            field=models.BooleanField(default=False),
        ),
    ]
