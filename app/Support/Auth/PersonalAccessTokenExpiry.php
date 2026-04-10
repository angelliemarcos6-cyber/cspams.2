<?php

namespace App\Support\Auth;

use Carbon\CarbonImmutable;
use Laravel\Sanctum\PersonalAccessToken;

class PersonalAccessTokenExpiry
{
    public static function expirationMinutesForRole(?string $role): ?int
    {
        $normalizedRole = UserRoleResolver::normalizeLoginRole((string) $role);
        $value = config('sanctum.expirations.' . $normalizedRole);

        if (! is_numeric($value)) {
            $value = config('sanctum.expiration');
        }

        if (! is_numeric($value)) {
            return null;
        }

        $minutes = (int) $value;

        return $minutes > 0 ? $minutes : null;
    }

    public static function resolveRole(PersonalAccessToken $token): ?string
    {
        $abilities = is_array($token->abilities)
            ? $token->abilities
            : [];

        foreach ($abilities as $ability) {
            if ($ability === 'role:' . UserRoleResolver::MONITOR) {
                return UserRoleResolver::MONITOR;
            }

            if ($ability === 'role:' . UserRoleResolver::SCHOOL_HEAD) {
                return UserRoleResolver::SCHOOL_HEAD;
            }
        }

        $name = strtolower(trim((string) $token->name));

        if (str_contains($name, UserRoleResolver::MONITOR)) {
            return UserRoleResolver::MONITOR;
        }

        if (str_contains($name, UserRoleResolver::SCHOOL_HEAD)) {
            return UserRoleResolver::SCHOOL_HEAD;
        }

        return null;
    }

    public static function expiresAt(PersonalAccessToken $token): ?CarbonImmutable
    {
        if ($token->expires_at !== null) {
            return CarbonImmutable::parse($token->expires_at);
        }

        $expirationMinutes = self::expirationMinutesForRole(self::resolveRole($token));
        if ($expirationMinutes === null || $token->created_at === null) {
            return null;
        }

        return CarbonImmutable::parse($token->created_at)->addMinutes($expirationMinutes);
    }

    public static function isExpired(PersonalAccessToken $token, ?CarbonImmutable $now = null): bool
    {
        $expiresAt = self::expiresAt($token);

        return $expiresAt !== null && $expiresAt->lte($now ?? CarbonImmutable::now());
    }
}
