<?php

namespace App\Support\Auth\SetupTokens;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class CacheSetupTokenStore implements SetupTokenStore
{
    private const RETENTION_HOURS_AFTER_EXPIRY = 168;

    public function __construct(
        private readonly ?CacheRepository $cache = null,
    ) {
    }

    public function backend(): string
    {
        return SetupTokenRecord::BACKEND_CACHE;
    }

    public function available(): bool
    {
        return true;
    }

    public function issue(
        User $user,
        ?User $issuedBy = null,
        ?string $issuedIp = null,
        ?string $issuedUserAgent = null,
        ?int $ttlHours = null,
    ): SetupTokenRecord {
        $now = CarbonImmutable::now();
        $expiresAt = $now->addHours(max(1, $ttlHours ?? (int) config('auth_security.setup_links.ttl_hours', 72)));
        $secret = Str::random(64);
        $tokenId = (string) Str::uuid();
        $existing = $this->latestForUser($user);

        if ($existing instanceof SetupTokenRecord && $existing->isUsable()) {
            $this->writeRecord($this->expiredRecord($existing, $now));
        }

        $record = SetupTokenRecord::fromArray([
            'id' => $tokenId,
            'storage_backend' => $this->backend(),
            'user_id' => $user->id,
            'issued_by_user_id' => $issuedBy?->id,
            'token_hash' => Hash::make($secret),
            'token_secret_ciphertext' => Crypt::encryptString($secret),
            'expires_at' => $expiresAt->toISOString(),
            'expired_at' => null,
            'used_at' => null,
            'issued_ip' => $this->normalizeIpAddress($issuedIp),
            'issued_user_agent' => $this->normalizeUserAgent($issuedUserAgent),
            'used_ip' => null,
            'used_user_agent' => null,
            'delivery_status' => 'pending',
            'delivery_message' => null,
            'delivery_last_attempt_at' => null,
            'created_at' => $now->toISOString(),
            'updated_at' => $now->toISOString(),
        ]);

        $this->writeRecord($record);
        $this->cache()->put($this->latestKey($user->id), $record->id, $this->ttlUntil($record->expires_at));

        return $record;
    }

    public function resolve(string $plainToken): ?SetupTokenRecord
    {
        ['backend' => $backend, 'id' => $id, 'secret' => $secret] = SetupTokenRecord::parsePlainToken($plainToken);
        if ($backend !== $this->backend() || $id === null || $secret === null) {
            return null;
        }

        $record = $this->readRecord($id);
        if (! $record instanceof SetupTokenRecord) {
            return null;
        }

        if (! Hash::check($secret, $record->token_hash)) {
            return null;
        }

        if (! $record->isUsable()) {
            if ($record->used_at === null && $record->expired_at === null && $record->isExpired()) {
                $this->writeRecord($this->expiredRecord($record, CarbonImmutable::now()));
            }

            return $this->readRecord($id);
        }

        return $record;
    }

    public function consume(
        string $plainToken,
        ?string $usedIp = null,
        ?string $usedUserAgent = null,
    ): ?SetupTokenRecord {
        ['backend' => $backend, 'id' => $id, 'secret' => $secret] = SetupTokenRecord::parsePlainToken($plainToken);
        if ($backend !== $this->backend() || $id === null || $secret === null) {
            return null;
        }

        return $this->lock($id, function () use ($id, $secret, $usedIp, $usedUserAgent): ?SetupTokenRecord {
            $record = $this->readRecord($id);
            if (! $record instanceof SetupTokenRecord) {
                return null;
            }

            if (! Hash::check($secret, $record->token_hash)) {
                return null;
            }

            if (! $record->isUsable()) {
                if ($record->used_at === null && $record->expired_at === null && $record->isExpired()) {
                    $this->writeRecord($this->expiredRecord($record, CarbonImmutable::now()));
                }

                return null;
            }

            $now = CarbonImmutable::now();
            $consumed = SetupTokenRecord::fromArray([
                ...$this->toCachePayload($record),
                'used_at' => $now->toISOString(),
                'used_ip' => $this->normalizeIpAddress($usedIp),
                'used_user_agent' => $this->normalizeUserAgent($usedUserAgent),
                'updated_at' => $now->toISOString(),
            ]);

            $this->writeRecord($consumed);

            $latestId = $this->cache()->get($this->latestKey($record->user_id));
            if ((string) $latestId === $record->id) {
                $this->cache()->put($this->latestKey($record->user_id), $record->id, $this->ttlUntil($record->expires_at));
            }

            return $consumed;
        });
    }

