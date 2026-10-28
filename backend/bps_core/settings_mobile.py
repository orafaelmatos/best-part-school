"""Isolated local backend for mobile development; never use for deployment."""

import ipaddress

from django.core.exceptions import ImproperlyConfigured

from .settings import *  # noqa: F403

# All persistence is explicit and local, regardless of backend/.env or shell DB settings.
LOCAL_MOBILE_MODE = True
LOCAL_MOBILE_ROOT = BASE_DIR / '.local-mobile'
LOCAL_MOBILE_ROOT.mkdir(exist_ok=True)
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': LOCAL_MOBILE_ROOT / 'db.sqlite3',
    },
}
MEDIA_ROOT = LOCAL_MOBILE_ROOT / 'media'
STATIC_ROOT = LOCAL_MOBILE_ROOT / 'staticfiles'
MIDDLEWARE = [item for item in MIDDLEWARE if item != 'whitenoise.middleware.WhiteNoiseMiddleware']
ROOT_URLCONF = 'bps_core.urls_mobile'

DEBUG = True
SECRET_KEY = 'local-mobile-development-only-do-not-deploy'
ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]']
for local_host in os.getenv('BPS_MOBILE_ALLOWED_HOSTS', '').split(','):
    local_host = local_host.strip()
    if not local_host or local_host in ALLOWED_HOSTS:
        continue
    try:
        address = ipaddress.ip_address(local_host.strip('[]'))
    except ValueError as error:
        raise ImproperlyConfigured('BPS_MOBILE_ALLOWED_HOSTS aceita apenas endereços IP locais.') from error
    if not address.is_private:
        raise ImproperlyConfigured('BPS_MOBILE_ALLOWED_HOSTS aceita apenas endereços IP locais.')
    ALLOWED_HOSTS.append(local_host)
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'capacitor://localhost',
    'https://localhost',
]
CORS_ALLOWED_ORIGIN_REGEXES = []
CSRF_TRUSTED_ORIGINS = ['http://localhost:8080', 'http://127.0.0.1:8080']
SECURE_PROXY_SSL_HEADER = None
USE_X_FORWARDED_HOST = False
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Shared services instantiate the OpenAI client during import. Keep it pointed at
# a closed local port rather than using credentials inherited from backend/.env.
os.environ['OPENAI_API_KEY'] = 'local-mobile-disabled'
os.environ['OPENAI_BASE_URL'] = 'http://127.0.0.1:9/v1'

