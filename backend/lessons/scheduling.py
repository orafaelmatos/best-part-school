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
SLOT_INTERVAL = datetime.timedelta(minutes=30)
BUSY_STATUSES = ['scheduled', 'rescheduled', 'in_progress']
REORDERABLE_STATUSES = ['pending', 'scheduled', 'rescheduled']
STARTABLE_SEQUENCE_STATUSES = REORDERABLE_STATUSES + ['in_progress']
ARCHIVED_STATUSES = ['canceled', 'missed']


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


def lesson_end_time(start_time):
    start_dt = datetime.datetime.combine(datetime.date(2000, 1, 1), start_time)
    end_dt = start_dt + LESSON_DURATION
    return end_dt.time(), end_dt.date() != start_dt.date()


def lesson_start_times_overlap(start_time_a, start_time_b):
    reference_date = datetime.date(2000, 1, 1)
    start_a = datetime.datetime.combine(reference_date, start_time_a)
    start_b = datetime.datetime.combine(reference_date, start_time_b)
    return overlaps(start_a, start_a + LESSON_DURATION, start_b, start_b + LESSON_DURATION)


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


def has_lesson_conflict(teacher, lesson_date, exclude_lesson_id=None, exclude_lesson_ids=None):
    end_date = lesson_end(lesson_date)
    qs = Lesson.objects.filter(
        teacher=teacher,
        date__isnull=False,
        status__in=BUSY_STATUSES,
        is_template=False,
    )
    if exclude_lesson_id:
        qs = qs.exclude(id=exclude_lesson_id)
    if exclude_lesson_ids:
        qs = qs.exclude(id__in=exclude_lesson_ids)

    for existing in qs:
        if overlaps(existing.date, lesson_end(existing.date), lesson_date, end_date):
            return existing
    return None


def validate_lesson_schedule(teacher, lesson_date, exclude_lesson_id=None, allow_past=False, exclude_lesson_ids=None):
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

    conflict = has_lesson_conflict(
        teacher,
        lesson_date,
        exclude_lesson_id=exclude_lesson_id,
        exclude_lesson_ids=exclude_lesson_ids,
    )
    if conflict:
        raise ValueError('O professor já possui uma aula ou compromisso neste horário.')


def sequence_slot_is_available(teacher, lesson_date, exclude_lesson_ids=None):
    if not teacher:
        return True
    if is_blocked_date(teacher, lesson_date):
        return False
    if TeacherAvailability.objects.filter(teacher=teacher).exists():
        try:
            validate_lesson_schedule(
                teacher,
                lesson_date,
                allow_past=True,
                exclude_lesson_ids=exclude_lesson_ids,
            )
            return True
        except ValueError:
            return False
    return has_lesson_conflict(
        teacher,
        lesson_date,
        exclude_lesson_ids=exclude_lesson_ids,
    ) is None


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
            cursor += SLOT_INTERVAL

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


def get_student_lesson_templates(student):
    levels = normalize_student_level(student.level)
    return list(Lesson.objects.filter(is_template=True, level__in=levels).order_by('order', 'id'))


def actual_completed_lesson_count(student, teacher=None):
    qs = Lesson.objects.filter(student=student, is_template=False, status='completed')
    if teacher is not None:
        qs = qs.filter(teacher=teacher)
    return qs.count()


def effective_completed_lesson_count(student, teacher=None):
    manual_count = int(getattr(student, 'completed_lessons_count', 0) or 0)
    return max(manual_count, actual_completed_lesson_count(student, teacher=teacher))


def effective_planned_lesson_count(student, teacher=None):
    manual_count = int(getattr(student, 'planned_lessons_count', 0) or 0)
    qs = Lesson.objects.filter(student=student, is_template=False).exclude(status__in=ARCHIVED_STATUSES)
    if teacher is not None:
        qs = qs.filter(teacher=teacher)
    existing_count = qs.count()
    template_count = len(get_student_lesson_templates(student))
    return max(manual_count, existing_count, template_count, effective_completed_lesson_count(student, teacher=teacher))


def pending_lesson_count(student, teacher=None):
    return max(effective_planned_lesson_count(student, teacher=teacher) - effective_completed_lesson_count(student, teacher=teacher), 0)


