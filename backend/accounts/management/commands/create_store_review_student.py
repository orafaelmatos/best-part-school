"""Create an isolated, fictional store-review account without touching existing users."""
import getpass
import uuid
from datetime import timedelta

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from accounts.mobile_demo_content import seed_student_content
from lessons.models import Lesson


class Command(BaseCommand):
    help = 'Cria um aluno de revisão das lojas com aulas e atividades fictícias, sem dados de alunos reais.'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        email = User.objects.normalize_email(options['email'].strip())
        try:
            validate_email(email)
        except ValidationError as error:
            raise CommandError('Informe um e-mail válido para o login de revisão.') from error
        if User.objects.filter(email__iexact=email).exists():
            raise CommandError('Esse e-mail já existe. Nenhuma conta foi alterada.')
        password = getpass.getpass('Senha da conta de revisão: ')
        if password != getpass.getpass('Confirme a senha: '):
            raise CommandError('As senhas não coincidem.')
        student = User(email=email, name='Aluno de demonstração', role='student', level='A1/A2')
        try:
            validate_password(password, student)
        except ValidationError as error:
            raise CommandError('; '.join(error.messages)) from error
        teacher = User.objects.create_user(
            email=f'store-review-{uuid.uuid4().hex}@bestpartschool.invalid',
            name='Equipe de demonstração', role='teacher', is_active=False,
        )
        student.set_password(password)
        student.first_name = 'store-review'
        student.save()
        titles = ['Everyday conversations', 'My daily routine', 'Talking about plans']
        lessons = [Lesson.objects.create(
            title=title, level='A1/A2', teacher=teacher, student=student, status='completed',
            order=index + 1, date=timezone.now() - timedelta(days=7 * (3 - index)),
        ) for index, title in enumerate(titles)]
        seed_student_content(student, teacher, lessons, timezone.localdate())
        Lesson.objects.create(
            title='Your next conversation', level='A1/A2', teacher=teacher, student=student,
            status='scheduled', order=4, date=timezone.now() + timedelta(days=7),
        )
        student.planned_lessons_count = 4
        student.completed_lessons_count = 3
        student.save(update_fields=['planned_lessons_count', 'completed_lessons_count'])
        self.stdout.write(self.style.SUCCESS('Conta de revisão criada com dados fictícios. Nenhuma senha foi registrada na saída.'))
        self.stdout.write('Guarde o login e a senha no campo de acesso para revisão das duas lojas. O consentimento de IA será solicitado no app.')
