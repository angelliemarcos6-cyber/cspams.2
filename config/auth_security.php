<?php

$resetUiEnabled = static function (): bool {
    $raw = strtolower(trim((string) env('CSPAMS_ENFORCE_REQUIRED_PASSWORD_RESET', 'true')));

    return ! in_array($raw, ['0', 'false', 'off', 'no'], true);
};

return [
    'login' => [
        // Fallback threshold when no per-role override is configured.
        'attempt_lockout_threshold' => max(3, (int) env('CSPAMS_AUTH_LOGIN_FAILURE_LOCKOUT_THRESHOLD', 8)),

        // Layer a longer-lived identifier lockout on top of the per-minute throttle.
        'attempt_lockout_minutes' => max(1, (int) env('CSPAMS_AUTH_LOGIN_FAILURE_LOCKOUT_MINUTES', 15)),

        'roles' => [
            'monitor' => [
                'attempt_lockout_threshold' => max(3, (int) env('CSPAMS_AUTH_MONITOR_LOGIN_FAILURE_LOCKOUT_THRESHOLD', 8)),
            ],
            'school_head' => [
                'attempt_lockout_threshold' => max(3, (int) env('CSPAMS_AUTH_SCHOOL_HEAD_LOGIN_FAILURE_LOCKOUT_THRESHOLD', 5)),
            ],
        ],
    ],

    'password_reset' => [
        // Controls whether the SPA renders the in-app password reset prompt after login is blocked.
        // Access is still blocked whenever must_reset_password is true.
        'show_in_app_reset_ui' => $resetUiEnabled(),
    ],

    'setup_links' => [
        // School Head setup links expire after 72 hours by default.
        'ttl_hours' => max(1, (int) env('CSPAMS_SETUP_LINK_TTL_HOURS', 72)),
    ],

    'diagnostics' => [
        // Temporary visibility into cookie-vs-bearer resolution. Keep disabled by default.
        'log_auth_mode' => (bool) env('CSPAMS_AUTH_DEBUG_LOG_MODE', false),
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
