FROM php:8.4-cli

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    unzip \
    curl \
    libicu-dev \
    libzip-dev \
    libxml2-dev \
    libonig-dev \
    libpng-dev \
    libjpeg62-turbo-dev \
    libfreetype6-dev \
    libsqlite3-dev \
    sqlite3 \
    libpq-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j1 intl zip mbstring gd pdo_sqlite pdo_pgsql \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Copy composer files first for better layer caching
COPY composer.json composer.lock* ./

# Install PHP dependencies (skip scripts on first pass to avoid artisan errors)
RUN composer install --no-dev --prefer-dist --no-interaction \
    --optimize-autoloader --no-progress --no-scripts \
    || composer install --no-dev --prefer-dist --no-interaction \
       --optimize-autoloader --no-progress --no-scripts --ignore-platform-reqs

# Copy the full application
COPY . .

# Fix permissions
RUN mkdir -p storage/logs storage/framework/{cache,sessions,views} bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

# Run post-install scripts now that full app is present
RUN composer run-script post-autoload-dump --no-interaction 2>/dev/null || true

RUN chmod +x docker/render-start.sh

EXPOSE 8000

CMD ["./docker/render-start.sh"]
