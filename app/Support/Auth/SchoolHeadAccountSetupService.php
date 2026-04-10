<?php

namespace App\Support\Auth;

use App\Models\User;
use App\Support\Auth\SetupTokens\SetupTokenRecord;
use App\Support\Auth\SetupTokens\SetupTokenStore;
use App\Support\Auth\SetupTokens\SetupTokenStorageUnavailableException;
use Carbon\CarbonImmutable;

class SchoolHeadAccountSetupService
{
    private const STORAGE_UNAVAILABLE_MESSAGE = 'Account setup token storage is unavailable. Check database migrations and cache configuration.';

    public function __construct(
        private readonly SetupTokenStore $setupTokenStore,
    ) {
    }

    /**
     * @return array{plainToken: string, setupUrl: string, expiresAt: string}
     */
    public function issue(
        User $user,
        ?User $issuedBy = null,
        ?string $issuedIp = null,
        ?string $issuedUserAgent = null,
        ?int $ttlHours = null,
    ): array {
        try {
            $token = $this->setupTokenStore->issue(
                $user,
                $issuedBy,
                $issuedIp,
                $issuedUserAgent,
                $ttlHours,
            );

            $plainToken = $token->revealPlainToken();
            if ($plainToken === null) {
                throw new \RuntimeException('Setup token could not be revealed after issuance.');
            }

            return [
                'plainToken' => $plainToken,
                'setupUrl' => $this->buildSetupUrl($plainToken),
                'expiresAt' => $token->expires_at->toISOString(),
            ];
        } catch (\Throwable $exception) {
            if (! $this->isStorageUnavailableException($exception)) {
                throw $exception;
            }

            throw new \RuntimeException($this->storageUnavailableMessage(), 0, $exception);
        }
    }

    public function resolve(string $plainToken): ?SetupTokenRecord
    {
        try {
            $token = $this->setupTokenStore->resolve($plainToken);
        } catch (\Throwable $exception) {
            if (! $this->isStorageUnavailableException($exception)) {
                throw $exception;
            }

            throw new \RuntimeException($this->storageUnavailableMessage(), 0, $exception);
        }

        return $token;
    }

    public function consume(string $plainToken, ?string $usedIp = null, ?string $usedUserAgent = null): ?SetupTokenRecord
    {
        try {
            return $this->setupTokenStore->consume($plainToken, $usedIp, $usedUserAgent);
        } catch (\Throwable $exception) {
            if (! $this->isStorageUnavailableException($exception)) {
                throw $exception;
            }

            throw new \RuntimeException($this->storageUnavailableMessage(), 0, $exception);
        }
    }

    public function buildSetupUrl(string $plainToken): string
    {
        $frontend = trim((string) config('app.frontend_url', ''));
        if ($frontend === '') {
            $frontend = (string) config('app.url', 'http://127.0.0.1:8000');
        }

        $frontend = rtrim($frontend, '/');

        return $frontend . '/#/setup-account?token=' . urlencode($plainToken);
    }

    public function storageAvailable(): bool
    {
        return $this->setupTokenStore->available();
    }

    public function storageUnavailableMessage(): string
    {
        return self::STORAGE_UNAVAILABLE_MESSAGE;
    }

    public function latestForUser(User $user): ?SetupTokenRecord
    {
        try {
            return $this->setupTokenStore->latestForUser($user);
        } catch (\Throwable $exception) {
            if (! $this->isStorageUnavailableException($exception)) {
                throw $exception;
            }

            return null;
        }
    }

    public function revealSetupUrl(SetupTokenRecord $token): ?string
    {
        $plainToken = $token->revealPlainToken();
        if ($plainToken === null) {
            return null;
        }

        return $this->buildSetupUrl($plainToken);
    }

    public function recordDeliveryOutcome(SetupTokenRecord $token, string $status, ?string $message = null): void
    {
        try {
            $this->setupTokenStore->recordDeliveryOutcome($token, $status, $message);
        } catch (\Throwable $exception) {
            if (! $this->isStorageUnavailableException($exception)) {
                throw $exception;
            }
        }
    }

    public function purgeForUser(User $user): int
    {
        try {
            return $this->setupTokenStore->purgeForUser($user);
        } catch (\Throwable $exception) {
            if (! $this->isStorageUnavailableException($exception)) {
                throw $exception;
            }

            return 0;
        }
    }

    private function isStorageUnavailableException(\Throwable $exception): bool
    {
        return $exception instanceof SetupTokenStorageUnavailableException
            || $exception->getPrevious() instanceof SetupTokenStorageUnavailableException;
    }
}
