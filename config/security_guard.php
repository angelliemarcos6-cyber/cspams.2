<?php

return [
    'sql_injection_guard' => [
        'enabled' => (bool) env('CSPAMS_SQLI_GUARD_ENABLED', true),

        // Skip common credential fields to reduce false positives for strong passwords.
        'excluded_keys' => [
            'password',
            'current_password',
            'new_password',
            'new_password_confirmation',
            'approval_token',
        ],

        'max_input_length' => max(256, (int) env('CSPAMS_SQLI_GUARD_MAX_INPUT_LENGTH', 4000)),

        // High-confidence SQL injection payload signatures.
        'patterns' => [
            "/(?:'|%27)\\s*(?:or|and)\\s*(?:\\d+|'[^']*')\\s*=\\s*(?:\\d+|'[^']*')/i",
            "/\\bunion(?:\\s+all)?\\s+select\\b/i",
            "/;\\s*(?:select|insert|update|delete|drop|alter|truncate)\\b/i",
            "/\\b(?:drop|truncate|alter)\\s+table\\b/i",
            "/\\b(?:sleep|benchmark)\\s*\\(\\s*\\d+/i",
            "/\\b(?:information_schema|xp_cmdshell)\\b/i",
            "/(?:^|\\s)--\\s*(?:$|\\r?\\n)/",
            "/\\/\\*.*\\*\\//s",
        ],
    ],
];
