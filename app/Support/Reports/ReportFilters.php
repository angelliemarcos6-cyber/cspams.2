<?php

namespace App\Support\Reports;

class ReportFilters
{
    public function __construct(
        public readonly int $academicYearId,
        public readonly ?string $period,
        public readonly ?int $schoolId,
    ) {
    }

    /**
     * @param array<string, mixed> $state
     */
    public static function fromState(array $state, ?int $forcedSchoolId = null): self
    {
        $academicYearId = (int) ($state['academic_year_id'] ?? 0);
        $period = $state['period'] ?? null;
        $period = is_string($period) && $period !== '' ? $period : null;

        $schoolId = $forcedSchoolId;
        if ($schoolId === null) {
            $rawSchoolId = $state['school_id'] ?? null;
            $schoolId = $rawSchoolId ? (int) $rawSchoolId : null;
        }

        return new self($academicYearId, $period, $schoolId);
    }
}
