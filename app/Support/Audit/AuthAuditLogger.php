<?php

namespace App\Support\Audit;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

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

        $normalizedRole = self::resolveRole($request, $user, $role);
        $normalizedIdentifier = self::resolveIdentifier(
            $request,
            $user,
            $identifier,
            $normalizedRole,
        );
        $normalizedIpAddress = self::normalizeIpAddress($request->ip());
        $normalizedUserAgent = self::normalizeUserAgent($request->userAgent());

        $normalizedMetadata = array_merge([
            'category' => 'auth',
            'event' => $action,
            'event_group' => self::resolveEventGroup($action),
            'outcome' => $outcome,
            'role' => $normalizedRole,
            'identifier' => $normalizedIdentifier,
            'ip_address' => $normalizedIpAddress,
            'user_agent' => $normalizedUserAgent,
            'occurred_at' => now()->toISOString(),
        ], $metadata);

        $auditLog = AuditLog::query()->create([
            'user_id' => $user?->id,
            'action' => $action,
            'auditable_type' => $user ? $user::class : 'auth',
            'auditable_id' => $user?->id,
            'metadata' => $normalizedMetadata,
            'ip_address' => $normalizedIpAddress,
            'user_agent' => $normalizedUserAgent,
            'created_at' => now(),
        ]);

        try {
            AuthSecurityAlertManager::dispatch(
                $request,
                $auditLog,
                $action,
                $outcome,
                $user,
                $normalizedRole,
                $normalizedIdentifier,
                $normalizedMetadata,
            );
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    private static function normalizeRole(string $role): ?string
    {
        $normalized = strtolower(trim($role));

        return $normalized !== '' ? $normalized : null;
    }

    private static function resolveRole(Request $request, ?User $user, ?string $role): ?string
    {
        $normalizedRole = self::normalizeRole($role ?? (string) $request->input('role', ''));
        if ($normalizedRole !== null) {
            return $normalizedRole;
        }

        if (! $user) {
            return null;
        }

        if (UserRoleResolver::has($user, UserRoleResolver::MONITOR)) {
            return UserRoleResolver::MONITOR;
        }

        if (UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)) {
            return UserRoleResolver::SCHOOL_HEAD;
        }

        return null;
    }

    private static function resolveIdentifier(
        Request $request,
        ?User $user,
        ?string $identifier,
        ?string $role,
    ): ?string {
        $rawIdentifier = trim((string) $identifier);
        if ($rawIdentifier === '') {
            $rawIdentifier = trim((string) $request->input('login', ''));
        }

        if ($rawIdentifier === '' && $user && is_string($user->email)) {
            $rawIdentifier = trim($user->email);
        }

        return self::normalizeIdentifier($rawIdentifier, $role);
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

    private static function resolveEventGroup(string $action): string
    {
        $normalizedAction = Str::lower(trim($action));

        if (str_contains($normalizedAction, 'mfa')) {
            return 'mfa';
        }

        if (str_contains($normalizedAction, 'login')) {
            return 'login';
        }

        if (str_contains($normalizedAction, 'password_reset')) {
            return 'password_reset';
        }

        if (str_contains($normalizedAction, 'token_refresh')) {
            return 'token_refresh';
        }

        if (str_contains($normalizedAction, 'session')) {
            return 'session';
        }

        if (str_contains($normalizedAction, 'logout')) {
            return 'logout';
        }

        return 'auth';
    }

    private static function normalizeIpAddress(?string $ipAddress): ?string
    {
        $normalized = trim((string) $ipAddress);

        return $normalized !== '' ? $normalized : null;
    }

    private static function normalizeUserAgent(?string $userAgent): ?string
    {
        $normalized = trim((string) $userAgent);
        if ($normalized === '') {
            return null;
        }

        return Str::limit($normalized, 500, '');
    }
}
