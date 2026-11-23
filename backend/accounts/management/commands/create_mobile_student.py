import getpass

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email


class Command(BaseCommand):
    help = 'Cria um aluno somente no SQLite isolado para testes mobile locais.'
    requires_system_checks = []

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True)
        parser.add_argument('--name', default='Aluno local')
        parser.add_argument('--level', choices=['A1/A2', 'B1', 'B2', 'C1', 'C2'], default='B1')

    def handle(self, *args, **options):
        # Refuse before reading any user record or checking database migrations.
        if (
            settings.SETTINGS_MODULE != 'bps_core.settings_mobile'
            or not getattr(settings, 'LOCAL_MOBILE_MODE', False)
            or settings.DATABASES['default']['ENGINE'] != 'django.db.backends.sqlite3'
        ):
            raise CommandError('Use este comando apenas com --settings=bps_core.settings_mobile.')

        user_model = get_user_model()
        email = user_model.objects.normalize_email(options['email'].strip())
        try:
            validate_email(email)
        except ValidationError as error:
            raise CommandError('Informe um e-mail válido para o aluno local.') from error
        if user_model.objects.filter(email=email).exists():
            raise CommandError('Já existe uma conta local com esse e-mail. Nenhuma conta foi alterada.')

        user = user_model(email=email, name=options['name'].strip(), role='student', level=options['level'])
        try:
            password = getpass.getpass('Senha do aluno local: ')
            confirmation = getpass.getpass('Confirme a senha: ')
        except (EOFError, KeyboardInterrupt) as error:
            raise CommandError('Criação cancelada. Execute em um terminal interativo.') from error
        if password != confirmation:
            raise CommandError('As senhas não coincidem. Nenhuma conta foi criada.')
        try:
            validate_password(password, user=user)
        except ValidationError as error:
            raise CommandError(' '.join(error.messages)) from error

        user_model.objects.create_user(
            email=email,
            name=user.name,
            password=password,
            role='student',
            level=options['level'],
            is_staff=False,
            is_superuser=False,
        )
        self.stdout.write(self.style.SUCCESS('Aluno local criado. Use o e-mail e a senha escolhidos no app.'))
