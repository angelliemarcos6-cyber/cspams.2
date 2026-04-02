#!/usr/bin/env sh

trim() {
  printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

strip_wrapping_quotes() {
  value="$(trim "$1")"

  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac

  printf '%s' "$value"
}

sanitize_kv_value() {
  value="$(strip_wrapping_quotes "$1")"
  key="$2"

  case "$value" in
    "$key="*) value="${value#"$key="}" ;;
  esac

  printf '%s' "$value"
}

sanitize_url_value() {
  value="$(strip_wrapping_quotes "$1")"

  case "$value" in
    *=*://*) value="${value#*=}" ;;
  esac

  printf '%s' "$value"
}

sanitize_runtime_environment() {
  if [ -z "${DB_URL:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
    export DB_URL="$DATABASE_URL"
  fi

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

  if [ -z "${MAIL_FROM_ADDRESS:-}" ] && [ -n "${MAIL_ADDRESS:-}" ]; then
    export MAIL_FROM_ADDRESS="$(sanitize_kv_value "$MAIL_ADDRESS" "MAIL_ADDRESS")"
  fi

  if [ -z "${RESEND_KEY:-}" ] && [ -n "${RESEND_API_KEY:-}" ]; then
    export RESEND_KEY="$(sanitize_kv_value "$RESEND_API_KEY" "RESEND_API_KEY")"
  fi

  if [ -z "${DB_URL:-}" ] && [ -n "${DB_DATABASE:-}" ]; then
    case "$DB_DATABASE" in
      *://*)
        echo "Detected DB_DATABASE looks like a URL; using it as DB_URL."
        export DB_URL="$(sanitize_url_value "$DB_DATABASE")"
        ;;
    esac
  fi

  if [ -z "${APP_KEY:-}" ] || [ "$(trim "${APP_KEY:-}")" = "php artisan key:generate --show" ]; then
    echo "APP_KEY is missing or invalid. Set a persistent APP_KEY in the environment."
    exit 1
  fi
}
