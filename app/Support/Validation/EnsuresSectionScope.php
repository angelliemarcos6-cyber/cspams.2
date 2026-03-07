<?php

namespace App\Support\Validation;

use App\Models\Section;
use Illuminate\Validation\ValidationException;

trait EnsuresSectionScope
{
    private function assertSectionBelongsToScope(int|string|null $sectionId, int $schoolId, int $academicYearId): void
    {
        if (! $sectionId) {
            return;
        }

        $sectionIsInScope = Section::query()
            ->whereKey($sectionId)
            ->where('school_id', $schoolId)
            ->where('academic_year_id', $academicYearId)
            ->exists();

        if ($sectionIsInScope) {
            return;
        }

        throw ValidationException::withMessages([
            'data.section_id' => 'Selected section does not match the learner school and academic year.',
        ]);
    }
}
