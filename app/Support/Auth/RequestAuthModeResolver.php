<?php

namespace App\Support\Auth;

use Illuminate\Http\Request;

class RequestAuthModeResolver
{
    public const COOKIE = 'cookie';

    public const BEARER = 'bearer';

    public const COOKIE_SESSION_RESPONSE = 'cookie_session';

    public const TOKEN_RESPONSE = 'token';

    public static function resolve(Request $request): string
    {
        return self::isBearer($request) ? self::BEARER : self::COOKIE;
    }

    public static function isBearer(Request $request): bool
    {
        if (trim((string) $request->bearerToken()) !== '') {
            return true;
        }

        return in_array(self::transportHeader($request), ['token', self::BEARER], true);
    }

    public static function isCookie(Request $request): bool
    {
        return ! self::isBearer($request);
    }

    public static function responseMode(Request $request): string
    {
        return self::isBearer($request)
            ? self::TOKEN_RESPONSE
            : self::COOKIE_SESSION_RESPONSE;
    }

    public static function allowsSession(Request $request): bool
    {
        return self::isCookie($request);
    }

    public static function transportHeader(Request $request): ?string
    {
        $transport = strtolower(trim((string) $request->header('X-CSPAMS-Auth-Transport', '')));

        return $transport !== '' ? $transport : null;
    }
}
