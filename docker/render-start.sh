#!/usr/bin/env bash

echo "=========================================="
echo "Starting Laravel application on Render..."
echo "Current PORT: ${PORT:-8000}"
echo "=========================================="

# Install dependencies (safe)
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader || true

# Cache (safe)
php artisan config:cache || true
php artisan route:cache || true

# Migrations (safe)
php artisan migrate --force || echo "Migration failed or skipped - continuing..."

echo "Starting PHP built-in server on port ${PORT:-8000}..."

# Most reliable way on Render
exec php -S 0.0.0.0:${PORT:-8000} -t public
