<?php

return [
    'login' => [
        // Layer a longer-lived identifier lockout on top of the per-minute throttle.
        'attempt_lockout_threshold' => max(3, (int) env('CSPAMS_AUTH_LOGIN_FAILURE_LOCKOUT_THRESHOLD', 8)),
        'attempt_lockout_minutes' => max(1, (int) env('CSPAMS_AUTH_LOGIN_FAILURE_LOCKOUT_MINUTES', 15)),
    ],

    'transport' => [
        // Allow explicit bearer fallback for deployments where browser cookies cannot persist reliably.
        'issue_token_fallback' => (bool) env('CSPAMS_AUTH_TOKEN_FALLBACK', true),
    ],

    'alerting' => [
        'enabled' => (bool) env('CSPAMS_AUTH_SECURITY_ALERTS_ENABLED', true),

        // Prevent repeated identical alerts from spamming recipients.
        'dedupe_ttl_seconds' => max(30, (int) env('CSPAMS_AUTH_SECURITY_ALERTS_DEDUPE_TTL', 300)),

        // Role names that should receive security anomaly alerts.
        'monitor_role_aliases' => [
            'monitor',
            'Monitor',
            'division monitor',
            'Division Monitor',
        ],

        // Action-specific alert behavior. Keys must match auth audit `action` values.
        'actions' => [
            'auth.login.locked_out' => [
                'severity' => 'high',
                'notify_monitors' => true,
                'notify_subject' => false,
                'title' => 'Login lockout detected',
            ],
            'auth.mfa_verify.locked_out' => [
                'severity' => 'high',
                'notify_monitors' => true,
                'notify_subject' => true,
                'title' => 'MFA lockout detected',
            ],
            'auth.login.suspicious_detected' => [
                'severity' => 'critical',
                'notify_monitors' => true,
                'notify_subject' => true,
                'title' => 'Suspicious login contained',
            ],
            'auth.mfa_verify.suspicious_detected' => [
                'severity' => 'critical',
                'notify_monitors' => true,
                'notify_subject' => true,
                'title' => 'Suspicious MFA login contained',
            ],
            'auth.mfa_reset.complete.suspicious_detected' => [
                'severity' => 'critical',
                'notify_monitors' => true,
                'notify_subject' => true,
                'title' => 'Suspicious MFA reset completion contained',
            ],
        ],
    ],
];
