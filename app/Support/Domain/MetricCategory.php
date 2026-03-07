<?php

namespace App\Support\Domain;

enum MetricCategory: string
{
    case LEARNER = 'learner';
    case INFRASTRUCTURE = 'infrastructure';
    case RESOURCES = 'resources';
    case COMPLIANCE = 'compliance';

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            self::LEARNER->value => 'Learner KPI',
            self::INFRASTRUCTURE->value => 'Infrastructure',
            self::RESOURCES->value => 'Resources',
            self::COMPLIANCE->value => 'Compliance',
        ];
    }
}
