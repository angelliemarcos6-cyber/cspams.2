<?php

namespace App\Support\Reports;

use App\Models\School;
use App\Models\Student;
use App\Models\StudentPerformanceRecord;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;

class SchoolSummaryReportService
{
    /**
     * @return array<int, array<string, int|float|string>>
     */
    public function generate(ReportFilters $filters): array
    {
        $schools = School::query()
            ->select(['id', 'name', 'district'])
            ->when($filters->schoolId, fn ($query, int $value) => $query->whereKey($value))
            ->orderBy('name')
            ->get();

        $rows = [];

        foreach ($schools as $school) {
            $studentsBase = Student::query()
                ->where('school_id', $school->id)
                ->where('academic_year_id', $filters->academicYearId);

            $totalLearners = (clone $studentsBase)->count();
            $atRisk = (clone $studentsBase)->where('status', StudentStatus::AT_RISK->value)->count();
            $droppedOut = (clone $studentsBase)->where('status', StudentStatus::DROPPED_OUT->value)->count();
            $highRisk = (clone $studentsBase)->where('risk_level', StudentRiskLevel::HIGH->value)->count();

            $performanceBase = StudentPerformanceRecord::query()
                ->where('academic_year_id', $filters->academicYearId)
                ->whereHas('student', function ($studentQuery) use ($school): void {
                    $studentQuery->where('school_id', $school->id);
                });

            if ($filters->period) {
                $performanceBase->where('period', $filters->period);
            }

            $performanceSubmissions = (clone $performanceBase)->count();
            $latestSubmission = (clone $performanceBase)->max('submitted_at');

            $rows[] = [
                'school' => $school->name,
                'district' => $school->district,
                'total_learners' => $totalLearners,
                'at_risk' => $atRisk,
                'dropped_out' => $droppedOut,
                'high_risk' => $highRisk,
                'dropout_rate' => $totalLearners > 0 ? round(($droppedOut / $totalLearners) * 100, 2) : 0,
                'performance_submissions' => $performanceSubmissions,
                'latest_submission' => $latestSubmission ? (string) $latestSubmission : '-',
            ];
        }

        return $rows;
    }
}