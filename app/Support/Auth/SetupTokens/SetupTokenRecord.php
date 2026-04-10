<?php

namespace App\Support\Auth\SetupTokens;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Crypt;

class SetupTokenRecord
{
    public const BACKEND_DATABASE = 'database';

    public const BACKEND_CACHE = 'cache';

    public function __construct(
        public readonly string $id,
        public readonly string $storage_backend,
        public readonly int $user_id,
        public readonly ?int $issued_by_user_id,
        public readonly string $token_hash,
        public readonly ?string $token_secret_ciphertext,
        public readonly CarbonImmutable $expires_at,
        public readonly ?CarbonImmutable $expired_at,
        public readonly ?CarbonImmutable $used_at,
        public readonly ?string $issued_ip,
        public readonly ?string $issued_user_agent,
        public readonly ?string $used_ip,
        public readonly ?string $used_user_agent,
        public readonly ?string $delivery_status,
        public readonly ?string $delivery_message,
        public readonly ?CarbonImmutable $delivery_last_attempt_at,
        public readonly ?CarbonImmutable $created_at,
        public readonly ?CarbonImmutable $updated_at,
    ) {
    }

    /**
     * @param array<string, mixed> $attributes
     */
    public static function fromArray(array $attributes): self
    {
        return new self(
            id: (string) ($attributes['id'] ?? ''),
            storage_backend: (string) ($attributes['storage_backend'] ?? self::BACKEND_DATABASE),
            user_id: (int) ($attributes['user_id'] ?? 0),
            issued_by_user_id: isset($attributes['issued_by_user_id']) ? (int) $attributes['issued_by_user_id'] : null,
            token_hash: (string) ($attributes['token_hash'] ?? ''),
            token_secret_ciphertext: self::nullableString($attributes['token_secret_ciphertext'] ?? null),
            expires_at: self::parseDateTime($attributes['expires_at']) ?? CarbonImmutable::now(),
            expired_at: self::parseDateTime($attributes['expired_at'] ?? null),
            used_at: self::parseDateTime($attributes['used_at'] ?? null),
            issued_ip: self::nullableString($attributes['issued_ip'] ?? null),
            issued_user_agent: self::nullableString($attributes['issued_user_agent'] ?? null),
            used_ip: self::nullableString($attributes['used_ip'] ?? null),
            used_user_agent: self::nullableString($attributes['used_user_agent'] ?? null),
            delivery_status: self::nullableString($attributes['delivery_status'] ?? null),
            delivery_message: self::nullableString($attributes['delivery_message'] ?? null),
            delivery_last_attempt_at: self::parseDateTime($attributes['delivery_last_attempt_at'] ?? null),
            created_at: self::parseDateTime($attributes['created_at'] ?? null),
            updated_at: self::parseDateTime($attributes['updated_at'] ?? null),
        );
    }

    public static function plainTokenIdentifierFor(string $backend, string $id): string
    {
        return $backend === self::BACKEND_CACHE
            ? self::BACKEND_CACHE . ':' . $id
            : $id;
    }

    /**
     * @return array{backend: ?string, id: ?string, secret: ?string}
     */
    public static function parsePlainToken(string $plainToken): array
    {
        $normalized = trim($plainToken);
        if ($normalized === '') {
            return ['backend' => null, 'id' => null, 'secret' => null];
        }

        $parts = explode('.', $normalized, 2);
        if (count($parts) !== 2) {
            return ['backend' => null, 'id' => null, 'secret' => null];
        }

        [$identifier, $secret] = $parts;
        $identifier = trim($identifier);
        $secret = trim($secret);

        if ($identifier === '' || $secret === '') {
            return ['backend' => null, 'id' => null, 'secret' => null];
        }

        if (ctype_digit($identifier)) {
            return [
                'backend' => self::BACKEND_DATABASE,
                'id' => $identifier,
                'secret' => $secret,
            ];
        }

        if (str_starts_with($identifier, self::BACKEND_CACHE . ':')) {
            $id = trim(substr($identifier, strlen(self::BACKEND_CACHE) + 1));

            return [
                'backend' => $id !== '' ? self::BACKEND_CACHE : null,
                'id' => $id !== '' ? $id : null,
                'secret' => $id !== '' ? $secret : null,
            ];
        }

        if (str_starts_with($identifier, 'db:')) {
            $id = trim(substr($identifier, 3));

            return [
                'backend' => ctype_digit($id) ? self::BACKEND_DATABASE : null,
                'id' => ctype_digit($id) ? $id : null,
                'secret' => ctype_digit($id) ? $secret : null,
            ];
        }

        return ['backend' => null, 'id' => null, 'secret' => null];
    }

    public function plainTokenIdentifier(): string
    {
        return self::plainTokenIdentifierFor($this->storage_backend, $this->id);
    }

    public function revealPlainToken(): ?string
    {
        $secret = $this->revealSecret();

        return $secret !== null
            ? $this->plainTokenIdentifier() . '.' . $secret
            : null;
    }

    public function revealSecret(): ?string
    {
        $ciphertext = trim((string) $this->token_secret_ciphertext);
        if ($ciphertext === '') {
            return null;
        }

        try {
            $secret = Crypt::decryptString($ciphertext);
        } catch (\Throwable) {
            return null;
        }

        $secret = trim($secret);

        return $secret !== '' ? $secret : null;
    }

    public function isExpired(): bool
    {
        if ($this->expired_at !== null) {
            return true;
        }

        return $this->expires_at->lte(CarbonImmutable::now());
    }

    public function isUsable(): bool
    {
        return $this->used_at === null && ! $this->isExpired();
    }

    public function deliveryFailed(): bool
    {
        return in_array(strtolower(trim((string) $this->delivery_status)), ['failed', 'bounced'], true);
    }

    private static function nullableString(mixed $value): ?string
    {
        $normalized = trim((string) $value);

        return $normalized !== '' ? $normalized : null;
    }

    private static function parseDateTime(mixed $value): ?CarbonImmutable
    {
        if ($value instanceof CarbonImmutable) {
            return $value;
        }

        if ($value instanceof \DateTimeInterface) {
            return CarbonImmutable::instance($value);
        }

        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return CarbonImmutable::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }
}