def validate_recurring_schedule_entries(student, teacher, entries):
    seen_entries = []
    for entry in entries:
        day_of_week = entry['day_of_week']
        start_time = entry['start_time']
        end_time, crosses_day = lesson_end_time(start_time)
        if crosses_day:
            raise ValueError('A aula recorrente precisa terminar no mesmo dia.')

        for seen in seen_entries:
            if seen['day_of_week'] == day_of_week and lesson_start_times_overlap(seen['start_time'], start_time):
                raise ValueError('Existem horários recorrentes conflitantes na agenda do aluno.')
        seen_entries.append(entry)

        if teacher is None:
            continue

        has_availability = TeacherAvailability.objects.filter(
            teacher=teacher,
            day_of_week=day_of_week,
            start_time__lte=start_time,
            end_time__gte=end_time,
        ).exists()
        if not has_availability:
            raise ValueError('O horário precisa caber dentro da disponibilidade do professor.')

        conflicting_schedules = StudentRecurringSchedule.objects.filter(
            teacher=teacher,
            day_of_week=day_of_week,
            active=True,
        ).exclude(student=student)

        for schedule in conflicting_schedules:
            if lesson_start_times_overlap(schedule.start_time, start_time):
                conflict_end_time, _ = lesson_end_time(schedule.start_time)
                raise ValueError(
                    f'Esse horário se sobrepõe a outra aula recorrente do professor '
                    f'({schedule.start_time.strftime("%H:%M")} - {conflict_end_time.strftime("%H:%M")}).'
                )


def recurring_schedule_signature(entries):
    return sorted(
        (entry['day_of_week'], entry['start_time'].strftime('%H:%M:%S'))
        for entry in entries
    )


def current_student_recurring_schedule_signature(student, teacher=None):
    schedules = StudentRecurringSchedule.objects.filter(student=student, active=True)
    if teacher is not None:
        schedules = schedules.filter(teacher=teacher)
    else:
        schedules = schedules.filter(teacher__isnull=True)
    return recurring_schedule_signature([
        {
            'day_of_week': schedule.day_of_week,
            'start_time': schedule.start_time,
        }
        for schedule in schedules
    ])


def recurring_schedule_entries_match(student, teacher=None, schedule_entries=None):
    entries = build_schedule_entries(schedule_entries)
    return current_student_recurring_schedule_signature(student, teacher=teacher) == recurring_schedule_signature(entries)


@transaction.atomic
def replace_student_recurring_schedules(student, teacher=None, schedule_entries=None):
    entries = build_schedule_entries(schedule_entries)
    validate_recurring_schedule_entries(student, teacher, entries)

    schedules = StudentRecurringSchedule.objects.filter(student=student)
    if teacher is not None:
        schedules = schedules.filter(teacher=teacher)
    else:
        schedules = schedules.filter(teacher__isnull=True)
    schedules.delete()

    StudentRecurringSchedule.objects.bulk_create([
        StudentRecurringSchedule(
            student=student,
            teacher=teacher,
            day_of_week=entry['day_of_week'],
            start_time=entry['start_time'],
            active=True,
        )
        for entry in entries
    ])
    return entries


def lesson_spec_for_order(student, templates, order):
    template = templates[order - 1] if order - 1 < len(templates) else None
    if template:
        return {
            'title': template.title,
            'level': template.level,
            'template': template,
        }
    return {
        'title': f'Aula personalizada {order}',
        'level': student.level or 'A1/A2',
        'template': None,
    }


def planned_count_for_student(student, templates=None, current_count=0):
    templates = templates if templates is not None else get_student_lesson_templates(student)
    manual_count = int(getattr(student, 'planned_lessons_count', 0) or 0)
    completed_count = int(getattr(student, 'completed_lessons_count', 0) or 0)
    if manual_count > 0:
        return max(manual_count, completed_count)
    return max(len(templates), current_count, completed_count)


def persist_default_planned_count(student, planned_count):
    if planned_count > 0 and not int(getattr(student, 'planned_lessons_count', 0) or 0):
        student.planned_lessons_count = planned_count
        student.save(update_fields=['planned_lessons_count'])


def sync_planned_count_from_existing_lessons(student):
    lesson_count = Lesson.objects.filter(student=student, is_template=False).exclude(status__in=ARCHIVED_STATUSES).count()
    if lesson_count > int(getattr(student, 'planned_lessons_count', 0) or 0):
        student.planned_lessons_count = lesson_count
        student.save(update_fields=['planned_lessons_count'])


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


