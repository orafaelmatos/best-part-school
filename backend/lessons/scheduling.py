import datetime

from django.db import transaction
from django.db.models import Q
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
REORDERABLE_STATUSES = ['pending', 'scheduled', 'rescheduled']
STARTABLE_SEQUENCE_STATUSES = REORDERABLE_STATUSES + ['in_progress']


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


def sequence_slot_is_available(teacher, lesson_date):
    if not teacher:
        return True
    if is_blocked_date(teacher, lesson_date):
        return False
    if TeacherAvailability.objects.filter(teacher=teacher).exists():
        try:
            validate_lesson_schedule(teacher, lesson_date, allow_past=True)
            return True
        except ValueError:
            return False
    return has_lesson_conflict(teacher, lesson_date) is None


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


def sequence_order_key(lesson):
    fallback_date = timezone.now() + datetime.timedelta(days=36500)
    return (
        lesson.order if lesson.order and lesson.order > 0 else 999999,
        lesson.date or fallback_date,
        lesson.created_at or timezone.now(),
        str(lesson.id),
    )


def lesson_slot_snapshot(lesson):
    return {
        'date': lesson.date,
        'status': lesson.status,
        'meeting_url': lesson.meeting_url,
        'recording_url': lesson.recording_url,
        'order': lesson.order,
    }


def next_sequence_slot_datetime(day_of_week, start_time, after_datetime):
    localized_after = timezone.localtime(after_datetime)
    base_date = localized_after.date()
    days_ahead = day_of_week - base_date.weekday()
    if days_ahead < 0:
        days_ahead += 7

    candidate_date = base_date + datetime.timedelta(days=days_ahead)
    candidate = datetime.datetime.combine(candidate_date, start_time)
    if timezone.is_naive(candidate):
        candidate = timezone.make_aware(candidate)

    if candidate <= after_datetime:
        candidate += datetime.timedelta(days=7)
    return candidate


def iter_student_schedule_candidates(student, teacher, after_datetime, max_weeks=26):
    schedules = StudentRecurringSchedule.objects.filter(student=student, active=True)
    if teacher is not None:
        scoped = list(
            schedules.filter(Q(teacher=teacher) | Q(teacher__isnull=True)).order_by('day_of_week', 'start_time')
        )
        schedule_entries = scoped or list(schedules.order_by('day_of_week', 'start_time'))
    else:
        schedule_entries = list(schedules.order_by('day_of_week', 'start_time'))

    candidates = []
    for schedule in schedule_entries:
        first = next_sequence_slot_datetime(schedule.day_of_week, schedule.start_time, after_datetime)
        for week_offset in range(max_weeks):
            candidates.append(first + datetime.timedelta(weeks=week_offset))

    return sorted({candidate for candidate in candidates})


def infer_next_sequence_date(sequence_lessons, teacher):
    dated_lessons = [lesson.date for lesson in sequence_lessons if lesson.date]
    if not dated_lessons:
        return None

    last_date = dated_lessons[-1]
    if len(dated_lessons) >= 2:
        step = dated_lessons[-1] - dated_lessons[-2]
        if step <= datetime.timedelta(0) or step > datetime.timedelta(days=60):
            step = datetime.timedelta(days=7)
    else:
        step = datetime.timedelta(days=7)

    candidate = last_date + step
    if teacher is None:
        return candidate

    for _ in range(26):
        if sequence_slot_is_available(teacher, candidate):
            return candidate
        candidate += datetime.timedelta(days=7)
    return None


def build_appended_sequence_slot(sequence_lessons, student, teacher):
    last_lesson = sequence_lessons[-1]
    next_order = (last_lesson.order if last_lesson.order and last_lesson.order > 0 else len(sequence_lessons)) + 1
    next_status = last_lesson.status if last_lesson.status in REORDERABLE_STATUSES else ('scheduled' if last_lesson.date else 'pending')

    next_date = None
    if last_lesson.date:
        for candidate in iter_student_schedule_candidates(student, teacher, last_lesson.date):
            if sequence_slot_is_available(teacher, candidate):
                next_date = candidate
                break

        if next_date is None:
            next_date = infer_next_sequence_date(sequence_lessons, teacher)

        if next_date is None:
            raise ValueError('Não foi possível calcular a próxima aula da trilha automaticamente.')
    else:
        next_status = 'pending'

    return {
        'date': next_date,
        'status': next_status,
        'meeting_url': last_lesson.meeting_url,
        'recording_url': last_lesson.recording_url,
        'order': next_order,
    }


