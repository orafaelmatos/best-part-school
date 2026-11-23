"""Non-destructive demo data orchestration for the isolated mobile SQLite only."""

import ast
import datetime
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from django.conf import settings
from django.core.management.base import CommandError
from django.db import connections, transaction
from django.utils import timezone

from accounts.models import User
from accounts.serializers import RegisterSerializer
from lessons.models import Lesson, TeacherAvailability


DEMO_MARKER = 'bps-mobile-demo-v1'
DEMO_PASSWORD = 'BpsDemo2026!'
DEMO_TEACHER_EMAIL = 'professor@demo.bps.test'
DEMO_STUDENTS = (
    ('ana@demo.bps.test', 'Ana Demo', 'A1/A2', 0),
    ('bruno@demo.bps.test', 'Bruno Demo', 'B1', 1),
    ('carla@demo.bps.test', 'Carla Demo', 'B2', 2),
    ('diego@demo.bps.test', 'Diego Demo', 'C1', 3),
    ('elisa@demo.bps.test', 'Elisa Demo', 'C2', 4),
)


def demo_id(key):
    return uuid5(NAMESPACE_URL, f'best-part-school:mobile-demo:v1:{key}')


def require_local_demo_database():
    """Validate before even opening a transaction, which can connect to a DB."""
    database = connections['default'].settings_dict
    if (
        settings.SETTINGS_MODULE != 'bps_core.settings_mobile'
        or not getattr(settings, 'LOCAL_MOBILE_MODE', False)
        or database['ENGINE'] != 'django.db.backends.sqlite3'
    ):
        raise CommandError('A demonstração exige --settings=bps_core.settings_mobile e SQLite local.')
    name = str(database.get('NAME', ''))
    expected = (Path(settings.BASE_DIR) / '.local-mobile' / 'db.sqlite3').resolve()
    # Enabled only by test code, never by an environment variable or CLI flag.
    memory_test = getattr(settings, 'LOCAL_MOBILE_DEMO_TEST_DATABASE', False) and (
        name == ':memory:' or name.startswith('file:memorydb_')
    )
    if not memory_test and Path(name).resolve() != expected:
        raise CommandError('A demonstração só pode alterar backend/.local-mobile/db.sqlite3.')


def load_demo_catalog():
    """Read literals without importing the historical production-oriented seeder."""
    source = Path(settings.BASE_DIR) / 'seed_templates.py'
    tree = ast.parse(source.read_text(encoding='utf-8'), filename=str(source))
    templates = None
    for statement in tree.body:
        if isinstance(statement, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == 'templates' for target in statement.targets
        ):
            templates = ast.literal_eval(statement.value)
            break
    if not isinstance(templates, list) or not templates:
        raise CommandError('O catálogo canônico de backend/seed_templates.py não foi encontrado.')
    curriculum = (Path(settings.BASE_DIR).parent / 'src' / 'data' / 'curriculum.ts').read_text(encoding='utf-8')
    shared = re.search(r'"ALL LEVELS"\s*:\s*\{\s*lessons\s*:\s*(\[[^\]]*\])', curriculum)
    if not shared:
        raise CommandError('As aulas ALL LEVELS de src/data/curriculum.ts não foram encontradas.')
    templates += [{'title': title, 'level': 'ALL LEVELS'} for title in json.loads(shared.group(1))]
    allowed_levels = {'A1', 'A2', 'A1/A2', 'B1', 'B2', 'C1', 'C2', 'ALL LEVELS'}
    if any(not isinstance(row.get('title'), str) or row.get('level') not in allowed_levels for row in templates):
        raise CommandError('O catálogo contém uma aula inválida para demonstração.')
    return templates


def _existing_demo_accounts():
    emails = [DEMO_TEACHER_EMAIL, *[entry[0] for entry in DEMO_STUDENTS]]
    matches = User.objects.filter(email__in=emails)
    accounts = {}
    for user in matches:
        if user.first_name != DEMO_MARKER:
            raise CommandError(f'O e-mail {user.email} já pertence a uma conta não criada pela demonstração.')
        accounts[user.email] = user
    teacher_id = demo_id('teacher')
    collision = User.objects.filter(pk=teacher_id).first()
    if collision and (collision.first_name != DEMO_MARKER or collision.email != DEMO_TEACHER_EMAIL):
        raise CommandError('O identificador reservado ao professor demo já está em uso.')
    # Detect case variants too: the user manager normalizes domains, not local parts.
    for email in emails:
        if User.objects.filter(email__iexact=email).exclude(email=email).exists():
            raise CommandError(f'O e-mail reservado {email} já possui uma conta com grafia diferente.')
    return accounts


