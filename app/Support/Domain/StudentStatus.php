<?php

namespace App\Support\Domain;

enum StudentStatus: string
{
    case ENROLLED = 'enrolled';
    case AT_RISK = 'at_risk';
    case TRANSFEREE = 'transferee';
    case RETURNING = 'returning';
    case DROPPED_OUT = 'dropped_out';
    case ON_HOLD = 'on_hold';
    case COMPLETER = 'completer';
    case GRADUATED = 'graduated';

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            self::ENROLLED->value => 'Enrolled',
            self::AT_RISK->value => 'At-Risk',
            self::TRANSFEREE->value => 'Transferee',
            self::RETURNING->value => 'Returning',
            self::DROPPED_OUT->value => 'Dropped Out',
            self::ON_HOLD->value => 'On Hold',
            self::COMPLETER->value => 'Completer',
            self::GRADUATED->value => 'Graduated',
        ];
    }

    public function color(): string
    {
        return match ($this) {
            self::ENROLLED, self::RETURNING, self::COMPLETER, self::GRADUATED => 'success',
            self::AT_RISK, self::ON_HOLD => 'warning',
            self::TRANSFEREE => 'info',
            self::DROPPED_OUT => 'danger',
        };
    }
}
