from django.core.management.base import BaseCommand

from accounts.mobile_demo import DEMO_PASSWORD, seed_mobile_demo


class Command(BaseCommand):
    help = 'Popula somente o SQLite mobile local com professor, alunos e trilhas demonstrativas.'
    requires_system_checks = []

    def handle(self, *args, **options):
        result = seed_mobile_demo()
        self.stdout.write(self.style.SUCCESS(
            f"Demonstração local pronta: {result['students_created']} alunos criados, "
            f"{result['students_preserved']} preservados, {result['lessons']} aulas nas trilhas."
        ))
        self.stdout.write(f"Templates adicionados: {result['templates_created']}.")
        teacher = result['teacher']
        self.stdout.write(f'Professor: {teacher.email}')
        for student in result['students']:
            self.stdout.write(f'Aluno {student.level}: {student.email}')
        self.stdout.write(f'Senha inicial das contas demo (somente local): {DEMO_PASSWORD}')
        self.stdout.write('Contas e conteúdo demo existentes são preservados, inclusive senhas alteradas.')
        for label, count in sorted(result['content'].items()):
            self.stdout.write(f'{label}: {count}')
