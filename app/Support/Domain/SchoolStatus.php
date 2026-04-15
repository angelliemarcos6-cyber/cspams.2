<?php

namespace App\Support\Domain;

enum SchoolStatus: string
{
    case ACTIVE = 'active';
    case INACTIVE = 'inactive';
    case PENDING = 'pending';

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            self::ACTIVE->value => 'Active',
            self::INACTIVE->value => 'Inactive',
            self::PENDING->value => 'Pending',
        ];
    }

    public function color(): string
    {
        return match ($this) {
            self::ACTIVE => 'success',
            self::INACTIVE => 'gray',
            self::PENDING => 'warning',
        };
    }
}
