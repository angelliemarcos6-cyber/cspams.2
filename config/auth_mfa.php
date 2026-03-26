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

        // Queue connection used for MFA email delivery. Leave empty to use the default
        // queue, except "sync" is automatically upgraded to "database" to avoid blocking login.
        'queue_connection' => env('CSPAMS_MONITOR_MFA_QUEUE_CONNECTION'),

        // Queue name used for MFA email delivery jobs.
        'queue' => env('CSPAMS_MONITOR_MFA_QUEUE', 'mail'),

        // One-time backup code count to issue on generation/reset.
        'backup_codes_count' => max(4, (int) env('CSPAMS_MONITOR_MFA_BACKUP_CODES_COUNT', 8)),

        // Pending reset-request validity before admin approval is required again.
        'reset_request_ttl_minutes' => max(5, (int) env('CSPAMS_MONITOR_MFA_RESET_REQUEST_TTL_MINUTES', 1440)),

        // Approved reset token validity window.
        'reset_approval_ttl_minutes' => max(1, (int) env('CSPAMS_MONITOR_MFA_RESET_APPROVAL_TTL_MINUTES', 60)),

        // Optional fixed approval token for local/dev/testing.
        'reset_test_approval_token' => env('CSPAMS_MONITOR_MFA_RESET_TEST_APPROVAL_TOKEN'),
    ],
];
