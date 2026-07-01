from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai_study', '0004_alter_aiconversationmessage_content_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='aistudysession',
            name='guided_state',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
