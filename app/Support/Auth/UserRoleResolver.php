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
        self::DIVISION_ADMIN => ['division_admin', 'Division Admin', 'division admin', 'chief', 'Chief'],
        self::MONITOR => ['monitor', 'Monitor', 'school monitor', 'School Monitor', 'division monitor', 'Division Monitor'],
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
            self::DIVISION_ADMIN => [
                'label' => 'Division Chief',
                'note' => 'Division Chief account: full city-wide analytics and governance access.',
                'submit' => 'Sign in as Division Chief',
                'forgot' => 'Please contact the system owner or development team for Division Chief credential reset.',
            ],
            self::MONITOR => [
                'label' => 'Division Monitor',
                'note' => 'Monitor account: view synchronized district and school performance dashboards.',
                'submit' => 'Sign in as Division Monitor',
                'forgot' => 'Please contact the SMM&E unit for monitor password reset assistance.',
            ],
            self::SCHOOL_HEAD => [
                'label' => 'School Administrator',
                'note' => 'School Administrator account: encode and manage your school learner records and submissions.',
                'submit' => 'Sign in as School Administrator',
                'forgot' => 'For School Administrators: please request your Division Monitor or SMM&E unit to reset your password.',
            ],
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function loginRoles(): array
    {
        return [self::DIVISION_ADMIN, self::MONITOR, self::SCHOOL_HEAD];
    }
}
