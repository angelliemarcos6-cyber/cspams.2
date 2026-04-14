#!/usr/bin/env bash

echo "=========================================="
echo "Starting Laravel application on Render..."
echo "Current PORT: ${PORT:-8000}"
echo "=========================================="

# Install dependencies if needed
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader || true

# Cache config and routes
php artisan config:cache || true
php artisan route:cache || true

# Run migrations (continue even if it fails)
php artisan migrate --force || echo "Migrations skipped or failed - continuing..."

# Final start command using Render's PORT
echo "Starting PHP server on port ${PORT:-8000}..."
exec php artisan serve --host=0.0.0.0 --port=${PORT:-8000}
