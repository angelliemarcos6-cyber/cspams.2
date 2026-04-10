<?php

namespace App\Support\Auth;

class AuthLoginNormalizer
{
    public static function normalizeLoginIdentifierForRole(mixed $rawLogin, ?string $role): mixed
    {
        if (! is_string($rawLogin)) {
            return $rawLogin;
        }

        $normalizedRole = UserRoleResolver::normalizeLoginRole($role);
        $login = trim($rawLogin);

        if ($normalizedRole === UserRoleResolver::MONITOR) {
            return strtolower($login);
        }

        if ($normalizedRole === UserRoleResolver::SCHOOL_HEAD) {
            return self::normalizeSchoolCodeForValidation($login);
        }

        return $login;
    }

    public static function normalizeSchoolCodeForValidation(mixed $rawSchoolCode): mixed
    {
        if (! is_string($rawSchoolCode)) {
            return $rawSchoolCode;
        }

        $trimmed = trim($rawSchoolCode);
        if ($trimmed === '') {
            return $trimmed;
        }

        return self::normalizeSchoolCode($trimmed) ?? $trimmed;
    }

    public static function normalizeSchoolCode(mixed $rawSchoolCode): ?string
    {
        if (! is_string($rawSchoolCode)) {
            return null;
        }

        $trimmed = trim($rawSchoolCode);
        if ($trimmed === '') {
            return null;
        }

        if (preg_match('/^\d{6}$/', $trimmed) === 1) {
            return $trimmed;
        }

        if (preg_match('/[A-Za-z]/', $trimmed) === 1) {
            return null;
        }

        $collapsed = preg_replace('/[\s\-\._]+/', '', $trimmed);
        if (! is_string($collapsed)) {
            return null;
        }

        return preg_match('/^\d{6}$/', $collapsed) === 1
            ? $collapsed
            : null;
    }
}
