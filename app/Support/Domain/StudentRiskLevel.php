<?php

namespace App\Support\Domain;

enum StudentRiskLevel: string
{
    case NONE = 'none';
    case LOW = 'low';
    case MEDIUM = 'medium';
    case HIGH = 'high';

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            self::NONE->value => 'None',
            self::LOW->value => 'Low',
            self::MEDIUM->value => 'Medium',
            self::HIGH->value => 'High',
        ];
    }

    public function color(): string
    {
        return match ($this) {
            self::NONE => 'gray',
            self::LOW => 'success',
            self::MEDIUM => 'warning',
            self::HIGH => 'danger',
        };
    }
}