    public function latestForUser(User $user): ?SetupTokenRecord
    {
        $latestId = $this->cache()->get($this->latestKey($user->id));
        if (! is_string($latestId) || trim($latestId) === '') {
            return null;
        }

        $record = $this->readRecord($latestId);
        if (! $record instanceof SetupTokenRecord) {
            $this->cache()->forget($this->latestKey($user->id));

            return null;
        }

        if ($record->used_at === null && $record->expired_at === null && $record->isExpired()) {
            $record = $this->expiredRecord($record, CarbonImmutable::now());
            $this->writeRecord($record);
        }

        return $record;
    }

    public function recordDeliveryOutcome(SetupTokenRecord $token, string $status, ?string $message = null): void
    {
        if ($token->storage_backend !== $this->backend()) {
            return;
        }

        $record = $this->readRecord($token->id);
        if (! $record instanceof SetupTokenRecord) {
            return;
        }

        $updated = SetupTokenRecord::fromArray([
            ...$this->toCachePayload($record),
            'delivery_status' => strtolower(trim($status)) ?: 'unknown',
            'delivery_message' => $message !== null ? trim($message) : null,
            'delivery_last_attempt_at' => now()->toISOString(),
            'updated_at' => now()->toISOString(),
        ]);

        $this->writeRecord($updated);
    }

    public function purgeForUser(User $user): int
    {
        $record = $this->latestForUser($user);
        $removed = 0;

        if ($record instanceof SetupTokenRecord) {
            $this->cache()->forget($this->tokenKey($record->id));
            $removed = 1;
        }

        $this->cache()->forget($this->latestKey($user->id));

        return $removed;
    }

    private function cache(): CacheRepository
    {
        return $this->cache ?? Cache::store();
    }

    private function readRecord(string $id): ?SetupTokenRecord
    {
        $payload = $this->cache()->get($this->tokenKey($id));
        if (! is_array($payload)) {
            return null;
        }

        return SetupTokenRecord::fromArray($payload);
    }

    private function writeRecord(SetupTokenRecord $record): void
    {
        $this->cache()->put(
            $this->tokenKey($record->id),
            $this->toCachePayload($record),
            $this->ttlUntil($record->expires_at),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function toCachePayload(SetupTokenRecord $record): array
    {
        return [
            'id' => $record->id,
            'storage_backend' => $record->storage_backend,
            'user_id' => $record->user_id,
            'issued_by_user_id' => $record->issued_by_user_id,
            'token_hash' => $record->token_hash,
            'token_secret_ciphertext' => $record->token_secret_ciphertext,
            'expires_at' => $record->expires_at->toISOString(),
            'expired_at' => $record->expired_at?->toISOString(),
            'used_at' => $record->used_at?->toISOString(),
            'issued_ip' => $record->issued_ip,
            'issued_user_agent' => $record->issued_user_agent,
            'used_ip' => $record->used_ip,
            'used_user_agent' => $record->used_user_agent,
            'delivery_status' => $record->delivery_status,
            'delivery_message' => $record->delivery_message,
            'delivery_last_attempt_at' => $record->delivery_last_attempt_at?->toISOString(),
            'created_at' => $record->created_at?->toISOString(),
            'updated_at' => $record->updated_at?->toISOString(),
        ];
    }

    private function expiredRecord(SetupTokenRecord $record, CarbonImmutable $expiredAt): SetupTokenRecord
    {
        return SetupTokenRecord::fromArray([
            ...$this->toCachePayload($record),
            'expired_at' => $expiredAt->toISOString(),
            'updated_at' => $expiredAt->toISOString(),
        ]);
    }

    private function ttlUntil(CarbonImmutable $expiresAt): \DateTimeInterface
    {
        $retentionCutoff = $expiresAt->addHours(self::RETENTION_HOURS_AFTER_EXPIRY);

        return $retentionCutoff->greaterThan(CarbonImmutable::now())
            ? $retentionCutoff
            : CarbonImmutable::now()->addHour();
    }

    private function tokenKey(string $id): string
    {
        return 'auth:setup-token:cache:' . $id;
    }

    private function latestKey(int $userId): string
    {
        return 'auth:setup-token:latest:' . $userId;
    }

    private function lock(string $id, callable $callback): ?SetupTokenRecord
    {
        try {
            return Cache::lock('auth:setup-token:lock:' . $id, 10)->block(5, $callback);
        } catch (\Throwable $exception) {
            throw new SetupTokenStorageUnavailableException(
                'Cache-backed account setup token storage is unavailable.',
                previous: $exception,
            );
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
}
