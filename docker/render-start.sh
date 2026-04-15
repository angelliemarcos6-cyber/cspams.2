#!/usr/bin/env bash

set -euo pipefail

echo "=========================================="
echo "Starting Laravel application on Render"
echo "Port: ${PORT:-8000}"
echo "Directory: $(pwd)"
echo "=========================================="

echo "[1/5] Clearing Laravel caches"
php artisan optimize:clear
php artisan config:clear
php artisan route:clear
php artisan cache:clear
php artisan view:clear

echo "[2/5] Installing PHP dependencies"
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader

echo "[3/5] Rebuilding fresh caches"
php artisan config:cache
php artisan route:cache

echo "[4/5] Running database migrations"
php artisan migrate --force

echo "[5/5] Starting PHP server"
exec php -S 0.0.0.0:${PORT:-8000} -t public
