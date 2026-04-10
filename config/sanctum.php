<?php

use Laravel\Sanctum\Sanctum;

$normalizeStatefulDomain = static function (?string $url): ?string {
    $url = trim((string) $url);
    if ($url === '') {
        return null;
    }

    if (! str_contains($url, '://')) {
        return strtolower(trim($url, '/'));
    }

    $parsed = parse_url($url);
    if (! is_array($parsed) || ! isset($parsed['host'])) {
        return null;
    }

    $host = strtolower(trim((string) $parsed['host']));
    if ($host === '') {
        return null;
    }

    $port = isset($parsed['port']) && is_numeric($parsed['port'])
        ? (int) $parsed['port']
        : null;

    return $port === null ? $host : ($host . ':' . $port);
};

$defaultStatefulDomains = array_values(array_filter(array_unique([
    'localhost',
    'localhost:3000',
    'localhost:4173',
    'localhost:5173',
    'localhost:8000',
    '127.0.0.1',
    '127.0.0.1:3000',
    '127.0.0.1:4173',
    '127.0.0.1:5173',
    '127.0.0.1:8000',
    '::1',
    $normalizeStatefulDomain(env('APP_URL')),
    $normalizeStatefulDomain(env('FRONTEND_URL')),
    $normalizeStatefulDomain(Sanctum::currentApplicationUrlWithPort()),
])));

return [

    /*
    |--------------------------------------------------------------------------
    | Stateful Domains
    |--------------------------------------------------------------------------
    |
    | Requests from the following domains / hosts will receive stateful API
    | authentication cookies. Typically, these should include your local
    | and production domains which access your API via a frontend SPA.
    |
    */

    'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', implode(',', $defaultStatefulDomains))),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Guards
    |--------------------------------------------------------------------------
    |
    | This array contains the authentication guards that will be checked when
    | Sanctum is trying to authenticate a request. If none of these guards
    | are able to authenticate the request, Sanctum will use the bearer
    | token that's present on an incoming request for authentication.
    |
    */

    'guard' => ['web'],

    /*
    |--------------------------------------------------------------------------
    | Expiration Minutes
    |--------------------------------------------------------------------------
    |
    | This legacy fallback remains set for non-role-aware clients, while CSPAMS
    | issues role-specific token expirations below and stores them on expires_at.
    |
    */

    'expiration' => (static function (): ?int {
        $minutes = (int) env('SANCTUM_TOKEN_EXPIRATION', (int) env('SANCTUM_MONITOR_TOKEN_EXPIRATION', 1440));

        return $minutes > 0 ? $minutes : null;
    })(),

    /*
    |--------------------------------------------------------------------------
    | Role-Specific Expiration Minutes
    |--------------------------------------------------------------------------
    |
    | Monitor and School Head dashboard tokens receive different TTL values.
    | These values are applied when tokens are issued and when expiry is checked.
    |
    */

    'expirations' => [
        'monitor' => max(1, (int) env('SANCTUM_MONITOR_TOKEN_EXPIRATION', 1440)),
        'school_head' => max(1, (int) env('SANCTUM_SCHOOL_HEAD_TOKEN_EXPIRATION', 480)),
    ],

    /*
    |--------------------------------------------------------------------------
    | Rotation Buffer Minutes
    |--------------------------------------------------------------------------
    |
    | Token clients should refresh before expiry. This controls how many
    | minutes before expiration clients should request rotation/re-issue.
    |
    */

    'refresh_before' => env('SANCTUM_TOKEN_REFRESH_BEFORE_MINUTES', 3),

    /*
    |--------------------------------------------------------------------------
    | Token Prefix
    |--------------------------------------------------------------------------
    |
    | Sanctum can prefix new tokens in order to take advantage of numerous
    | security scanning initiatives maintained by open source platforms
    | that notify developers if they commit tokens into repositories.
    |
    | See: https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning
    |
    */

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Middleware
    |--------------------------------------------------------------------------
    |
    | When authenticating your first-party SPA with Sanctum you may need to
    | customize some of the middleware Sanctum uses while processing the
    | request. You may change the middleware listed below as required.
    |
    */

    'middleware' => [
        'authenticate_session' => Laravel\Sanctum\Http\Middleware\AuthenticateSession::class,
        'encrypt_cookies' => Illuminate\Cookie\Middleware\EncryptCookies::class,
        'validate_csrf_token' => Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
    ],

];
