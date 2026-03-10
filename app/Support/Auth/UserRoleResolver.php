<?php

namespace App\Support\Auth;

use Illuminate\Contracts\Auth\Authenticatable;

class UserRoleResolver
{
    public const MONITOR = 'monitor';
    public const SCHOOL_HEAD = 'school_head';

    /**
     * @var array<string, array<int, string>>
     */
    private const ROLE_ALIASES = [
        self::MONITOR => ['monitor', 'Monitor', 'school monitor', 'School Monitor', 'division monitor', 'Division Monitor'],
        self::SCHOOL_HEAD => ['school_head', 'School Head', 'school head'],
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
        return self::has($user, self::MONITOR);
    }

    public static function normalizeLoginRole(?string $role): string
    {
        return in_array($role, self::loginRoles(), true)
            ? $role
            : self::MONITOR;
    }

    /**
     * @return array<string, array<string, string>>
     */
    public static function loginTabConfig(): array
    {
        return [
            self::MONITOR => [
                'label' => 'Division Monitor',
                'note' => 'Monitor account: view synchronized district and school performance dashboards.',
                'submit' => 'Sign in as Division Monitor',
                'forgot' => 'Please contact the SMM&E unit for monitor password reset assistance.',
            ],
            self::SCHOOL_HEAD => [
                'label' => 'School Head',
                'note' => 'School Head account: sign in using your assigned 6-digit school code, then encode and manage your school submissions.',
                'submit' => 'Sign in as School Head',
                'forgot' => 'For School Heads: please request your Division Monitor or SMM&E unit to reset your password.',
            ],
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function loginRoles(): array
    {
        return [self::MONITOR, self::SCHOOL_HEAD];
    }
}

