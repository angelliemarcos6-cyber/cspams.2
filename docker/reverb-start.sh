#!/usr/bin/env sh
set -eu

. /var/www/html/docker/common-env.sh

echo "CSPAMS Reverb service starting..."
sanitize_runtime_environment

php artisan optimize:clear
php artisan config:cache

exec php artisan reverb:start --host=0.0.0.0 --port="${REVERB_PORT:-8080}"
