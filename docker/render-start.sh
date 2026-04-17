#!/usr/bin/env sh
set -eu

echo "========== RENDER START DEBUG =========="
echo "Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "User: $(whoami)"
echo "PWD: $(pwd)"
echo "PORT: ${PORT:-10000}"
echo "APP_ENV: ${APP_ENV:-not-set}"
echo "----------------------------------------"
echo "[DEBUG] ls -la (current dir)"
ls -la
echo "----------------------------------------"

echo "[DEBUG] Checking Laravel critical paths..."
for p in artisan public public/index.php bootstrap/cache storage; do
  if [ -e "$p" ]; then
    echo "OK: $p exists"
  else
    echo "ERROR: $p is missing"
  fi
done
echo "----------------------------------------"

if [ ! -d public ]; then
  echo "FATAL: Directory 'public' does not exist in $(pwd)"
  echo "[DEBUG] /var/www listing:"
  ls -la /var/www || true
  echo "[DEBUG] /var/www/html listing:"
  ls -la /var/www/html || true
  exit 1
fi

echo "[1/6] Prepare writable dirs"
mkdir -p \
  storage/framework/cache \
  storage/framework/sessions \
  storage/framework/views \
  bootstrap/cache
chmod -R ug+rw storage bootstrap/cache || true

echo "[2/6] Install composer dependencies (safe rerun)"
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader

echo "[3/6] Clear Laravel caches first"
php artisan optimize:clear || true

echo "[4/6] Run database migrations"
if ! php artisan migrate --force; then
  echo "FATAL: database migrations failed"
  exit 1
fi

echo "[5/6] Rebuild caches"
php artisan config:cache || true
php artisan route:cache || true
php artisan view:cache || true

echo "[6/6] Starting PHP server"
exec php -S 0.0.0.0:${PORT:-10000} -t public public/index.php
