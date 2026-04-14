import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bps_core.settings')
django.setup()

from accounts.models import User

# Professor
teacher, created = User.objects.get_or_create(
    email='professor@teste.com', 
    defaults={'name': 'Professor Teste', 'role': 'teacher'}
)
if created:
    teacher.set_password('teste123')
    teacher.save()
elif not teacher.check_password('teste123'):
    teacher.set_password('teste123')
    teacher.save()

# Aluno
student, created = User.objects.get_or_create(
    email='aluno@teste.com', 
    defaults={'name': 'Aluno Teste', 'role': 'student', 'level': 'B1'}
)
if created:
    student.set_password('teste123')
    student.save()
elif not student.check_password('teste123'):
    student.set_password('teste123')
    student.save()

print("✅ Contas criadas/atualizadas!")
print("Professor: professor@teste.com / Senha: teste123")
print("Aluno: aluno@teste.com / Senha: teste123")