@transaction.atomic
def swap_student_lesson_slot(current_lesson, target_lesson):
    if current_lesson.student_id != target_lesson.student_id:
        raise ValueError('A aula escolhida não pertence à trilha deste aluno.')
    if target_lesson.status not in STARTABLE_SEQUENCE_STATUSES:
        raise ValueError('Só é possível iniciar aulas que ainda fazem parte da trilha ativa do aluno.')

    current_slot = lesson_slot_snapshot(current_lesson)
    target_slot = lesson_slot_snapshot(target_lesson)

    current_lesson.date = target_slot['date']
    current_lesson.status = target_slot['status']
    current_lesson.meeting_url = target_slot['meeting_url']
    current_lesson.recording_url = target_slot['recording_url']
    current_lesson.order = target_slot['order']

    target_lesson.date = current_slot['date']
    target_lesson.status = current_slot['status']
    target_lesson.meeting_url = current_slot['meeting_url']
    target_lesson.recording_url = current_slot['recording_url']
    target_lesson.order = current_slot['order']

    if current_lesson.teacher and not target_lesson.teacher:
        target_lesson.teacher = current_lesson.teacher

    current_lesson.save()
    target_lesson.save()
    return target_lesson


@transaction.atomic
def insert_custom_lesson_into_student_sequence(current_lesson, custom_title):
    title = (custom_title or '').strip()
    if not title:
        raise ValueError('Informe o título da nova aula.')
    if not current_lesson.student_id:
        raise ValueError('A aula precisa estar vinculada a um aluno.')
    if current_lesson.status not in STARTABLE_SEQUENCE_STATUSES:
        raise ValueError('Esta aula não pode ser reposicionada na trilha.')

    queryset = Lesson.objects.filter(
        student_id=current_lesson.student_id,
        is_template=False,
        status__in=STARTABLE_SEQUENCE_STATUSES,
    )
    if current_lesson.teacher_id is not None:
        queryset = queryset.filter(Q(teacher_id=current_lesson.teacher_id) | Q(teacher__isnull=True))

    sequence_lessons = sorted(list(queryset), key=sequence_order_key)
    try:
        current_index = next(index for index, lesson in enumerate(sequence_lessons) if lesson.id == current_lesson.id)
    except StopIteration:
        raise ValueError('A aula atual não foi encontrada na trilha ativa do aluno.')

    trailing_lessons = sequence_lessons[current_index:]
    slot_snapshots = [lesson_slot_snapshot(lesson) for lesson in trailing_lessons]
    slot_snapshots.append(
        build_appended_sequence_slot(
            sequence_lessons,
            current_lesson.student,
            current_lesson.teacher,
        )
    )

    inserted_lesson = Lesson.objects.create(
        title=title,
        level=current_lesson.level,
        date=slot_snapshots[0]['date'],
        teacher=current_lesson.teacher,
        student=current_lesson.student,
        status='in_progress',
        notes='',
        meeting_url=slot_snapshots[0]['meeting_url'],
        recording_url=slot_snapshots[0]['recording_url'],
        is_template=False,
        template=None,
        order=slot_snapshots[0]['order'],
    )

    updated_at = timezone.now()
    for lesson, slot in zip(trailing_lessons, slot_snapshots[1:]):
        lesson.date = slot['date']
        lesson.status = slot['status']
        lesson.meeting_url = slot['meeting_url']
        lesson.recording_url = slot['recording_url']
        lesson.order = slot['order']
        lesson.updated_at = updated_at
        if current_lesson.teacher and not lesson.teacher:
            lesson.teacher = current_lesson.teacher

    Lesson.objects.bulk_update(
        trailing_lessons,
        ['date', 'status', 'meeting_url', 'recording_url', 'order', 'teacher', 'updated_at'],
    )
    return inserted_lesson


@transaction.atomic
def reorder_student_lessons(student, ordered_lesson_ids, teacher=None):
    queryset = Lesson.objects.filter(
        student=student,
        is_template=False,
        status__in=REORDERABLE_STATUSES,
    )
    if teacher is not None:
        queryset = queryset.filter(teacher=teacher)

    current_lessons = sorted(list(queryset), key=sequence_order_key)
    if not current_lessons:
        return []

    current_ids = [str(lesson.id) for lesson in current_lessons]
    requested_ids = [str(lesson_id) for lesson_id in ordered_lesson_ids]

    if len(current_ids) != len(requested_ids) or set(current_ids) != set(requested_ids):
        raise ValueError('Envie exatamente as aulas futuras da trilha para reordenar.')

    lesson_map = {str(lesson.id): lesson for lesson in current_lessons}
    ordered_lessons = [lesson_map[lesson_id] for lesson_id in requested_ids]
    slot_snapshots = [lesson_slot_snapshot(lesson) for lesson in current_lessons]
    updated_at = timezone.now()

    for lesson, slot in zip(ordered_lessons, slot_snapshots):
        lesson.date = slot['date']
        lesson.status = slot['status']
        lesson.meeting_url = slot['meeting_url']
        lesson.recording_url = slot['recording_url']
        lesson.order = slot['order']
        lesson.updated_at = updated_at

    Lesson.objects.bulk_update(
        ordered_lessons,
        ['date', 'status', 'meeting_url', 'recording_url', 'order', 'updated_at'],
    )
    return sorted(ordered_lessons, key=sequence_order_key)


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
