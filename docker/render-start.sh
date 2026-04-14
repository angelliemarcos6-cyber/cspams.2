#!/usr/bin/env sh
set -eu

. /var/www/html/docker/common-env.sh

echo "CSPAMS web container starting..."
sanitize_runtime_environment

export PORT="${PORT:-10000}"

mkdir -p \
  /run/nginx \
  /var/lib/nginx/tmp/client_body \
  /var/lib/nginx/tmp/fastcgi \
  /var/lib/nginx/tmp/proxy \
  /var/lib/nginx/tmp/scgi \
  /var/lib/nginx/tmp/uwsgi \
  /var/log/supervisor \
  /var/www/html/storage/logs \
  /var/www/html/bootstrap/cache

chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

envsubst '${PORT}' < /etc/nginx/http.d/default.conf.template > /etc/nginx/http.d/default.conf

php artisan optimize:clear
php artisan config:cache
php artisan route:cache

exec /usr/bin/supervisord -c /etc/supervisord.conf
