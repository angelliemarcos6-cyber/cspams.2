#!/usr/bin/env bash

echo "Running composer install..."
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader

echo "Caching Laravel config..."
php artisan config:cache

echo "Caching routes..."
php artisan route:cache

echo "Running migrations..."
php artisan migrate --force

echo "Starting PHP server..."
php artisan serve --host=0.0.0.0 --port=8000
