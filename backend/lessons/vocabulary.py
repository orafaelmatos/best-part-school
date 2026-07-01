import datetime
from dataclasses import dataclass

from django.db.models import Count, Q
from django.utils import timezone

from .models import Homework, VocabularyCard, VocabularyCategory, VocabularyReviewLog


QUALITY_BY_RATING = {
    'very_hard': 1,
    'hard': 3,
    'easy': 5,
}


@dataclass
class ReviewResult:
    card: VocabularyCard
    log: VocabularyReviewLog


def ensure_default_categories():
    for slug, name in VocabularyCategory.DEFAULT_SLUGS:
        VocabularyCategory.objects.get_or_create(
            owner=None,
            slug=slug,
            defaults={'name': name, 'is_default': True},
        )


def default_vocabulary_category():
    ensure_default_categories()
    category, _ = VocabularyCategory.objects.get_or_create(
        owner=None,
        slug='vocabulary',
        defaults={'name': 'Vocabulary', 'is_default': True},
    )
    return category


def sync_new_word_card(new_word, teacher=None):
    lesson = getattr(new_word, 'lesson', None)
    if not lesson or not lesson.student_id:
        return None

    category = default_vocabulary_category()
    resolved_teacher = lesson.teacher or teacher
    tags = [tag for tag in ['Anotação da aula', lesson.title] if tag]

    card, created = VocabularyCard.objects.get_or_create(
        student=lesson.student,
        source_new_word=new_word,
        source_type='lesson',
        defaults={
            'teacher': resolved_teacher,
            'lesson': lesson,
            'word': new_word.word,
            'translation': new_word.meaning,
            'category': category,
            'tags': tags,
            'difficulty_level': 'new',
            'next_review_at': timezone.now(),
        },
    )
    if created:
        return card

    updates = []
    field_updates = {
        'teacher': resolved_teacher,
        'lesson': lesson,
        'word': new_word.word,
        'translation': new_word.meaning,
        'category': category,
        'tags': tags,
        'source_type': 'lesson',
    }
    for field, value in field_updates.items():
        if getattr(card, field) != value:
            setattr(card, field, value)
            updates.append(field)

    if updates:
        card.save(update_fields=[*updates, 'updated_at'])
    return card


def delete_new_word_cards(new_word):
    lesson = getattr(new_word, 'lesson', None)
    if not lesson or not lesson.student_id:
        return
    VocabularyCard.objects.filter(
        student=lesson.student,
        lesson=lesson,
        source_new_word=new_word,
        source_type='lesson',
    ).delete()


def sm2_easiness(easiness_factor, quality):
    next_factor = easiness_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    return round(max(1.3, next_factor), 2)


def schedule_card(card, rating, reviewed_at=None):
    reviewed_at = reviewed_at or timezone.now()
    quality = QUALITY_BY_RATING[rating]
    previous_ease = card.easiness_factor
    previous_interval = card.interval_days
    previous_repetitions = card.repetition_count

    ease = sm2_easiness(previous_ease, quality)

    if rating == 'very_hard':
        interval = 0 if previous_interval <= 1 else max(1, round(previous_interval * 0.25))
        repetitions = 0
        failures = card.failure_count + 1
        confidence = max(0, card.confidence_level - 24)
        delay = datetime.timedelta(minutes=20 if card.last_reviewed_at is None else 8 * 60)
        next_review_at = reviewed_at + delay
        difficulty = 'weak'
    elif rating == 'hard':
        if previous_repetitions == 0:
            interval = 1
        else:
            interval = max(previous_interval + 1, round(previous_interval * 1.2))
        repetitions = previous_repetitions + 1
        failures = card.failure_count
        confidence = min(100, max(10, card.confidence_level + 8))
        next_review_at = reviewed_at + datetime.timedelta(days=interval)
        difficulty = 'learning' if confidence < 65 else 'stable'
    else:
        if previous_repetitions == 0:
            interval = 4
        elif previous_repetitions == 1:
            interval = 7
        else:
            interval = max(previous_interval + 2, round(previous_interval * ease * 1.3))
        repetitions = previous_repetitions + 1
        failures = card.failure_count
        confidence = min(100, max(25, card.confidence_level + 18))
        next_review_at = reviewed_at + datetime.timedelta(days=interval)
        difficulty = 'mastered' if interval >= 60 and confidence >= 85 else 'stable'

    card.easiness_factor = ease
    card.interval_days = interval
    card.repetition_count = repetitions
    card.failure_count = failures
    card.confidence_level = confidence
    card.difficulty_level = difficulty
    card.mastered = difficulty == 'mastered'
    card.last_reviewed_at = reviewed_at
    card.next_review_at = next_review_at
    card.save(update_fields=[
        'easiness_factor', 'interval_days', 'repetition_count', 'failure_count',
        'confidence_level', 'difficulty_level', 'mastered', 'last_reviewed_at',
        'next_review_at', 'updated_at',
    ])

    log = VocabularyReviewLog.objects.create(
        card=card,
        student=card.student,
        rating=rating,
        review_quality=quality,
        previous_easiness_factor=previous_ease,
        new_easiness_factor=ease,
        previous_interval_days=previous_interval,
        new_interval_days=interval,
        previous_repetition_count=previous_repetitions,
        new_repetition_count=repetitions,
        next_review_at=next_review_at,
    )
    return ReviewResult(card=card, log=log)


