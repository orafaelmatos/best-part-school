#!/bin/sh
set -eu

if [ "${DJANGO_MIGRATE_ON_START:-1}" = "1" ]; then
  python manage.py migrate --noinput
fi

if [ "${DJANGO_COLLECTSTATIC_ON_START:-1}" = "1" ]; then
  python manage.py collectstatic --noinput
fi

exec gunicorn bps_core.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers ${GUNICORN_WORKERS:-3} \
  --timeout ${GUNICORN_TIMEOUT:-120}
