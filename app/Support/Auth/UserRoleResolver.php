<?php

namespace App\Support\Auth;

use Illuminate\Contracts\Auth\Authenticatable;

class UserRoleResolver
{
    public const DIVISION_ADMIN = 'division_admin';
    public const MONITOR = 'monitor';
    public const SCHOOL_HEAD = 'school_head';

    /**
     * @var array<string, array<int, string>>
     */
    private const ROLE_ALIASES = [
        self::DIVISION_ADMIN => ['division_admin', 'Division Admin', 'division admin'],
        self::MONITOR => ['monitor', 'Monitor', 'school monitor', 'School Monitor'],
        self::SCHOOL_HEAD => ['school_head', 'School Head', 'school head', 'school_administrator', 'School Administrator'],
    ];

    public static function has(?Authenticatable $user, string $role): bool
    {
        if (! $user || ! method_exists($user, 'hasRole')) {
            return false;
        }

        foreach (self::ROLE_ALIASES[$role] ?? [$role] as $alias) {
            if ($user->hasRole($alias)) {
                return true;
            }
        }

        return false;
    }

    public static function isDivisionLevel(?Authenticatable $user): bool
    {
        return self::has($user, self::DIVISION_ADMIN) || self::has($user, self::MONITOR);
    }

    /**
     * @return array<int, string>
     */
    public static function loginRoles(): array
    {
        return [self::MONITOR, self::SCHOOL_HEAD];
    }
}
