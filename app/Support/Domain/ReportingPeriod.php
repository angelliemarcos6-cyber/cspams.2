<?php

namespace App\Support\Domain;

enum ReportingPeriod: string
{
    case Q1 = 'Q1';
    case Q2 = 'Q2';
    case Q3 = 'Q3';
    case Q4 = 'Q4';
    case ANNUAL = 'ANNUAL';

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            self::Q1->value => 'Quarter 1',
            self::Q2->value => 'Quarter 2',
            self::Q3->value => 'Quarter 3',
            self::Q4->value => 'Quarter 4',
            self::ANNUAL->value => 'Annual',
        ];
    }
}