def build_student_sequence_dates(student, teacher, after_datetime, lesson_count, exclude_lesson_ids=None):
    if lesson_count <= 0:
        return []

    max_weeks = max(26, lesson_count + 12)
    candidates = iter_student_schedule_candidates(
        student,
        teacher,
        after_datetime,
        max_weeks=max_weeks,
    )

    assigned_dates = []
    for candidate in candidates:
        if teacher and not sequence_slot_is_available(
            teacher,
            candidate,
            exclude_lesson_ids=exclude_lesson_ids,
        ):
            continue
        assigned_dates.append(candidate)
        if len(assigned_dates) == lesson_count:
            return assigned_dates

    raise ValueError('Não foi possível redistribuir as próximas aulas para o novo horário.')


@transaction.atomic
def sync_student_completed_lesson_count(student, teacher=None):
    target_count = int(getattr(student, 'completed_lessons_count', 0) or 0)
    if target_count <= 0:
        return []

    queryset = Lesson.objects.filter(student=student, is_template=False).exclude(status__in=ARCHIVED_STATUSES)
    if teacher is not None:
        queryset = queryset.filter(teacher=teacher)
    ordered_lessons = sorted(list(queryset), key=sequence_order_key)
    target_count = min(target_count, len(ordered_lessons))
    updated_lessons = []
    now = timezone.now()

    for lesson in ordered_lessons[:target_count]:
        changed = False
        if lesson.status != 'completed':
            lesson.status = 'completed'
            changed = True
        if lesson.date and lesson.date > now:
            lesson.date = None
            changed = True
        if changed:
            lesson.updated_at = now
            updated_lessons.append(lesson)

    if updated_lessons:
        Lesson.objects.bulk_update(updated_lessons, ['date', 'status', 'updated_at'])
    return updated_lessons


@transaction.atomic
def sync_student_lesson_plan(student, teacher=None):
    queryset = Lesson.objects.filter(student=student, is_template=False)
    if teacher is not None:
        queryset = queryset.filter(Q(teacher=teacher) | Q(teacher__isnull=True))
    current_lessons = sorted(list(queryset), key=sequence_order_key)
    templates = get_student_lesson_templates(student)
    planned_count = planned_count_for_student(student, templates=templates, current_count=len(current_lessons))
    persist_default_planned_count(student, planned_count)

    if len(current_lessons) < planned_count:
        next_order = max(
            [lesson.order for lesson in current_lessons if lesson.order and lesson.order > 0] or [len(current_lessons)]
        ) + 1
        missing_count = planned_count - len(current_lessons)
        new_lessons = []
        for offset in range(missing_count):
            order = next_order + offset
            spec = lesson_spec_for_order(student, templates, order)
            new_lessons.append(Lesson(
                title=spec['title'],
                level=spec['level'],
                date=None,
                status='pending',
                student=student,
                teacher=teacher,
                is_template=False,
                template=spec['template'],
                order=order,
            ))
        Lesson.objects.bulk_create(new_lessons)

    sync_student_completed_lesson_count(student, teacher=teacher)
    realign_student_lessons_to_schedule(student, teacher=teacher)
    return sorted(list(queryset), key=sequence_order_key)


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
    if current_lesson.template_id is None and current_lesson.title.startswith('Aula personalizada '):
        current_lesson.title = title
        current_lesson.status = 'in_progress'
        current_lesson.save(update_fields=['title', 'status', 'updated_at'])
        return current_lesson

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
    sync_planned_count_from_existing_lessons(current_lesson.student)
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
def realign_student_lessons_to_schedule(student, teacher=None):
    queryset = Lesson.objects.filter(
        student=student,
        is_template=False,
        status__in=REORDERABLE_STATUSES,
    )
    if teacher is not None:
        queryset = queryset.filter(teacher=teacher)

    lessons_to_realign = sorted(list(queryset), key=sequence_order_key)
    if not lessons_to_realign:
        return []

    all_student_lessons = Lesson.objects.filter(student=student, is_template=False)
    if teacher is not None:
        all_student_lessons = all_student_lessons.filter(teacher=teacher)
    ordered_lessons = sorted(list(all_student_lessons), key=sequence_order_key)

    realign_ids = {lesson.id for lesson in lessons_to_realign}
    first_realign_index = next(
        index for index, lesson in enumerate(ordered_lessons) if lesson.id in realign_ids
    )
    anchor_candidates = [timezone.now()]
    for locked_lesson in ordered_lessons[:first_realign_index]:
        if locked_lesson.date:
            anchor_candidates.append(locked_lesson.date)
    anchor_datetime = max(anchor_candidates)

    active_schedules = StudentRecurringSchedule.objects.filter(student=student, active=True)
    if teacher is not None:
        scoped = active_schedules.filter(Q(teacher=teacher) | Q(teacher__isnull=True))
        if scoped.exists():
            active_schedules = scoped
    if not active_schedules.exists():
        updated_at = timezone.now()
        for lesson in lessons_to_realign:
            lesson.date = None
            lesson.status = 'pending'
            lesson.updated_at = updated_at
        Lesson.objects.bulk_update(lessons_to_realign, ['date', 'status', 'updated_at'])
        return lessons_to_realign

    reassigned_dates = build_student_sequence_dates(
        student,
        teacher,
        anchor_datetime,
        len(lessons_to_realign),
        exclude_lesson_ids=realign_ids,
    )

    updated_at = timezone.now()
    for lesson, new_date in zip(lessons_to_realign, reassigned_dates):
        lesson.date = new_date
        if lesson.status == 'pending':
            lesson.status = 'scheduled'
        lesson.updated_at = updated_at

    Lesson.objects.bulk_update(lessons_to_realign, ['date', 'status', 'updated_at'])
    return lessons_to_realign


