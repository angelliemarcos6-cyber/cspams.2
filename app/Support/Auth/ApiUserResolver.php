<?php

namespace App\Support\Auth;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;

class ApiUserResolver
{
    public static function fromRequest(Request $request): ?User
    {
        if (RequestAuthModeResolver::isToken($request)) {
            $accessToken = PersonalAccessToken::findToken(trim((string) $request->bearerToken()));

            if (! $accessToken instanceof PersonalAccessToken || self::isExpired($accessToken)) {
                return null;
            }

            $tokenable = $accessToken->tokenable;

            if (! $tokenable instanceof User) {
                return null;
            }

            return $tokenable->withAccessToken($accessToken);
        }

        $user = Auth::guard('web')->user();

        return $user instanceof User ? $user : null;
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
