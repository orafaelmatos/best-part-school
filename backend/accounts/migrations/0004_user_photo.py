from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_user_listening_user_reading_user_speaking_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='photo',
            field=models.ImageField(blank=True, max_length=768, null=True, upload_to='students/photos/'),
        ),
    ]
