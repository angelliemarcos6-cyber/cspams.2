#!/usr/bin/env bash

echo "=========================================="
echo "🚀 Starting Laravel application on Render..."
echo "Current PORT: ${PORT:-8000}"
echo "Current directory: $(pwd)"
echo "=========================================="

# Install dependencies safely
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader || true

# Cache config and routes safely
php artisan config:cache || true
php artisan route:cache || true

# Run migrations safely
php artisan migrate --force || echo "⚠️ Migration failed or skipped - continuing..."

echo "✅ Setup completed. Starting server on port ${PORT:-8000}..."

# Most reliable way on Render (php built-in server)
exec php -S 0.0.0.0:${PORT:-8000} -t public
