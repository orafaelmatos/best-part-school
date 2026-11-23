"""Remove files after a committed deletion, preserving shared materials."""

import logging
from urllib.parse import unquote, urlsplit

from django.apps import apps
from django.conf import settings
from django.core.files.storage import default_storage
from django.db import models, transaction
from django.db.models.functions import Cast
from django.db.models.signals import post_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)
GENERATED_FIELDS = {
    'ai_study.AIConversationMessage': ['metadata'],
    'ai_study.AIStudySession': ['guided_state'],
    'ai_study.SpeakingFeedback': ['tts_audio_url'],
    'lessons.VocabularyCard': ['audio_url'],
    'practice.Message': ['audio_url'],
}


def generated_paths(value):
    if isinstance(value, str):
        parsed = urlsplit(value)
        prefix = settings.MEDIA_URL.rstrip('/') + '/'
        if not parsed.netloc and parsed.path.startswith(prefix):
            yield unquote(parsed.path[len(prefix):])
    elif isinstance(value, dict):
        for key, item in value.items():
            if key.endswith('audio_url') or isinstance(item, (dict, list)):
                yield from generated_paths(item)
    elif isinstance(value, list):
        for item in value:
            yield from generated_paths(item)


def is_still_referenced(path):
    for model in apps.get_models():
        if model._meta.app_label not in {'accounts', 'lessons', 'ai_study', 'practice', 'payments'}:
            continue
        for field in model._meta.fields:
            if isinstance(field, models.FileField) and model.objects.filter(**{field.name: path}).exists():
                return True
        for field in GENERATED_FIELDS.get(model._meta.label, []):
            if model.objects.annotate(_media_value=Cast(field, models.TextField())).filter(_media_value__contains=path).exists():
                return True
        if model._meta.label == 'lessons.HomeworkTemplate':
            if model.objects.annotate(_media_value=Cast('questions', models.TextField())).filter(_media_value__contains=path).exists():
                return True
    return False


def delete_unreferenced(path):
    if not path or '..' in path.split('/') or path.startswith('/'):
        return
    if not is_still_referenced(path):
        try:
            default_storage.delete(path)
        except OSError:
            logger.exception('Unable to remove a deleted record file; retry via purge_orphan_media.')


@receiver(post_delete)
def cleanup_deleted_files(sender, instance, **kwargs):
    if sender._meta.app_label not in {'accounts', 'lessons', 'ai_study', 'practice', 'payments'}:
        return
    paths = {
        value.name for field in sender._meta.fields if isinstance(field, models.FileField)
        if (value := getattr(instance, field.name, None)) and value.name
    }
    for field in GENERATED_FIELDS.get(sender._meta.label, []):
        paths.update(generated_paths(getattr(instance, field, None)))
    for path in paths:
        transaction.on_commit(lambda name=path: delete_unreferenced(name))
