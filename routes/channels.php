<?php

use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('cspams-updates', static function (User $user): bool {
    return UserRoleResolver::has($user, UserRoleResolver::MONITOR)
        || UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);
});
