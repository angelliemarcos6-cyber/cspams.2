<?php

namespace App\Support\Reports;

use App\Models\StudentPerformanceRecord;
use App\Support\Domain\ReportingPeriod;

class PerformanceSummaryReportService
{
    /**
     * @return array<int, array<string, int|float|string>>
     */
    public function generate(ReportFilters $filters): array
    {
        $records = StudentPerformanceRecord::query()
            ->with(['student.school:id,name', 'metric:id,name'])
            ->where('academic_year_id', $filters->academicYearId)
            ->when($filters->period, fn ($query, string $value) => $query->where('period', $value))
            ->when($filters->schoolId, function ($query, int $value): void {
                $query->whereHas('student', function ($studentQuery) use ($value): void {
                    $studentQuery->where('school_id', $value);
                });
            })
            ->get();

        $grouped = $records->groupBy(function (StudentPerformanceRecord $record): string {
            $periodValue = is_string($record->period) ? $record->period : $record->period?->value;

            return implode('|', [
                $record->student?->school?->name ?? 'Unknown School',
                $record->metric?->name ?? 'Unknown Metric',
                $periodValue ?? '-',
            ]);
        });

        $rows = [];

        foreach ($grouped as $key => $items) {
            [$schoolName, $metricName, $periodValue] = explode('|', $key);
            $values = $items->pluck('value')->map(fn ($value): float => (float) $value);

            $rows[] = [
                'school' => $schoolName,
                'metric' => $metricName,
                'period' => ReportingPeriod::options()[$periodValue] ?? $periodValue,
                'records' => $items->count(),
                'average_value' => round($values->avg() ?? 0, 2),
                'lowest_value' => round($values->min() ?? 0, 2),
                'highest_value' => round($values->max() ?? 0, 2),
            ];
        }

        usort($rows, function (array $a, array $b): int {
            return [$a['school'], $a['metric'], $a['period']] <=> [$b['school'], $b['metric'], $b['period']];
        });

        return $rows;
    }
}