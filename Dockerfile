FROM php:8.4-fpm-alpine

RUN apk add --no-cache \
    curl \
    freetype-dev \
    gettext \
    git \
    icu-dev \
    libjpeg-turbo-dev \
    libpng-dev \
    libzip-dev \
    nginx \
    oniguruma-dev \
    postgresql-dev \
    sqlite-dev \
    supervisor \
    unzip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(getconf _NPROCESSORS_ONLN)" intl zip mbstring gd pdo_pgsql pdo_sqlite

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY . .

RUN composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader --no-progress \
    && mkdir -p \
        /run/nginx \
        /var/lib/nginx/tmp/client_body \
        /var/lib/nginx/tmp/fastcgi \
        /var/lib/nginx/tmp/proxy \
        /var/lib/nginx/tmp/scgi \
        /var/lib/nginx/tmp/uwsgi \
        /var/log/supervisor \
        storage/logs \
        bootstrap/cache \
    && chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

COPY docker/nginx/default.conf.template /etc/nginx/http.d/default.conf.template
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/render-start.sh /usr/local/bin/render-start.sh
COPY docker/worker-start.sh /usr/local/bin/worker-start.sh
COPY docker/reverb-start.sh /usr/local/bin/reverb-start.sh

RUN chmod +x \
    /usr/local/bin/render-start.sh \
    /usr/local/bin/worker-start.sh \
    /usr/local/bin/reverb-start.sh

CMD ["/usr/local/bin/render-start.sh"]
