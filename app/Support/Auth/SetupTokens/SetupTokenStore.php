<?php

namespace App\Support\Auth\SetupTokens;

use App\Models\User;

interface SetupTokenStore
{
    public function backend(): string;

    public function available(): bool;

    public function issue(
        User $user,
        ?User $issuedBy = null,
        ?string $issuedIp = null,
        ?string $issuedUserAgent = null,
        ?int $ttlHours = null,
    ): SetupTokenRecord;

    public function resolve(string $plainToken): ?SetupTokenRecord;

    public function consume(
        string $plainToken,
        ?string $usedIp = null,
        ?string $usedUserAgent = null,
    ): ?SetupTokenRecord;

    public function latestForUser(User $user): ?SetupTokenRecord;

    public function recordDeliveryOutcome(SetupTokenRecord $token, string $status, ?string $message = null): void;

    public function purgeForUser(User $user): int;
}
