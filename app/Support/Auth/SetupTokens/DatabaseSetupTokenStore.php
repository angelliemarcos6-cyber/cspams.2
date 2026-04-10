<?php

namespace App\Support\Auth\SetupTokens;

use App\Models\AccountSetupToken;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class DatabaseSetupTokenStore implements SetupTokenStore
{
    private static ?bool $storageAvailable = null;

    public function backend(): string
    {
        return SetupTokenRecord::BACKEND_DATABASE;
    }

    public function available(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('account_setup_tokens');
        }

        if (self::$storageAvailable === null) {
            self::$storageAvailable = Schema::hasTable('account_setup_tokens');
        }

        return self::$storageAvailable;
    }

    public function issue(
        User $user,
        ?User $issuedBy = null,
        ?string $issuedIp = null,
        ?string $issuedUserAgent = null,
        ?int $ttlHours = null,
    ): SetupTokenRecord {
        $this->assertAvailable();

        try {
            $now = CarbonImmutable::now();

            AccountSetupToken::query()
                ->where('user_id', $user->id)
                ->whereNull('used_at')
                ->whereNull('expired_at')
                ->update([
                    'expired_at' => $now,
                    'updated_at' => $now,
                ]);

            $expiresAt = $now->addHours(max(1, $ttlHours ?? (int) config('auth_security.setup_links.ttl_hours', 72)));
            $secret = Str::random(64);

            $token = AccountSetupToken::query()->create([
                'user_id' => $user->id,
                'issued_by_user_id' => $issuedBy?->id,
                'token_hash' => Hash::make($secret),
                'token_secret_ciphertext' => Crypt::encryptString($secret),
                'expires_at' => $expiresAt,
                'issued_ip' => $this->normalizeIpAddress($issuedIp),
                'issued_user_agent' => $this->normalizeUserAgent($issuedUserAgent),
                'delivery_status' => 'pending',
            ]);
        } catch (\Throwable $exception) {
            throw $this->mapStorageException($exception);
        }

        return SetupTokenRecord::fromArray([
            ...$token->attributesToArray(),
            'id' => (string) $token->getKey(),
            'storage_backend' => $this->backend(),
        ]);
    }

    public function resolve(string $plainToken): ?SetupTokenRecord
    {
        $this->assertAvailable();

        ['backend' => $backend, 'id' => $id, 'secret' => $secret] = SetupTokenRecord::parsePlainToken($plainToken);
        if ($backend !== $this->backend() || $id === null || $secret === null) {
            return null;
        }

        try {
            /** @var AccountSetupToken|null $token */
            $token = AccountSetupToken::query()->find((int) $id);
            if (! $token || ! is_string($token->token_hash) || $token->token_hash === '') {
                return null;
            }

            if (! Hash::check($secret, $token->token_hash)) {
                return null;
            }

            if (! $token->isUsable()) {
                if ($token->used_at === null && $token->expired_at === null && $token->isExpired()) {
                    $token->forceFill([
                        'expired_at' => CarbonImmutable::now(),
                    ])->save();
                }
            }
        } catch (\Throwable $exception) {
            throw $this->mapStorageException($exception);
        }

        return SetupTokenRecord::fromArray([
            ...(($token->fresh()?->attributesToArray()) ?? $token->attributesToArray()),
            'id' => (string) $token->getKey(),
            'storage_backend' => $this->backend(),
        ]);
    }

    public function consume(
        string $plainToken,
        ?string $usedIp = null,
        ?string $usedUserAgent = null,
    ): ?SetupTokenRecord {
        $this->assertAvailable();

        ['backend' => $backend, 'id' => $id, 'secret' => $secret] = SetupTokenRecord::parsePlainToken($plainToken);
        if ($backend !== $this->backend() || $id === null || $secret === null) {
            return null;
        }

        try {
            return DB::transaction(function () use ($id, $secret, $usedIp, $usedUserAgent): ?SetupTokenRecord {
                /** @var AccountSetupToken|null $token */
                $token = AccountSetupToken::query()
                    ->whereKey((int) $id)
                    ->lockForUpdate()
                    ->first();

                if (! $token || ! is_string($token->token_hash) || $token->token_hash === '') {
                    return null;
                }

                if (! Hash::check($secret, $token->token_hash) || ! $token->isUsable()) {
                    if ($token->used_at === null && $token->expired_at === null && $token->isExpired()) {
                        $token->forceFill([
                            'expired_at' => CarbonImmutable::now(),
                        ])->save();
                    }

                    return null;
                }

                $now = CarbonImmutable::now();
                $token->forceFill([
                    'used_at' => $now,
                    'used_ip' => $this->normalizeIpAddress($usedIp),
                    'used_user_agent' => $this->normalizeUserAgent($usedUserAgent),
                ])->save();

                AccountSetupToken::query()
                    ->where('user_id', $token->user_id)
                    ->where('id', '!=', $token->id)
                    ->whereNull('used_at')
                    ->whereNull('expired_at')
                    ->update([
                        'expired_at' => $now,
                        'updated_at' => $now,
                    ]);

                return SetupTokenRecord::fromArray([
                    ...(($token->fresh()?->attributesToArray()) ?? $token->attributesToArray()),
                    'id' => (string) $token->getKey(),
                    'storage_backend' => $this->backend(),
                ]);
            });
        } catch (\Throwable $exception) {
            throw $this->mapStorageException($exception);
        }
    }

    public function latestForUser(User $user): ?SetupTokenRecord
    {
        $this->assertAvailable();

        try {
            /** @var AccountSetupToken|null $token */
            $token = AccountSetupToken::query()
                ->where('user_id', $user->id)
                ->latest('id')
                ->first();

            if (! $token) {
                return null;
            }

            if ($token->used_at === null && $token->expired_at === null && $token->isExpired()) {
                $token->forceFill([
                    'expired_at' => CarbonImmutable::now(),
                ])->save();
            }
        } catch (\Throwable $exception) {
            throw $this->mapStorageException($exception);
        }

        return SetupTokenRecord::fromArray([
            ...(($token->fresh()?->attributesToArray()) ?? $token->attributesToArray()),
            'id' => (string) $token->getKey(),
            'storage_backend' => $this->backend(),
        ]);
    }

    public function recordDeliveryOutcome(SetupTokenRecord $token, string $status, ?string $message = null): void
    {
        if ($token->storage_backend !== $this->backend()) {
            return;
        }

        $this->assertAvailable();

        try {
            AccountSetupToken::query()
                ->whereKey((int) $token->id)
                ->update([
                    'delivery_status' => strtolower(trim($status)) ?: 'unknown',
                    'delivery_message' => $message !== null ? trim($message) : null,
                    'delivery_last_attempt_at' => now(),
                    'updated_at' => now(),
                ]);
        } catch (\Throwable $exception) {
            throw $this->mapStorageException($exception);
        }
    }

    public function purgeForUser(User $user): int
    {
        if (! $this->available()) {
            return 0;
        }

        try {
            return (int) AccountSetupToken::query()
                ->where('user_id', $user->id)
                ->delete();
        } catch (\Throwable $exception) {
            throw $this->mapStorageException($exception);
        }
    }

    private function assertAvailable(): void
    {
        if (! $this->available()) {
            throw new SetupTokenStorageUnavailableException('Database-backed account setup token storage is unavailable.');
        }
    }

    private function normalizeIpAddress(?string $value): ?string
    {
        $normalized = trim((string) $value);

        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeUserAgent(?string $value): ?string
    {
        $normalized = trim((string) $value);
        if ($normalized === '') {
            return null;
        }

        return Str::limit($normalized, 500, '');
    }

    private function mapStorageException(\Throwable $exception): SetupTokenStorageUnavailableException
    {
        if ($exception instanceof SetupTokenStorageUnavailableException) {
            return $exception;
        }

        if (! $this->isMissingStorageException($exception)) {
            throw $exception;
        }

        return new SetupTokenStorageUnavailableException(
            'Database-backed account setup token storage is unavailable.',
            previous: $exception,
        );
    }

    private function isMissingStorageException(\Throwable $exception): bool
    {
        $message = strtolower(trim($exception->getMessage()));

        return str_contains($message, 'no such table')
            || str_contains($message, 'base table or view not found')
            || str_contains($message, 'relation "account_setup_tokens" does not exist')
            || str_contains($message, "table 'account_setup_tokens' doesn't exist");
    }
}
