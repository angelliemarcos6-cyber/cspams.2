#!/usr/bin/env bash

echo "Starting Laravel application on Render..."

# Install dependencies if needed
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader || true

# Cache config and routes (ignore errors)
php artisan config:cache || true
php artisan route:cache || true

# Run migrations (ignore errors on first deploy if DB is not ready)
php artisan migrate --force || echo "Migration skipped or failed - continuing..."

# Start the server using Render's assigned port
php artisan serve --host=0.0.0.0 --port=${PORT:-8000}