def _seed_templates(teacher):
    created_count = 0
    positions = defaultdict(int)
    for row in load_demo_catalog():
        level, title = row['level'], row['title']
        level_group = 'A1/A2' if level in {'A1', 'A2', 'A1/A2'} else level
        positions[level_group] += 1
        template_id = demo_id(f'template:{level}:{title}')
        template = Lesson.objects.filter(pk=template_id).first()
        if template:
            if not template.is_template or template.teacher_id != teacher.pk or template.student_id or template.group_id:
                raise CommandError('Um identificador de template demo já pertence a outra aula.')
            continue
        # Existing local curriculum remains read-only and can be reused by registration.
        if Lesson.objects.filter(is_template=True, title=title, level=level).exists():
            continue
        order = positions[level_group] * 10
        if level == 'ALL LEVELS':
            order = positions[level_group] * 40 - 5
        Lesson.objects.create(
            id=template_id,
            title=title,
            level=level,
            is_template=True,
            teacher=teacher,
            status='pending',
            order=order,
        )
        created_count += 1
    return created_count


def seed_mobile_demo():
    require_local_demo_database()
    with transaction.atomic():
        existing = _existing_demo_accounts()
        teacher = existing.get(DEMO_TEACHER_EMAIL)
        teacher_created = teacher is None
        if teacher_created:
            teacher = User.objects.create_user(
                id=demo_id('teacher'),
                email=DEMO_TEACHER_EMAIL,
                name='Professor Demo',
                password=DEMO_PASSWORD,
                role='teacher',
                first_name=DEMO_MARKER,
                is_staff=False,
                is_superuser=False,
            )
            TeacherAvailability.objects.bulk_create([
                TeacherAvailability(
                    id=demo_id(f'availability:{weekday}'),
                    teacher=teacher,
                    day_of_week=weekday,
                    start_time=datetime.time(8),
                    end_time=datetime.time(21),
                ) for weekday in range(5)
            ])

        templates_created = _seed_templates(teacher)
        anchor_date = timezone.localdate()
        result = {
            'teacher': teacher,
            'teacher_created': teacher_created,
            'templates_created': templates_created,
            'students_created': 0,
            'students_preserved': 0,
            'students': [],
            'content': Counter(),
        }
        for index, (email, name, level, weekday) in enumerate(DEMO_STUDENTS):
            student = existing.get(email)
            if student is not None:
                result['students_preserved'] += 1
            else:
                serializer = RegisterSerializer(data={
                    'email': email,
                    'name': name,
                    'password': DEMO_PASSWORD,
                    'role': 'student',
                    'level': level,
                    'teacher_id': str(teacher.pk),
                    'schedules': [{'day_of_week': weekday, 'time': '18:00:00'}],
                    'completed_lessons_count': 3,
                    'contract_start_date': (anchor_date - datetime.timedelta(days=45)).isoformat(),
                    'contract_end_date': (anchor_date + datetime.timedelta(days=365)).isoformat(),
                    'learning_goal': f'Praticar inglês no nível {level} com aulas e revisão semanal.',
                    'taught_content': 'Conversação, vocabulário e estruturas das três primeiras aulas.',
                    'content_to_teach': 'Próximas aulas da trilha e prática contextualizada.',
                    'strengths': 'Participação ativa e leitura cuidadosa.',
                    'weaknesses': 'Ganhar confiança ao falar e revisar a pronúncia.',
                    'listening': 3 + index,
                    'speaking': 2 + index,
                    'reading': 4 + index,
                    'writing': 3 + index,
                    'monthly_fee': str(350 + index * 50),
                    'due_day': 10,
                    'finance_notes': 'Demonstração local: valores fictícios, sem cobrança real.',
                })
                serializer.is_valid(raise_exception=True)
                student = serializer.save()
                student.first_name = DEMO_MARKER
                student.save(update_fields=['first_name'])
                lessons = list(Lesson.objects.filter(student=student, is_template=False).order_by('order', 'id'))
                from accounts.mobile_demo_content import seed_student_content
                from accounts.mobile_demo_extras import seed_demo_extras
                result['content'].update(seed_student_content(student, teacher, lessons, anchor_date) or {})
                result['content'].update(seed_demo_extras(student, teacher, lessons, anchor_date) or {})
                result['students_created'] += 1
            result['students'].append(student)

        result['lessons'] = Lesson.objects.filter(student__in=result['students'], is_template=False).count()
        return result
