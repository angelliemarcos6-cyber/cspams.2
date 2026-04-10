<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\Audit\AuthAuditLogger;
use App\Support\Auth\PersonalAccessTokenExpiry;
use App\Support\Auth\RequestAuthModeResolver;
use App\Support\Auth\UserRoleResolver;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class RejectExpiredApiToken
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! RequestAuthModeResolver::isToken($request)) {
            return $next($request);
        }

        $rawToken = trim((string) $request->bearerToken());
        if ($rawToken === '') {
            return $next($request);
        }

        $accessToken = PersonalAccessToken::findToken($rawToken);
        if (! $accessToken instanceof PersonalAccessToken) {
            return $next($request);
        }

        if (! PersonalAccessTokenExpiry::isExpired($accessToken)) {
            return $next($request);
        }

        $tokenable = $accessToken->tokenable;
        $user = $tokenable instanceof User ? $tokenable : null;
        $role = $accessToken ? PersonalAccessTokenExpiry::resolveRole($accessToken) : null;
        $identifier = $user instanceof User
            ? ($role === UserRoleResolver::SCHOOL_HEAD
                ? (string) $user->school?->school_code
                : (string) $user->email)
            : null;

        $accessToken->delete();

        AuthAuditLogger::record(
            $request,
            'auth.token.expired',
            'failure',
            $user,
            $role,
            $identifier,
            [
                'error_code' => 'token_expired',
                'token_id' => $accessToken->getKey(),
            ],
        );

        return response()->json([
            'message' => 'Your session token has expired. Please sign in again.',
            'errorCode' => 'token_expired',
            'reauthenticate' => true,
        ], Response::HTTP_UNAUTHORIZED);
    }
}
