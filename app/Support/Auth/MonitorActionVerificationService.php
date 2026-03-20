<?php

namespace App\Support\Auth;

use App\Models\School;
use App\Models\User;
use App\Notifications\MonitorActionVerificationCodeNotification;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class MonitorActionVerificationService
{
    /**
     * @return array{challengeId: string, expiresAt: string}
     */
    public function issue(
        User $monitor,
        School $school,
        string $targetStatus,
    ): array {
        $challengeId = (string) Str::uuid();
        $expiresAt = CarbonImmutable::now()->addMinutes($this->ttlMinutes());
        $testCode = $this->testCode();
        $code = $testCode !== null
            ? $testCode
            : str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $challenge = [
            'user_id' => (int) $monitor->id,
            'school_id' => (int) $school->id,
            'target_status' => $targetStatus,
            'code_hash' => Hash::make($code),
            'attempts' => 0,
            'max_attempts' => $this->maxAttempts(),
            'expires_at' => $expiresAt->toISOString(),
        ];

        Cache::put($this->cacheKey($challengeId), $challenge, $expiresAt);

        try {
            $monitor->notify(new MonitorActionVerificationCodeNotification(
                $code,
                $expiresAt->toDateTimeString(),
                (string) $school->name,
                $this->statusLabel($targetStatus),
            ));
        } catch (\Throwable $exception) {
            Cache::forget($this->cacheKey($challengeId));
            throw $exception;
        }

        return [
            'challengeId' => $challengeId,
            'expiresAt' => $expiresAt->toISOString(),
        ];
    }

    public function verify(
        User $monitor,
        School $school,
        string $targetStatus,
        string $challengeId,
        string $code,
    ): bool {
        $challenge = Cache::get($this->cacheKey($challengeId));
        if (! is_array($challenge)) {
            return false;
        }

        if ((int) ($challenge['user_id'] ?? 0) !== (int) $monitor->id) {
            return false;
        }

        if ((int) ($challenge['school_id'] ?? 0) !== (int) $school->id) {
            return false;
        }

        if ((string) ($challenge['target_status'] ?? '') !== $targetStatus) {
            return false;
        }

        $expiresAt = $this->parseExpiry($challenge['expires_at'] ?? null);
        if ($expiresAt->lte(CarbonImmutable::now())) {
            Cache::forget($this->cacheKey($challengeId));
            return false;
        }

        $attempts = max(0, (int) ($challenge['attempts'] ?? 0));
        $maxAttempts = max(1, (int) ($challenge['max_attempts'] ?? $this->maxAttempts()));
        if ($attempts >= $maxAttempts) {
            Cache::forget($this->cacheKey($challengeId));
            return false;
        }

        $normalizedCode = trim($code);
        $hash = (string) ($challenge['code_hash'] ?? '');
        if ($hash === '' || ! Hash::check($normalizedCode, $hash)) {
            $attempts += 1;
            $challenge['attempts'] = $attempts;

            if ($attempts >= $maxAttempts) {
                Cache::forget($this->cacheKey($challengeId));
                return false;
            }

            Cache::put($this->cacheKey($challengeId), $challenge, $expiresAt);
            return false;
        }

        Cache::forget($this->cacheKey($challengeId));
        return true;
    }

    private function cacheKey(string $challengeId): string
    {
        return 'auth:action_verify:monitor:' . $challengeId;
    }

    private function ttlMinutes(): int
    {
        return max(1, (int) config('auth_mfa.monitor.code_ttl_minutes', 10));
    }

    private function maxAttempts(): int
    {
        return max(1, (int) config('auth_mfa.monitor.max_attempts', 5));
    }

    private function testCode(): ?string
    {
        $configured = trim((string) config('auth_mfa.monitor.test_code', ''));
        if ($configured === '') {
            return null;
        }

        return preg_match('/^\d{6}$/', $configured) === 1 ? $configured : null;
    }

    private function parseExpiry(mixed $value): CarbonImmutable
    {
        if (is_string($value) && trim($value) !== '') {
            try {
                return CarbonImmutable::parse($value);
            } catch (\Throwable) {
                // Fall through to default expiry.
            }
        }

        return CarbonImmutable::now()->addMinutes($this->ttlMinutes());
    }

    private function statusLabel(string $targetStatus): string
    {
        $normalized = strtolower(trim($targetStatus));
        if ($normalized === 'suspended') {
            return 'Suspend account';
        }

        if ($normalized === 'locked') {
            return 'Lock account';
        }

        if ($normalized === 'archived') {
            return 'Archive account';
        }

        if ($normalized === 'deleted') {
            return 'Delete account';
        }

        if ($normalized === 'email_change') {
            return 'Change School Head email';
        }

        if ($normalized === 'password_reset') {
            return 'Issue password reset link';
        }

        return $targetStatus;
    }
}
