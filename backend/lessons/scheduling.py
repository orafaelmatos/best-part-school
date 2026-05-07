import datetime

from django.db import transaction
from django.utils import timezone

from .models import Lesson, StudentRecurringSchedule, TeacherAvailability, TeacherBlockedDate


JS_TO_PY_WEEKDAY = {
    0: 6,
    1: 0,
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
}
LESSON_DURATION = datetime.timedelta(hours=1)
BUSY_STATUSES = ['scheduled', 'rescheduled', 'in_progress']


def normalize_student_level(level):
    if level == 'A1/A2':
        return ['A1', 'A2', 'A1/A2', 'ALL LEVELS']
    return [level, 'ALL LEVELS']


def next_occurrence(day_of_week, start_time, from_date=None):
    base_date = from_date or timezone.localdate()
    days_ahead = day_of_week - base_date.weekday()
    if days_ahead < 0:
        days_ahead += 7

    candidate_date = base_date + datetime.timedelta(days=days_ahead)
    candidate = datetime.datetime.combine(candidate_date, start_time)
    if timezone.is_naive(candidate):
        candidate = timezone.make_aware(candidate)

    if candidate < timezone.now():
        candidate_date += datetime.timedelta(days=7)
        candidate = datetime.datetime.combine(candidate_date, start_time)
        candidate = timezone.make_aware(candidate) if timezone.is_naive(candidate) else candidate

    return candidate


def parse_lesson_datetime(value):
    if isinstance(value, datetime.datetime):
        lesson_date = value
    elif isinstance(value, str):
        lesson_date = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    else:
        raise ValueError('Formato de data inválido.')

    if timezone.is_naive(lesson_date):
        lesson_date = timezone.make_aware(lesson_date)
    return lesson_date


def lesson_end(lesson_date):
    return lesson_date + LESSON_DURATION


def overlaps(start_a, end_a, start_b, end_b):
    return start_a < end_b and start_b < end_a


def is_blocked_date(teacher, lesson_date):
    return TeacherBlockedDate.objects.filter(teacher=teacher, date=lesson_date.date()).exists()


def availability_for_datetime(teacher, lesson_date):
    lesson_time = lesson_date.timetz().replace(tzinfo=None)
    end_time = lesson_end(lesson_date).timetz().replace(tzinfo=None)
    return TeacherAvailability.objects.filter(
        teacher=teacher,
        day_of_week=lesson_date.weekday(),
        start_time__lte=lesson_time,
        end_time__gte=end_time,
    ).exists()


def has_lesson_conflict(teacher, lesson_date, exclude_lesson_id=None):
    end_date = lesson_end(lesson_date)
    qs = Lesson.objects.filter(
        teacher=teacher,
        date__isnull=False,
        status__in=BUSY_STATUSES,
        is_template=False,
    )
    if exclude_lesson_id:
        qs = qs.exclude(id=exclude_lesson_id)

    for existing in qs:
        if overlaps(existing.date, lesson_end(existing.date), lesson_date, end_date):
            return existing
    return None


def validate_lesson_schedule(teacher, lesson_date, exclude_lesson_id=None, allow_past=False):
    if not teacher:
        raise ValueError('Professor obrigatório para agendamento.')
    if not lesson_date:
        raise ValueError('Data e horário são obrigatórios.')
    if not allow_past and lesson_date < timezone.now():
        raise ValueError('Não é possível agendar para uma data passada.')
    if is_blocked_date(teacher, lesson_date):
        raise ValueError('O professor bloqueou esta data.')
    if not availability_for_datetime(teacher, lesson_date):
        raise ValueError('Horário fora da disponibilidade do professor.')

    conflict = has_lesson_conflict(teacher, lesson_date, exclude_lesson_id=exclude_lesson_id)
    if conflict:
        raise ValueError('O professor já possui uma aula ou compromisso neste horário.')


