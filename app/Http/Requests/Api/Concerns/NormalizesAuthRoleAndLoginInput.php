<?php

namespace App\Http\Requests\Api\Concerns;

use App\Support\Auth\UserRoleResolver;

trait NormalizesAuthRoleAndLoginInput
{
    protected function normalizeRoleForLoginPayload(mixed $rawRole): mixed
    {
        if (! is_string($rawRole)) {
            return $rawRole;
        }

        $candidate = trim($rawRole);
        if ($candidate === '') {
            return $candidate;
        }

        $normalizedCandidate = strtolower($candidate);

        foreach (UserRoleResolver::loginRoles() as $canonicalRole) {
            $aliases = array_unique([
                $canonicalRole,
                ...UserRoleResolver::roleAliases($canonicalRole),
            ]);

            foreach ($aliases as $alias) {
                if ($normalizedCandidate === strtolower(trim($alias))) {
                    return $canonicalRole;
                }
            }
        }

        return $candidate;
    }

    protected function normalizeLoginIdentifierForRole(mixed $rawLogin, mixed $role): mixed
    {
        if (! is_string($rawLogin)) {
            return $rawLogin;
        }

        $login = trim($rawLogin);

        if ($role === UserRoleResolver::MONITOR) {
            return strtolower($login);
        }

        return $login;
    }
}
