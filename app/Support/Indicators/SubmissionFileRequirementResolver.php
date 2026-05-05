<?php

namespace App\Support\Indicators;

use App\Models\IndicatorSubmission;
use App\Models\School;

final class SubmissionFileRequirementResolver
{
    /**
     * @return list<string>
     */
    public function requiredTypesForSubmission(IndicatorSubmission $submission): array
    {
        $school = $submission->relationLoaded('school')
            ? $submission->school
            : $submission->school()->first();

        return $this->requiredTypesForSchool($school);
    }

    /**
     * @return list<string>
     */
    public function requiredTypesForSchool(?School $school): array
    {
        if (! $school) {
            return SubmissionFileDefinition::coreTypes();
        }

        $schoolType = strtolower(trim((string) $school->type));
        if ($schoolType === 'private') {
            return SubmissionFileDefinition::types();
        }

        return SubmissionFileDefinition::coreTypes();
    }
}
