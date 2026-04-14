#!/usr/bin/env bash

echo "Starting Laravel application on Render..."

# Run composer install if needed
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader

# Cache config and routes
php artisan config:cache
php artisan route:cache

# Run migrations
php artisan migrate --force

# Start the server using Render's assigned port
php artisan serve --host=0.0.0.0 --port=${PORT:-8000}
