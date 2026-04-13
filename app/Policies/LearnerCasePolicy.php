<?php

namespace App\Policies;

use App\Models\LearnerCase;
use App\Models\User;
use App\Support\Auth\UserRoleResolver;

class LearnerCasePolicy
{
    public function viewAny(User $user): bool
    {
        return $this->isSchoolHead($user) || $this->isMonitor($user);
    }

    public function view(User $user, LearnerCase $learnerCase): bool
    {
        if ($this->isMonitor($user)) {
            return true;
        }

        return $this->isSchoolHead($user)
            && (int) $user->school_id > 0
            && (int) $user->school_id === (int) $learnerCase->school_id;
    }

    public function create(User $user): bool
    {
        return $this->isSchoolHead($user) && (int) $user->school_id > 0;
    }

    public function update(User $user, LearnerCase $learnerCase): bool
    {
        return $this->canManageSchoolCase($user, $learnerCase);
    }

    public function delete(User $user, LearnerCase $learnerCase): bool
    {
        return $this->canManageSchoolCase($user, $learnerCase);
    }

    private function canManageSchoolCase(User $user, LearnerCase $learnerCase): bool
    {
        return $this->isSchoolHead($user)
            && (int) $user->school_id > 0
            && (int) $user->school_id === (int) $learnerCase->school_id;
    }

    private function isSchoolHead(User $user): bool
    {
        return UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);
    }

    private function isMonitor(User $user): bool
    {
        return UserRoleResolver::has($user, UserRoleResolver::MONITOR);
    }
}
