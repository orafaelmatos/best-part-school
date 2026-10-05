from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('lessons', '0020_group_lessons'),
    ]

    operations = [
        migrations.AlterField(
            model_name='vocabularyreviewlog',
            name='rating',
            field=models.CharField(
                choices=[
                    ('very_hard', 'Muito Dificil'),
                    ('hard', 'Dificil'),
                    ('good', 'Boa'),
                    ('easy', 'Facil'),
                ],
                max_length=20,
            ),
        ),
    ]
