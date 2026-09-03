from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_user_photo'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='completed_lessons_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='user',
            name='content_to_teach',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='user',
            name='contract_end_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='contract_start_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='learning_goal',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='user',
            name='planned_lessons_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='user',
            name='strengths',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='user',
            name='taught_content',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='user',
            name='weaknesses',
            field=models.TextField(blank=True),
        ),
    ]
