<?php

$normalizeOrigin = static function (?string $url): ?string {
    $url = trim((string) $url);
    if ($url === '') {
        return null;
    }

    $parsed = parse_url($url);
    if (! is_array($parsed) || ! isset($parsed['scheme'], $parsed['host'])) {
        return null;
    }

    $scheme = strtolower(trim((string) $parsed['scheme']));
    $host = strtolower(trim((string) $parsed['host']));
    if ($scheme === '' || $host === '') {
        return null;
    }

    $port = isset($parsed['port']) && is_numeric($parsed['port'])
        ? (int) $parsed['port']
        : null;
    $defaultPort = match ($scheme) {
        'https' => 443,
        'http' => 80,
        default => null,
    };

    $origin = $scheme . '://' . $host;

    if ($port !== null && ($defaultPort === null || $port !== $defaultPort)) {
        $origin .= ':' . $port;
    }

    return $origin;
};

$defaultAllowedOrigins = implode(',', array_values(array_filter(array_unique([
    'http://127.0.0.1:4173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    $normalizeOrigin(env('FRONTEND_URL')),
]))));

$allowedOrigins = array_values(array_filter(array_map(
    static fn (string $origin): string => trim($origin),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', $defaultAllowedOrigins)),
)));

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [
        'ETag',
        'Last-Modified',
        'X-Sync-Scope',
        'X-Sync-Scope-Key',
        'X-Sync-Record-Count',
        'X-Sync-Etag',
        'X-Synced-At',
    ],

    'max_age' => 0,

    // Cookie-based Sanctum SPA auth requires credentialed cross-origin requests.
    'supports_credentials' => true,
];
