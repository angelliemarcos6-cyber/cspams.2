#!/usr/bin/env sh
set -e

echo "CSPAMS backend starting…"

if [ "${CSPAMS_AUTO_MIGRATE:-true}" != "false" ]; then
  echo "Running migrations…"
  php artisan migrate --force
fi

if [ "${CSPAMS_AUTO_SEED:-false}" = "true" ]; then
  echo "Seeding database…"
  php artisan db:seed --force
fi

echo "Starting HTTP server…"
exec php artisan serve --host=0.0.0.0 --port="${PORT:-10000}"

