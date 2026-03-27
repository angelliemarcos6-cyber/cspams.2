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

# --- Mail environment sanitization (common mis-pastes in Render UI) ---
# 1) Accept MAIL_ADDRESS as an alias for MAIL_FROM_ADDRESS.
if [ -z "${MAIL_FROM_ADDRESS:-}" ] && [ -n "${MAIL_ADDRESS:-}" ]; then
  export MAIL_FROM_ADDRESS="$(sanitize_kv_value "$MAIL_ADDRESS" "MAIL_ADDRESS")"
fi

# 2) Accept RESEND_API_KEY as an alias for RESEND_KEY (Laravel config prefers RESEND_KEY).
if [ -z "${RESEND_KEY:-}" ] && [ -n "${RESEND_API_KEY:-}" ]; then
  export RESEND_KEY="$(sanitize_kv_value "$RESEND_API_KEY" "RESEND_API_KEY")"
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

# 4) APP_KEY must be persistent in production-like environments.
if [ -z "${APP_KEY:-}" ] || [ "$(trim "$APP_KEY")" = "php artisan key:generate --show" ]; then
  echo "APP_KEY is missing or invalid. Set a persistent APP_KEY in the environment."
  exit 1
fi

if [ "${CSPAMS_AUTO_MIGRATE:-true}" != "false" ]; then
  echo "Running migrations..."
  php artisan migrate --force
fi

echo "Starting HTTP server..."
php artisan serve --host=0.0.0.0 --port="${PORT:-10000}" &
server_pid=$!

trap 'echo "Stopping HTTP server..."; kill -TERM "$server_pid" 2>/dev/null || true' INT TERM

if [ "${CSPAMS_AUTO_SEED:-false}" = "true" ]; then
  echo "Seeding database..."
  if ! php artisan db:seed --force; then
    echo "Seeding failed; server will continue running."
  fi
fi

wait "$server_pid"
