<?php

namespace App\Support\Domain;

enum MetricDataType: string
{
    case NUMBER = 'number';
    case CURRENCY = 'currency';
    case YES_NO = 'yes_no';
    case ENUM = 'enum';
    case YEARLY_MATRIX = 'yearly_matrix';
    case TEXT = 'text';

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            self::NUMBER->value => 'Number',
            self::CURRENCY->value => 'Currency',
            self::YES_NO->value => 'Yes / No',
            self::ENUM->value => 'Enum',
            self::YEARLY_MATRIX->value => 'Yearly Matrix',
            self::TEXT->value => 'Text',
        ];
    }
}
