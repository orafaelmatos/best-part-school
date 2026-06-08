#!/bin/sh
set -eu

cat >/usr/share/nginx/html/env-config.js <<EOF
window.__APP_CONFIG__ = {
  VITE_API_URL: "${VITE_API_URL:-http://localhost:8000/api/}",
  VITE_MEDIA_BASE_URL: "${VITE_MEDIA_BASE_URL:-http://localhost:8000}"
};
EOF
