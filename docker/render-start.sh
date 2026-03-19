#!/usr/bin/env sh
set -e

trim() {
  # trims leading/trailing whitespace
  # shellcheck disable=SC2001
  printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

strip_wrapping_quotes() {
  # removes one layer of wrapping single/double quotes (if present)
  value="$(trim "$1")"

  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac

  printf '%s' "$value"
}

sanitize_kv_value() {
  # if value looks like "KEY=actual", strip "KEY="
  value="$(strip_wrapping_quotes "$1")"
  key="$2"

  case "$value" in
    "$key="*) value="${value#"$key="}" ;;
  esac

  printf '%s' "$value"
}

sanitize_url_value() {
  # if value looks like "SOME_KEY=postgresql://...", strip everything up to first "="
  value="$(strip_wrapping_quotes "$1")"

  case "$value" in
    *=*://*) value="${value#*=}" ;;
  esac

  printf '%s' "$value"
}

echo "CSPAMS backend starting..."

# --- Environment sanitization (common mis-pastes in Render UI) ---
# 1) Accept DATABASE_URL as an alias for DB_URL.
if [ -z "${DB_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  export DB_URL="$DATABASE_URL"
fi

# 2) Strip accidental "KEY=" prefixes if the value includes them.
if [ -n "${DB_URL:-}" ]; then
  export DB_URL="$(sanitize_url_value "$DB_URL")"
fi

if [ -n "${DB_HOST:-}" ]; then
  export DB_HOST="$(sanitize_kv_value "$DB_HOST" "DB_HOST")"
fi

if [ -n "${DB_PORT:-}" ]; then
  export DB_PORT="$(sanitize_kv_value "$DB_PORT" "DB_PORT")"
fi

if [ -n "${DB_DATABASE:-}" ]; then
  export DB_DATABASE="$(sanitize_kv_value "$DB_DATABASE" "DB_DATABASE")"
fi

if [ -n "${DB_USERNAME:-}" ]; then
  export DB_USERNAME="$(sanitize_kv_value "$DB_USERNAME" "DB_USERNAME")"
fi

if [ -n "${DB_PASSWORD:-}" ]; then
  export DB_PASSWORD="$(sanitize_kv_value "$DB_PASSWORD" "DB_PASSWORD")"
fi

if [ -n "${DB_SSLMODE:-}" ]; then
  export DB_SSLMODE="$(sanitize_kv_value "$DB_SSLMODE" "DB_SSLMODE")"
fi

# 3) If DB_URL is missing but DB_DATABASE looks like a URL, treat it as DB_URL.
if [ -z "${DB_URL:-}" ] && [ -n "${DB_DATABASE:-}" ]; then
  case "$DB_DATABASE" in
    *://*)
      echo "Detected DB_DATABASE looks like a URL; using it as DB_URL."
      export DB_URL="$(sanitize_url_value "$DB_DATABASE")"
      ;;
  esac
fi

# 4) If APP_KEY is missing or mistakenly set to the command string, generate an ephemeral key.
if [ -z "${APP_KEY:-}" ] || [ "$(trim "$APP_KEY")" = "php artisan key:generate --show" ]; then
  echo "APP_KEY is missing/invalid; generating an ephemeral key for this instance."
  export APP_KEY="$(php artisan key:generate --show --no-ansi 2>/dev/null | tail -n 1)"
fi

if [ "${CSPAMS_AUTO_MIGRATE:-true}" != "false" ]; then
  echo "Running migrations..."
  php artisan migrate --force
fi

if [ "${CSPAMS_AUTO_SEED:-false}" = "true" ]; then
  echo "Seeding database..."
  php artisan db:seed --force
fi

echo "Starting HTTP server..."
exec php artisan serve --host=0.0.0.0 --port="${PORT:-10000}"
