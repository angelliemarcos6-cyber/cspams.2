<?php

return [
    'monitor' => [
        // Enforce MFA challenge for division-level monitor logins.
        'enabled' => (bool) env('CSPAMS_MONITOR_MFA_ENABLED', true),

        // One-time MFA code lifetime in minutes.
        'code_ttl_minutes' => max(1, (int) env('CSPAMS_MONITOR_MFA_TTL_MINUTES', 10)),

        // Maximum verification attempts per challenge before invalidation.
        'max_attempts' => max(1, (int) env('CSPAMS_MONITOR_MFA_MAX_ATTEMPTS', 5)),

        // Optional fixed code for local/dev/testing. Keep empty in production.
        'test_code' => env('CSPAMS_MONITOR_MFA_TEST_CODE'),
    ],
];
