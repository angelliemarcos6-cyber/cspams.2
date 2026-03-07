<?php

namespace App\Support\Auth;

use App\Models\User;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

class ApiUserResolver
{
    public static function fromRequest(Request $request): ?User
    {
        $bearerToken = trim((string) $request->bearerToken());
        if ($bearerToken !== '') {
            $accessToken = PersonalAccessToken::findToken($bearerToken);
            if (! $accessToken) {
                return null;
            }

            $tokenable = $accessToken->tokenable;

            if (! $tokenable instanceof User) {
                return null;
            }

            return $tokenable->withAccessToken($accessToken);
        }

        $user = $request->user();

        return $user instanceof User ? $user : null;
    }
}