def get_day_time_slots(teacher_id, date_value, exclude_lesson_id=None):
    if isinstance(date_value, str):
        target_date = datetime.date.fromisoformat(date_value)
    else:
        target_date = date_value

    day_availabilities = TeacherAvailability.objects.filter(
        teacher_id=teacher_id,
        day_of_week=target_date.weekday(),
    ).order_by('start_time')
    blocked = TeacherBlockedDate.objects.filter(teacher_id=teacher_id, date=target_date).exists()

    slots = []
    for availability in day_availabilities:
        cursor = datetime.datetime.combine(target_date, availability.start_time)
        end = datetime.datetime.combine(target_date, availability.end_time)
        if timezone.is_naive(cursor):
            cursor = timezone.make_aware(cursor)
            end = timezone.make_aware(end)

        while cursor + LESSON_DURATION <= end:
            reason = None
            if blocked:
                reason = 'blocked'
            elif cursor < timezone.now():
                reason = 'past'
            elif has_lesson_conflict(availability.teacher, cursor, exclude_lesson_id=exclude_lesson_id):
                reason = 'busy'

            slots.append({
                'time': cursor.strftime('%H:%M'),
                'datetime': cursor.isoformat(),
                'available': reason is None,
                'reason': reason,
            })
            cursor += LESSON_DURATION

    return slots


def build_schedule_entries(schedule_entries):
    entries = []
    for entry in schedule_entries or []:
        raw_day = entry.get('day_of_week', entry.get('day'))
        raw_time = entry.get('start_time', entry.get('time'))
        if raw_day is None or not raw_time:
            continue

        day = int(raw_day)
        if entry.get('source') == 'js':
            day = JS_TO_PY_WEEKDAY.get(day, day)
        elif day == 0 and entry.get('day_of_week') is None:
            day = JS_TO_PY_WEEKDAY[0]

        start_time = raw_time
        if isinstance(start_time, str):
            start_time = datetime.time.fromisoformat(start_time)

        entries.append({'day_of_week': day, 'start_time': start_time})
    return entries


@transaction.atomic
def create_student_schedule_and_lessons(student, teacher=None, schedule_entries=None):
    entries = build_schedule_entries(schedule_entries)

    for entry in entries:
        StudentRecurringSchedule.objects.get_or_create(
            student=student,
            teacher=teacher,
            day_of_week=entry['day_of_week'],
            start_time=entry['start_time'],
            defaults={'active': True},
        )

    levels = normalize_student_level(student.level)
    templates = list(
        Lesson.objects.filter(is_template=True, level__in=levels).order_by('order', 'id')
    )

    lessons_to_create = []
    planned_intervals = []
    if entries:
        ordered_slots = [
            {
                **entry,
                'next_date': next_occurrence(entry['day_of_week'], entry['start_time']),
            }
            for entry in entries
        ]
        ordered_slots.sort(key=lambda slot: slot['next_date'])

        for index, template in enumerate(templates):
            slot = ordered_slots[index % len(ordered_slots)]
            week_offset = index // len(ordered_slots)
            lesson_date = slot['next_date'] + datetime.timedelta(weeks=week_offset)
            validate_lesson_schedule(teacher, lesson_date)
            if any(overlaps(start, end, lesson_date, lesson_end(lesson_date)) for start, end in planned_intervals):
                raise ValueError('Existem horários recorrentes conflitantes na agenda do aluno.')
            planned_intervals.append((lesson_date, lesson_end(lesson_date)))
            lessons_to_create.append(Lesson(
                title=template.title,
                level=template.level,
                date=lesson_date,
                status='scheduled',
                student=student,
                teacher=teacher,
                is_template=False,
                template=template,
                order=index + 1,
            ))
    else:
        for index, template in enumerate(templates):
            lessons_to_create.append(Lesson(
                title=template.title,
                level=template.level,
                date=None,
                status='pending',
                student=student,
                teacher=teacher,
                is_template=False,
                template=template,
                order=index + 1,
            ))

    Lesson.objects.bulk_create(lessons_to_create)
    return lessons_to_create
