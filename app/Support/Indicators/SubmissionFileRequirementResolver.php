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
            return SubmissionFileDefinition::nonCoreTypes();
        }

        return SubmissionFileDefinition::coreTypes();
    }

    public function hasAllRequiredFilesForSubmission(IndicatorSubmission $submission): bool
    {
        return $this->missingTypesForSubmission($submission) === [];
    }

    public function isSubmissionComplete(IndicatorSubmission $submission): bool
    {
        return $submission->hasImetaFormData() && $this->hasAllRequiredFilesForSubmission($submission);
    }

    /**
     * @return list<string>
     */
    public function missingTypesForSubmission(IndicatorSubmission $submission): array
    {
        $uploadedFileTypes = $submission->uploadedSubmissionFileTypes();

        return array_values(array_filter(
            $this->requiredTypesForSubmission($submission),
            static fn (string $type): bool => ! in_array($type, $uploadedFileTypes, true),
        ));
    }

    /**
     * @return list<string>
     */
    public function missingRequirementLabelsForSubmission(IndicatorSubmission $submission): array
    {
        $missingRequirements = [];

        if (! $submission->hasImetaFormData()) {
            $missingRequirements[] = 'I-META / Group A form data';
        }

        foreach ($this->missingTypesForSubmission($submission) as $type) {
            $missingRequirements[] = SubmissionFileDefinition::shortLabelFor($type) . ' file';
        }

        return $missingRequirements;
    }

    /**
     * @return list<string>
     */
    public function secondaryHistoricalTypesForSubmission(IndicatorSubmission $submission): array
    {
        $requiredTypes = $this->requiredTypesForSubmission($submission);
        $uploadedFileTypes = $submission->uploadedSubmissionFileTypes();

        return array_values(array_filter(
            $uploadedFileTypes,
            static fn (string $type): bool => ! in_array($type, $requiredTypes, true),
        ));
    }
}
