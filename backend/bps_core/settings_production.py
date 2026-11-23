"""Production defaults for the container and WSGI/ASGI entry points."""

from django.core.exceptions import ImproperlyConfigured
from .settings import *  # noqa: F403

DEBUG = False
if SECRET_KEY == 'change-me-in-production' or len(SECRET_KEY) < 50:
    raise ImproperlyConfigured('Configure DJANGO_SECRET_KEY com uma chave aleatória de pelo menos 50 caracteres.')
if not ALLOWED_HOSTS or '*' in ALLOWED_HOSTS:
    raise ImproperlyConfigured('Configure os domínios explícitos em DJANGO_ALLOWED_HOSTS.')
if DATABASES['default']['ENGINE'] != 'django.db.backends.postgresql':
    raise ImproperlyConfigured('O ambiente de produção usa PostgreSQL. SQLite é reservado ao desenvolvimento mobile local.')

SECURE_SSL_REDIRECT = env_bool('DJANGO_SECURE_SSL_REDIRECT', True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = int(os.getenv('DJANGO_HSTS_SECONDS', '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = False
SECURE_REFERRER_POLICY = 'same-origin'
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = list(dict.fromkeys([*CORS_ALLOWED_ORIGINS, 'capacitor://localhost', 'https://localhost']))