def review_queue(student, limit=50, include_new=True):
    now = timezone.now()
    qs = VocabularyCard.objects.filter(student=student, archived=False)
    if include_new:
        qs = qs.filter(Q(next_review_at__lte=now) | Q(last_reviewed_at__isnull=True))
    else:
        qs = qs.filter(next_review_at__lte=now)
    return qs.annotate(
        recent_failures=Count(
            'review_logs',
            filter=Q(review_logs__rating='very_hard', review_logs__reviewed_at__gte=now - datetime.timedelta(days=7)),
        )
    ).order_by(
        '-recent_failures',
        '-failure_count',
        'confidence_level',
        'next_review_at',
    )[:limit]


def vocabulary_stats(student):
    now = timezone.now()
    today_start = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today_start + datetime.timedelta(days=1)
    active = VocabularyCard.objects.filter(student=student, archived=False)
    logs = VocabularyReviewLog.objects.filter(student=student)
    recent_logs = logs.filter(reviewed_at__gte=now - datetime.timedelta(days=30))
    total_recent = recent_logs.count()
    easy_recent = recent_logs.filter(rating='easy').count()
    reviewed_days = set(logs.values_list('reviewed_at__date', flat=True)[:365])
    streak = 0
    cursor = timezone.localdate()
    while cursor in reviewed_days:
        streak += 1
        cursor -= datetime.timedelta(days=1)

    return {
        'due_today': active.filter(next_review_at__gte=today_start, next_review_at__lt=tomorrow).count(),
        'overdue': active.filter(next_review_at__lt=today_start).count(),
        'mastered': active.filter(mastered=True).count(),
        'difficult': active.filter(Q(difficulty_level='weak') | Q(confidence_level__lt=45)).count(),
        'study_streak': streak,
        'review_accuracy': round((easy_recent / total_recent) * 100) if total_recent else 0,
        'total_learned_words': active.count(),
        'reviewed_30_days': total_recent,
    }


def notification_badges(user, upcoming_payment_days=5):
    now = timezone.now()
    today = timezone.localdate()
    pending_homework = Homework.objects.filter(student=user).exclude(status__in=['draft', 'sent', 'corrected']).count()
    overdue_reviews = VocabularyCard.objects.filter(student=user, archived=False, next_review_at__lt=now).count()
    difficult_cards = VocabularyCard.objects.filter(
        student=user,
        archived=False,
    ).filter(Q(difficulty_level='weak') | Q(confidence_level__lt=35)).count()

    finance_count = 0
    finance_state = 'none'
    try:
        from payments.models import Payment
        upcoming_cutoff = today + datetime.timedelta(days=upcoming_payment_days)
        finance_qs = Payment.objects.filter(student=user, status__in=['pending', 'awaiting_confirmation', 'overdue'], due_date__isnull=False)
        finance_count = finance_qs.filter(Q(due_date__lte=upcoming_cutoff) | Q(status__in=['overdue', 'awaiting_confirmation'])).count()
        if finance_qs.filter(Q(status='overdue') | Q(due_date__lt=today)).exists():
            finance_state = 'danger'
        elif finance_count:
            finance_state = 'warning'
    except Exception:
        finance_count = 0

    homework_state = 'default' if pending_homework else 'none'
    learned_words_state = 'danger' if overdue_reviews else ('warning' if difficult_cards >= 10 else 'none')
    return {
        'homework': {
            'count': pending_homework,
            'pending_homework': pending_homework,
            'state': homework_state,
        },
        'learned_words': {
            'count': overdue_reviews,
            'overdue_reviews': overdue_reviews,
            'difficult_cards': difficult_cards,
            'state': learned_words_state,
        },
        'finance': {
            'count': finance_count,
            'state': finance_state,
        },
    }
