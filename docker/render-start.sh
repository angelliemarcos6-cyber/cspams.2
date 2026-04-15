#!/usr/bin/env bash

echo "=========================================="
echo "🚀 Starting Laravel application on Render..."
echo "Current PORT: ${PORT:-8000}"
echo "Current working directory: $(pwd)"
echo "=========================================="

# Install dependencies safely
echo "Running composer install..."
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader || true

# Cache config and routes safely
echo "Caching config..."
php artisan config:cache || true

echo "Caching routes..."
php artisan route:cache || true

# Run migrations safely
echo "Running migrations..."
php artisan migrate --force || echo "⚠️ Migration failed or skipped - continuing..."

echo "✅ All setup completed. Starting server..."

# Final command - most reliable way on Render
echo "Starting PHP built-in server on 0.0.0.0:${PORT:-8000}..."
exec php -S 0.0.0.0:${PORT:-8000} -t public
