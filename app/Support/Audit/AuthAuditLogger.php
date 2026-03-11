<?php

namespace App\Support\Audit;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class AuthAuditLogger
{
    /**
     * @param array<string, mixed> $metadata
     */
    public static function record(
        Request $request,
        string $action,
        string $outcome,
        ?User $user = null,
        ?string $role = null,
        ?string $identifier = null,
        array $metadata = [],
    ): void {
        if (! class_exists(AuditLog::class)) {
            return;
        }

        $normalizedRole = self::normalizeRole($role ?? (string) $request->input('role', ''));
        $normalizedIdentifier = self::normalizeIdentifier(
            $identifier ?? (string) $request->input('login', ''),
            $normalizedRole,
        );

        AuditLog::query()->create([
            'user_id' => $user?->id,
            'action' => $action,
            'auditable_type' => $user ? $user::class : 'auth',
            'auditable_id' => $user?->id,
            'metadata' => array_merge([
                'category' => 'auth',
                'outcome' => $outcome,
                'role' => $normalizedRole,
                'identifier' => $normalizedIdentifier,
            ], $metadata),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);
    }

    private static function normalizeRole(string $role): ?string
    {
        $normalized = strtolower(trim($role));

        return $normalized !== '' ? $normalized : null;
    }

    private static function normalizeIdentifier(string $identifier, ?string $role): ?string
    {
        $normalized = trim($identifier);
        if ($normalized === '') {
            return null;
        }

        if ($role === 'school_head') {
            return preg_match('/^\d{6}$/', $normalized) === 1 ? $normalized : null;
        }

        return strtolower($normalized);
    }
}
