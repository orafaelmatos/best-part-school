from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_studentgroup'),
        ('lessons', '0019_lesson_is_extra'),
    ]

    operations = [
        migrations.AddField(
            model_name='lesson',
            name='group',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='lessons', to='accounts.studentgroup'),
        ),
        migrations.AddField(
            model_name='studentrecurringschedule',
            name='group',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='recurring_schedules', to='accounts.studentgroup'),
        ),
        migrations.AddField(
            model_name='homework',
            name='group',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='homework_items', to='accounts.studentgroup'),
        ),
        migrations.AlterField(
            model_name='studentrecurringschedule',
            name='student',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='recurring_schedules', to='accounts.user'),
        ),
    ]