@transaction.atomic
def create_student_schedule_and_lessons(student, teacher=None, schedule_entries=None):
    entries = build_schedule_entries(schedule_entries)
    validate_recurring_schedule_entries(student, teacher, entries)

    for entry in entries:
        StudentRecurringSchedule.objects.update_or_create(
            student=student,
            teacher=teacher,
            day_of_week=entry['day_of_week'],
            start_time=entry['start_time'],
            defaults={'active': True},
        )

    templates = get_student_lesson_templates(student)
    planned_count = planned_count_for_student(student, templates=templates)
    persist_default_planned_count(student, planned_count)
    completed_count = min(int(getattr(student, 'completed_lessons_count', 0) or 0), planned_count)

    lessons_to_create = []
    planned_intervals = []
    future_lesson_index = 0
    if entries:
        ordered_slots = [
            {
                **entry,
                'next_date': next_occurrence(entry['day_of_week'], entry['start_time']),
            }
            for entry in entries
        ]
        ordered_slots.sort(key=lambda slot: slot['next_date'])

        for index in range(planned_count):
            order = index + 1
            spec = lesson_spec_for_order(student, templates, order)
            is_completed_on_entry = index < completed_count
            lesson_date = None
            lesson_status = 'completed' if is_completed_on_entry else 'scheduled'

            if not is_completed_on_entry:
                slot = ordered_slots[future_lesson_index % len(ordered_slots)]
                week_offset = future_lesson_index // len(ordered_slots)
                lesson_date = slot['next_date'] + datetime.timedelta(weeks=week_offset)
                validate_lesson_schedule(teacher, lesson_date)
                if any(overlaps(start, end, lesson_date, lesson_end(lesson_date)) for start, end in planned_intervals):
                    raise ValueError('Existem horários recorrentes conflitantes na agenda do aluno.')
                planned_intervals.append((lesson_date, lesson_end(lesson_date)))
                future_lesson_index += 1

            lessons_to_create.append(Lesson(
                title=spec['title'],
                level=spec['level'],
                date=lesson_date,
                status=lesson_status,
                student=student,
                teacher=teacher,
                is_template=False,
                template=spec['template'],
                order=order,
            ))
    else:
        for index in range(planned_count):
            order = index + 1
            spec = lesson_spec_for_order(student, templates, order)
            lessons_to_create.append(Lesson(
                title=spec['title'],
                level=spec['level'],
                date=None,
                status='completed' if index < completed_count else 'pending',
                student=student,
                teacher=teacher,
                is_template=False,
                template=spec['template'],
                order=order,
            ))

    Lesson.objects.bulk_create(lessons_to_create)
    return lessons_to_create
