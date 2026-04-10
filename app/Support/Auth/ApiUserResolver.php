<?php

namespace App\Support\Auth;

use App\Models\User;
use App\Support\Auth\PersonalAccessTokenExpiry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;

class ApiUserResolver
{
    public static function fromRequest(Request $request): ?User
    {
        if (RequestAuthModeResolver::isToken($request)) {
            $rawToken = trim((string) $request->bearerToken());
            if ($rawToken === '') {
                $rawToken = trim((string) ($request->input('logout_token') ?? $request->header('X-CSPAMS-Logout-Token', '')));
            }

            $accessToken = PersonalAccessToken::findToken($rawToken);

            if (! $accessToken instanceof PersonalAccessToken || PersonalAccessTokenExpiry::isExpired($accessToken)) {
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
}
