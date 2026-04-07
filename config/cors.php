<?php

$defaultAllowedOrigins = implode(',', [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:4173',
    'http://localhost:4173',
]);

$allowedOrigins = array_values(array_filter(array_map(
    static fn (string $origin): string => trim($origin),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', $defaultAllowedOrigins)),
)));

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie', 'broadcasting/auth'],

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
