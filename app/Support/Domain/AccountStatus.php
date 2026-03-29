<?php

namespace App\Support\Domain;

enum AccountStatus: string
{
    case ACTIVE = 'active';
    case PENDING_SETUP = 'pending_setup';
    case PENDING_VERIFICATION = 'pending_verification';
    case SUSPENDED = 'suspended';
    case LOCKED = 'locked';
    case ARCHIVED = 'archived';

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            self::ACTIVE->value => 'Active',
            self::PENDING_SETUP->value => 'Pending Setup',
            self::PENDING_VERIFICATION->value => 'Pending Verification',
            self::SUSPENDED->value => 'Suspended',
            self::LOCKED->value => 'Locked',
            self::ARCHIVED->value => 'Archived',
        ];
    }

    public function allowsLogin(): bool
    {
        return $this === self::ACTIVE;
    }
}
