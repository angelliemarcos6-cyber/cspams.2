<?php

namespace App\Support\Domain;

enum FormSubmissionStatus: string
{
    case DRAFT = 'draft';
    case SUBMITTED = 'submitted';
    case VALIDATED = 'validated';
    case RETURNED = 'returned';

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            self::DRAFT->value => 'Draft',
            self::SUBMITTED->value => 'Submitted',
            self::VALIDATED->value => 'Validated',
            self::RETURNED->value => 'Returned for Revision',
        ];
    }
}
