<?php

namespace App\Support\Auth;

use Illuminate\Http\Request;

class RequestAuthModeResolver
{
    public const COOKIE = 'cookie';

    public const TOKEN = 'token';

    private const ATTRIBUTE = 'cspams.auth_mode';

    public static function resolve(Request $request): string
    {
        $resolved = $request->attributes->get(self::ATTRIBUTE);

        if (is_string($resolved) && in_array($resolved, [self::COOKIE, self::TOKEN], true)) {
            return $resolved;
        }

        $mode = trim((string) $request->bearerToken()) !== '' || self::transportHeader($request) === self::TOKEN
            ? self::TOKEN
            : self::COOKIE;

        $request->attributes->set(self::ATTRIBUTE, $mode);

        return $mode;
    }

    public static function isToken(Request $request): bool
    {
        return self::resolve($request) === self::TOKEN;
    }

    public static function isCookie(Request $request): bool
    {
        return self::resolve($request) === self::COOKIE;
    }

    public static function transportHeader(Request $request): ?string
    {
        $transport = strtolower(trim((string) $request->header('X-CSPAMS-Auth-Transport', '')));

        return in_array($transport, [self::COOKIE, self::TOKEN], true) ? $transport : null;
    }
}
