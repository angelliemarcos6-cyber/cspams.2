#!/usr/bin/env bash

echo "=========================================="
echo "Starting Laravel application on Render..."
echo "Current PORT: ${PORT:-8000}"
echo "=========================================="

composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader || true

php artisan config:cache || true
php artisan route:cache || true

php artisan migrate --force || echo "Migrations skipped or failed - continuing..."

echo "Starting server on port ${PORT:-8000}..."

# Use php built-in server with exec to keep process in foreground
exec php -S 0.0.0.0:${PORT:-8000} -t public
