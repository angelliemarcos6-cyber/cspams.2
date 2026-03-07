<?php

namespace App\Support\Forms;

use App\Models\AcademicYear;
use App\Models\School;
use App\Models\Student;
use App\Models\StudentPerformanceRecord;
use App\Support\Domain\ReportingPeriod;
use App\Support\Domain\StudentStatus;

class Sf5PayloadFactory
{
    /**
     * @return array<string, mixed>
     */
    public function build(int $schoolId, int $academicYearId, ?string $period = null): array
    {
        $school = School::query()
            ->select(['id', 'school_code', 'name', 'district', 'region'])
            ->findOrFail($schoolId);

        $academicYear = AcademicYear::query()
            ->select(['id', 'name', 'start_date', 'end_date'])
            ->findOrFail($academicYearId);

        $students = Student::query()
            ->with(['section:id,name,grade_level'])
            ->where('school_id', $schoolId)
            ->where('academic_year_id', $academicYearId)
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get();

        $performanceRecords = StudentPerformanceRecord::query()
            ->with(['metric:id,code,name'])
            ->where('academic_year_id', $academicYearId)
            ->when(
                $period !== null,
                fn ($query) => $query->where('period', $period),
            )
            ->whereHas('student', function ($studentQuery) use ($schoolId): void {
                $studentQuery->where('school_id', $schoolId);
            })
            ->get();

        $statusBreakdown = [];
        foreach (StudentStatus::options() as $statusValue => $label) {
            $statusBreakdown[$statusValue] = [
                'label' => $label,
                'count' => 0,
            ];
        }

        $gradeLevelOutcomes = [];
        foreach ($students as $student) {
            $status = $this->statusValue($student->status) ?? StudentStatus::ENROLLED->value;

            if (! isset($statusBreakdown[$status])) {
                $statusBreakdown[$status] = [
                    'label' => ucwords(str_replace('_', ' ', $status)),
                    'count' => 0,
                ];
            }
            $statusBreakdown[$status]['count']++;

            $gradeLevel = (string) ($student->current_level ?: $student->section?->grade_level ?: 'Unspecified');
            if (! isset($gradeLevelOutcomes[$gradeLevel])) {
                $gradeLevelOutcomes[$gradeLevel] = [
                    'grade_level' => $gradeLevel,
                    'total' => 0,
                    'status_counts' => [],
                ];
            }

            $gradeLevelOutcomes[$gradeLevel]['total']++;
            $gradeLevelOutcomes[$gradeLevel]['status_counts'][$status] = ($gradeLevelOutcomes[$gradeLevel]['status_counts'][$status] ?? 0) + 1;
        }
        ksort($gradeLevelOutcomes);

        $metricSummaries = [];
        foreach ($performanceRecords->groupBy(function (StudentPerformanceRecord $record): string {
            return implode('|', [
                $record->metric?->code ?? 'UNK',
                $record->metric?->name ?? 'Unknown Metric',
                $this->periodValue($record->period) ?? '-',
            ]);
        }) as $key => $records) {
            [$metricCode, $metricName, $metricPeriod] = explode('|', $key);
            $values = $records->pluck('value')->map(fn ($value): float => (float) $value);

            $metricSummaries[] = [
                'metric_code' => $metricCode,
                'metric_name' => $metricName,
                'period' => $metricPeriod,
                'period_label' => ReportingPeriod::options()[$metricPeriod] ?? $metricPeriod,
                'records' => $records->count(),
                'average_value' => round($values->avg() ?? 0, 2),
                'lowest_value' => round($values->min() ?? 0, 2),
                'highest_value' => round($values->max() ?? 0, 2),
            ];
        }

        usort($metricSummaries, function (array $left, array $right): int {
            return [$left['metric_code'], $left['period']] <=> [$right['metric_code'], $right['period']];
        });

        $studentById = $students->keyBy('id');
        $learnerOutcomes = [];

        foreach ($performanceRecords->groupBy('student_id') as $studentId => $records) {
            /** @var Student|null $student */
            $student = $studentById->get((int) $studentId);
            if (! $student) {
                continue;
            }

            $gradeLevel = (string) ($student->current_level ?: $student->section?->grade_level ?: 'Unspecified');
            $status = $this->statusValue($student->status) ?? StudentStatus::ENROLLED->value;
            $scores = $records->pluck('value')->map(fn ($value): float => (float) $value);

            $learnerOutcomes[] = [
                'student_id' => $student->id,
                'lrn' => $student->lrn,
                'full_name' => $student->full_name,
                'grade_level' => $gradeLevel,
                'section' => $student->section?->name,
                'status' => $status,
                'status_label' => StudentStatus::options()[$status] ?? $status,
                'metrics_encoded' => $records->count(),
                'average_score' => round($scores->avg() ?? 0, 2),
            ];
        }

        usort($learnerOutcomes, function (array $left, array $right): int {
            return [$left['grade_level'], $left['full_name']] <=> [$right['grade_level'], $right['full_name']];
        });

        $totalLearners = $students->count();
        $promotedLearners = (int) (
            ($statusBreakdown[StudentStatus::RETURNING->value]['count'] ?? 0)
            + ($statusBreakdown[StudentStatus::COMPLETER->value]['count'] ?? 0)
            + ($statusBreakdown[StudentStatus::GRADUATED->value]['count'] ?? 0)
        );

        $droppedOutLearners = (int) ($statusBreakdown[StudentStatus::DROPPED_OUT->value]['count'] ?? 0);
        $atRiskLearners = (int) ($statusBreakdown[StudentStatus::AT_RISK->value]['count'] ?? 0);

        return [
            'form' => 'SF-5',
            'title' => 'Report on Promotion and Learning Progress & Achievement',
            'generated_at' => now()->toISOString(),
            'school' => [
                'id' => $school->id,
                'school_code' => $school->school_code,
                'name' => $school->name,
                'district' => $school->district,
                'region' => $school->region,
            ],
            'academic_year' => [
                'id' => $academicYear->id,
                'name' => $academicYear->name,
                'start_date' => optional($academicYear->start_date)->format('Y-m-d'),
                'end_date' => optional($academicYear->end_date)->format('Y-m-d'),
            ],
            'reporting_period' => $period,
            'reporting_period_label' => $period ? (ReportingPeriod::options()[$period] ?? $period) : 'All Periods',
            'summary' => [
                'total_learners' => $totalLearners,
                'promoted_or_completed_learners' => $promotedLearners,
                'dropped_out_learners' => $droppedOutLearners,
                'at_risk_learners' => $atRiskLearners,
                'promotion_completion_rate' => $this->percentage($promotedLearners, $totalLearners),
                'dropout_rate' => $this->percentage($droppedOutLearners, $totalLearners),
                'at_risk_rate' => $this->percentage($atRiskLearners, $totalLearners),
                'status_breakdown' => array_values($statusBreakdown),
                'grade_level_outcomes' => array_values($gradeLevelOutcomes),
            ],
            'metric_summaries' => $metricSummaries,
            'learner_outcomes' => $learnerOutcomes,
        ];
    }

    private function percentage(int $numerator, int $denominator): float
    {
        if ($denominator <= 0) {
            return 0.0;
        }

        return round(($numerator / $denominator) * 100, 2);
    }

    private function statusValue(mixed $status): ?string
    {
        if ($status instanceof StudentStatus) {
            return $status->value;
        }

        return is_string($status) && $status !== '' ? $status : null;
    }

    private function periodValue(mixed $period): ?string
    {
        if ($period instanceof ReportingPeriod) {
            return $period->value;
        }

        return is_string($period) && $period !== '' ? $period : null;
    }
}
