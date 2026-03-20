<?php

use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel(
    'cspams-updates.monitor',
    static function (User $user): bool {
        return $user->canAuthenticate() && UserRoleResolver::has($user, UserRoleResolver::MONITOR);
    },
    ['guards' => ['sanctum']],
);

Broadcast::channel(
    'cspams-updates.school.{schoolId}',
    static function (User $user, string $schoolId): bool {
        if (! $user->canAuthenticate()) {
            return false;
        }

        if (! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)) {
            return false;
        }

        if (! is_numeric($schoolId)) {
            return false;
        }

        return (int) $user->school_id === (int) $schoolId;
    },
    ['guards' => ['sanctum']],
);
