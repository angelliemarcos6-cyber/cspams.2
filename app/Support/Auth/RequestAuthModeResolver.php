<?php

namespace App\Support\Auth;

use Illuminate\Http\Request;

class RequestAuthModeResolver
{
    public const COOKIE = 'cookie';

    public const TOKEN = 'token';

    private const ATTRIBUTE = 'cspams.auth_mode';

    public static function resolveAuthMode(Request $request): string
    {
        $resolved = $request->attributes->get(self::ATTRIBUTE);

        if (is_string($resolved) && in_array($resolved, [self::COOKIE, self::TOKEN], true)) {
            return $resolved;
        }

        $mode = self::tokenCandidate($request) !== ''
            ? self::TOKEN
            : self::COOKIE;

        $request->attributes->set(self::ATTRIBUTE, $mode);

        return $mode;
    }

    public static function resolve(Request $request): string
    {
        return self::resolveAuthMode($request);
    }

    public static function isToken(Request $request): bool
    {
        return self::resolveAuthMode($request) === self::TOKEN;
    }

    public static function isCookie(Request $request): bool
    {
        return self::resolveAuthMode($request) === self::COOKIE;
    }

    private static function tokenCandidate(Request $request): string
    {
        $bearerToken = trim((string) $request->bearerToken());
        if ($bearerToken !== '') {
            return $bearerToken;
        }

        $logoutToken = trim((string) ($request->input('logout_token') ?? $request->header('X-CSPAMS-Logout-Token', '')));
        if ($logoutToken !== '' && $request->is('api/auth/logout')) {
            return $logoutToken;
        }

        return '';
    }
}
