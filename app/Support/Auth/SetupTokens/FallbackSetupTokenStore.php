<?php

namespace App\Support\Auth\SetupTokens;

use App\Models\User;

class FallbackSetupTokenStore implements SetupTokenStore
{
    /**
     * @param array<int, SetupTokenStore> $stores
     */
    public function __construct(
        private readonly array $stores,
    ) {
    }

    public function backend(): string
    {
        return 'fallback';
    }

    public function available(): bool
    {
        foreach ($this->stores as $store) {
            if ($store->available()) {
                return true;
            }
        }

        return false;
    }

    public function issue(
        User $user,
        ?User $issuedBy = null,
        ?string $issuedIp = null,
        ?string $issuedUserAgent = null,
        ?int $ttlHours = null,
    ): SetupTokenRecord {
        $errors = [];

        foreach ($this->stores as $store) {
            try {
                return $store->issue($user, $issuedBy, $issuedIp, $issuedUserAgent, $ttlHours);
            } catch (SetupTokenStorageUnavailableException $exception) {
                $errors[] = $exception->getMessage();
            }
        }

        throw new SetupTokenStorageUnavailableException($this->unavailableMessage($errors));
    }

    public function resolve(string $plainToken): ?SetupTokenRecord
    {
        $store = $this->storeForPlainToken($plainToken);
        if ($store instanceof SetupTokenStore) {
            return $store->resolve($plainToken);
        }

        foreach ($this->stores as $candidate) {
            try {
                $resolved = $candidate->resolve($plainToken);
            } catch (SetupTokenStorageUnavailableException) {
                continue;
            }

            if ($resolved instanceof SetupTokenRecord) {
                return $resolved;
            }
        }

        return null;
    }

    public function consume(
        string $plainToken,
        ?string $usedIp = null,
        ?string $usedUserAgent = null,
    ): ?SetupTokenRecord {
        $store = $this->storeForPlainToken($plainToken);
        if ($store instanceof SetupTokenStore) {
            return $store->consume($plainToken, $usedIp, $usedUserAgent);
        }

        foreach ($this->stores as $candidate) {
            try {
                $consumed = $candidate->consume($plainToken, $usedIp, $usedUserAgent);
            } catch (SetupTokenStorageUnavailableException) {
                continue;
            }

            if ($consumed instanceof SetupTokenRecord) {
                return $consumed;
            }
        }

        return null;
    }

    public function latestForUser(User $user): ?SetupTokenRecord
    {
        $latest = null;

        foreach ($this->stores as $store) {
            try {
                $candidate = $store->latestForUser($user);
            } catch (SetupTokenStorageUnavailableException) {
                continue;
            }

            if (! $candidate instanceof SetupTokenRecord) {
                continue;
            }

            if (! $latest instanceof SetupTokenRecord) {
                $latest = $candidate;
                continue;
            }

            $candidateTimestamp = $candidate->created_at ?? $candidate->expires_at;
            $latestTimestamp = $latest->created_at ?? $latest->expires_at;

            if ($candidateTimestamp->greaterThan($latestTimestamp)) {
                $latest = $candidate;
            }
        }

        return $latest;
    }

    public function recordDeliveryOutcome(SetupTokenRecord $token, string $status, ?string $message = null): void
    {
        $store = $this->storeForBackend($token->storage_backend);
        if ($store instanceof SetupTokenStore) {
            $store->recordDeliveryOutcome($token, $status, $message);
        }
    }

    public function purgeForUser(User $user): int
    {
        $removed = 0;

        foreach ($this->stores as $store) {
            try {
                $removed += $store->purgeForUser($user);
            } catch (SetupTokenStorageUnavailableException) {
                continue;
            }
        }

        return $removed;
    }

    private function storeForPlainToken(string $plainToken): ?SetupTokenStore
    {
        ['backend' => $backend] = SetupTokenRecord::parsePlainToken($plainToken);

        return $backend !== null
            ? $this->storeForBackend($backend)
            : null;
    }

    private function storeForBackend(string $backend): ?SetupTokenStore
    {
        foreach ($this->stores as $store) {
            if ($store->backend() === $backend) {
                return $store;
            }
        }

        return null;
    }

    /**
     * @param array<int, string> $errors
     */
    private function unavailableMessage(array $errors): string
    {
        $details = array_values(array_unique(array_filter(array_map(
            static fn (string $message): string => trim($message),
            $errors,
        ))));

        return $details === []
            ? 'Account setup token storage is unavailable.'
            : 'Account setup token storage is unavailable. ' . implode(' ', $details);
    }
}
