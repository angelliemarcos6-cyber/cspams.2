<?php

namespace App\Support\Audit;

use App\Models\AuditLog;
use App\Models\User;
use App\Notifications\AuthSecurityAlertNotification;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Notification;

class AuthSecurityAlertManager
{
    /**
     * @param array<string, mixed> $metadata
     */
    public static function dispatch(
        Request $request,
        AuditLog $auditLog,
        string $action,
        string $outcome,
        ?User $subjectUser = null,
        ?string $role = null,
        ?string $identifier = null,
        array $metadata = [],
    ): void {
        $rule = self::configuredRuleFor($action, $outcome);
        if ($rule === null) {
            return;
        }

        if (! self::acquireDeduplicatedSlot($request, $action, $outcome, $role, $identifier, $metadata, $rule)) {
            return;
        }

        $recipients = self::resolveRecipients($subjectUser, $rule, $metadata);
        if ($recipients->isEmpty()) {
            return;
        }

        $notification = new AuthSecurityAlertNotification(
            action: $action,
            outcome: $outcome,
            severity: self::stringValue($rule['severity'] ?? null, 'medium'),
            title: self::stringValue($rule['title'] ?? null, 'Authentication security alert'),
            message: self::buildMessage($action, $role, $identifier, $request, $metadata),
            context: [
                'auditLogId' => $auditLog->id,
                'role' => $role,
                'identifier' => $identifier,
                'ipAddress' => $request->ip(),
                'userAgent' => $request->userAgent(),
                'reason' => self::stringValue($metadata['reason'] ?? null),
                'eventGroup' => self::stringValue($metadata['event_group'] ?? null),
            ],
        );

        Notification::send($recipients, $notification);
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function configuredRuleFor(string $action, string $outcome): ?array
    {
        if (! (bool) config('auth_security.alerting.enabled', false)) {
            return null;
        }

        $actions = config('auth_security.alerting.actions', []);
        if (! is_array($actions)) {
            return null;
        }

        $rule = $actions[$action] ?? null;
        if (! is_array($rule)) {
            return null;
        }

        $allowedOutcomes = $rule['outcomes'] ?? null;
        if (is_array($allowedOutcomes) && ! in_array($outcome, $allowedOutcomes, true)) {
            return null;
        }

        return $rule;
    }

    /**
     * @param array<string, mixed> $metadata
     * @param array<string, mixed> $rule
     */
    private static function acquireDeduplicatedSlot(
        Request $request,
        string $action,
        string $outcome,
        ?string $role,
        ?string $identifier,
        array $metadata,
        array $rule,
    ): bool {
        $dedupeSeconds = (int) ($rule['dedupe_ttl_seconds'] ?? config('auth_security.alerting.dedupe_ttl_seconds', 300));
        $dedupeSeconds = max(30, $dedupeSeconds);

        $fingerprintParts = [
            $action,
            $outcome,
            (string) $role,
            (string) $identifier,
            (string) $request->ip(),
            self::stringValue($metadata['reason'] ?? null, ''),
        ];

        $key = 'auth:security-alert:' . sha1(implode('|', $fingerprintParts));

        return Cache::add($key, true, now()->addSeconds($dedupeSeconds));
    }

    /**
     * @param array<string, mixed> $rule
     * @param array<string, mixed> $metadata
     * @return Collection<int, User>
     */
    private static function resolveRecipients(?User $subjectUser, array $rule, array $metadata): Collection
    {
        $recipients = collect();

        if ((bool) ($rule['notify_monitors'] ?? false)) {
            $recipients = $recipients->merge(self::monitorRecipients());
        }

        if ((bool) ($rule['notify_subject'] ?? false) && $subjectUser) {
            $recipients->push($subjectUser);
        }

        $targetUserId = $metadata['target_user_id'] ?? null;
        if (is_numeric($targetUserId)) {
            $targetUser = User::query()->find((int) $targetUserId);
            if ($targetUser) {
                $recipients->push($targetUser);
            }
        }

        /** @var Collection<int, User> $uniqueRecipients */
        $uniqueRecipients = $recipients
            ->filter(static fn (mixed $item): bool => $item instanceof User)
            ->unique(static fn (User $user): int => (int) $user->id)
            ->values();

        return $uniqueRecipients;
    }

    /**
     * @return Collection<int, User>
     */
    private static function monitorRecipients(): Collection
    {
        $roleAliases = config('auth_security.alerting.monitor_role_aliases', []);
        $resolvedRoleAliases = is_array($roleAliases) ? $roleAliases : [];
        $resolvedRoleAliases[] = UserRoleResolver::MONITOR;
        $resolvedRoleAliases[] = 'Monitor';
        $resolvedRoleAliases = array_values(array_unique(array_map('strval', $resolvedRoleAliases)));

        return User::query()
            ->whereHas('roles', static function ($query) use ($resolvedRoleAliases): void {
                $query->whereIn('name', $resolvedRoleAliases);
            })
            ->get();
    }

    /**
     * @param array<string, mixed> $metadata
     */
    private static function buildMessage(
        string $action,
        ?string $role,
        ?string $identifier,
        Request $request,
        array $metadata,
    ): string {
        $label = self::identifierLabel($identifier, $role);
        $ip = self::stringValue($request->ip(), 'unknown IP');
        $reason = self::stringValue($metadata['reason'] ?? null);

        return match ($action) {
            'auth.login.locked_out' => "Login attempts were locked out for {$label} from {$ip}.",
            'auth.mfa_verify.locked_out' => "MFA verification was locked out for {$label} from {$ip}.",
            'auth.login.suspicious_detected' => "Suspicious login activity was contained for {$label}; active sessions were revoked.",
            'auth.mfa_verify.suspicious_detected' => "Suspicious MFA verification activity was contained for {$label}; active sessions were revoked.",
            'auth.mfa_reset.complete.suspicious_detected' => "Suspicious MFA reset completion was contained for {$label}; active sessions were revoked.",
            default => $reason !== null
                ? "An authentication anomaly was detected for {$label} ({$reason})."
                : "An authentication anomaly was detected for {$label}.",
        };
    }

    private static function identifierLabel(?string $identifier, ?string $role): string
    {
        $normalizedIdentifier = trim((string) $identifier);
        if ($normalizedIdentifier === '') {
            return $role === UserRoleResolver::SCHOOL_HEAD
                ? 'school head account'
                : 'account';
        }

        return $normalizedIdentifier;
    }

    private static function stringValue(mixed $value, ?string $default = null): ?string
    {
        $normalized = trim((string) $value);

        if ($normalized !== '') {
            return $normalized;
        }

        return $default;
    }
}
