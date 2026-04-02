#!/usr/bin/env sh
set -eu

. /var/www/html/docker/common-env.sh

echo "CSPAMS queue worker starting..."
sanitize_runtime_environment

php artisan optimize:clear
php artisan config:cache

exec php artisan queue:work \
  --verbose \
  --queue="${CSPAMS_QUEUE_NAMES:-mail,default}" \
  --tries="${CSPAMS_QUEUE_TRIES:-3}" \
  --timeout="${CSPAMS_QUEUE_TIMEOUT:-90}" \
  --sleep="${CSPAMS_QUEUE_SLEEP:-3}"
