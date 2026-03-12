<?php

namespace App\Support\Auth;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

class ApiUserResolver
{
    public static function fromRequest(Request $request): ?User
    {
        $bearerToken = trim((string) $request->bearerToken());
        if ($bearerToken !== '') {
            $accessToken = PersonalAccessToken::findToken($bearerToken);
            if (! $accessToken || self::isExpired($accessToken)) {
                return null;
            }

            $tokenable = $accessToken->tokenable;

            if (! $tokenable instanceof User) {
                return null;
            }

            if (! $tokenable->canAuthenticate()) {
                $accessToken->delete();

                return null;
            }

            return $tokenable->withAccessToken($accessToken);
        }

        $user = $request->user();

        if (! $user instanceof User) {
            return null;
        }

        return $user->canAuthenticate() ? $user : null;
    }

    private static function isExpired(PersonalAccessToken $accessToken): bool
    {
        $now = CarbonImmutable::now();

        if ($accessToken->expires_at && $accessToken->expires_at->lte($now)) {
            return true;
        }

        $expirationSetting = config('sanctum.expiration');
        if (! is_numeric($expirationSetting)) {
            return false;
        }

        $expirationMinutes = (int) $expirationSetting;
        if ($expirationMinutes <= 0 || ! $accessToken->created_at) {
            return false;
        }

        return $accessToken->created_at->lte($now->subMinutes($expirationMinutes));
    }
}
