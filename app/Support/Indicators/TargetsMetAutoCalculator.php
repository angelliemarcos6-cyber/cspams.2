<?php

namespace App\Support\Indicators;

use App\Models\AcademicYear;
use App\Models\School;
use App\Models\Section;
use App\Models\Student;
use App\Models\StudentPerformanceRecord;
use App\Models\Teacher;
use App\Support\Domain\StudentStatus;
use Illuminate\Support\Collection;

class TargetsMetAutoCalculator
{
    /**
     * Auto-calculated TARGETS-MET KPI metrics.
     *
     * @var list<string>
     */
    private const AUTO_METRIC_CODES = [
        'NER',
        'RR',
        'DR',
        'TR',
        'NIR',
        'PR',
        'ALS_COMPLETER_PCT',
        'GPI',
        'IQR',
        'CR',
        'CSR',
        'PLM_NEARLY_PROF',
        'PLM_PROF',
        'PLM_HIGH_PROF',
        'AE_PASS_RATE',
        'VIOLENCE_REPORT_RATE',
        'LEARNER_SATISFACTION',
        'RIGHTS_AWARENESS',
        'RBE_MANIFEST',
    ];

    /**
     * @return list<string>
     */
    public function supportedCodes(): array
    {
        return self::AUTO_METRIC_CODES;
    }

    public function supports(string $metricCode): bool
    {
        return in_array(strtoupper(trim($metricCode)), self::AUTO_METRIC_CODES, true);
    }

    /**
     * @return array<string, array{
     *     target: array{values: array<string, float>},
     *     actual: array{values: array<string, float>},
     *     remarks: string
     * }>
     */
    public function deriveMatricesForSchool(int $schoolId): array
    {
        $schoolYears = app(RollingIndicatorYearWindow::class)->windowYears();
        $yearIds = AcademicYear::query()
            ->whereIn('name', $schoolYears)
            ->pluck('id', 'name');

        /** @var array<string, array<string, mixed>|null> $snapshots */
        $snapshots = [];
        foreach ($schoolYears as $year) {
            $academicYearId = $yearIds->get($year);
            $snapshots[$year] = is_numeric($academicYearId)
                ? $this->buildYearSnapshot($schoolId, (int) $academicYearId)
                : null;
        }

        $seriesByCode = $this->buildMetricSeriesByCode($schoolYears, $snapshots);
        $derived = [];

        foreach ($seriesByCode as $code => $series) {
            $actualValues = $this->backfillSeries($schoolYears, $series);
            $targetValues = $this->deriveTargetSeries($schoolYears, $actualValues);

            $derived[$code] = [
                'target' => ['values' => $targetValues],
                'actual' => ['values' => $actualValues],
                'remarks' => 'Auto-calculated from synchronized students, sections, teachers, and resource records.',
            ];
        }

        return $derived;
    }

    /**
     * @param array<string, array<string, mixed>|null> $snapshots
     *
     * @return array<string, array<string, float|null>>
     */
    private function buildMetricSeriesByCode(array $schoolYears, array $snapshots): array
    {
        $series = [];
        foreach (self::AUTO_METRIC_CODES as $code) {
            $series[$code] = [];
        }

        foreach ($schoolYears as $year) {
            $snapshot = $snapshots[$year] ?? null;

            $series['NER'][$year] = $snapshot['enrollmentRatePercent'] ?? null;
            $series['RR'][$year] = $snapshot['retentionRatePercent'] ?? null;
            $series['DR'][$year] = $snapshot['dropoutRatePercent'] ?? null;
            $series['TR'][$year] = $snapshot['transitionRatePercent'] ?? null;
            $series['NIR'][$year] = $snapshot['enrollmentRatePercent'] ?? null;
            $series['PR'][$year] = $snapshot['enrollmentRatePercent'] ?? null;
            $series['ALS_COMPLETER_PCT'][$year] = $snapshot['completionRatePercent'] ?? null;
            $series['GPI'][$year] = $snapshot['genderParityIndex'] ?? null;
            $series['IQR'][$year] = $snapshot['interquartileRatio'] ?? null;
            $series['CR'][$year] = $snapshot['completionRatePercent'] ?? null;
            $series['CSR'][$year] = $snapshot['retentionRatePercent'] ?? null;
            $series['PLM_NEARLY_PROF'][$year] = $snapshot['learningMasteryNearlyProficientPercent'] ?? null;
            $series['PLM_PROF'][$year] = $snapshot['learningMasteryProficientPercent'] ?? null;
            $series['PLM_HIGH_PROF'][$year] = $snapshot['learningMasteryHighlyProficientPercent'] ?? null;
            $series['AE_PASS_RATE'][$year] = $snapshot['aePassRatePercent'] ?? null;
            $series['VIOLENCE_REPORT_RATE'][$year] = 0.0;
            $series['LEARNER_SATISFACTION'][$year] = 0.0;
            $series['RIGHTS_AWARENESS'][$year] = 0.0;
            $series['RBE_MANIFEST'][$year] = $snapshot['rbeManifestPercent'] ?? null;
        }

        return $series;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function buildYearSnapshot(int $schoolId, int $academicYearId): ?array
    {
        $school = School::query()->find($schoolId, [
            'id',
            'status',
            'reported_student_count',
            'reported_teacher_count',
        ]);

        $studentsQuery = Student::query()
            ->where('school_id', $schoolId)
            ->where('academic_year_id', $academicYearId);

        $trackedLearners = (clone $studentsQuery)->count();
        $enrolledLearners = (clone $studentsQuery)->whereIn('status', [
            StudentStatus::ENROLLED->value,
            StudentStatus::RETURNING->value,
        ])->count();
        $dropoutLearners = (clone $studentsQuery)->where('status', StudentStatus::DROPPED_OUT->value)->count();
        $transfereeLearners = (clone $studentsQuery)->where('status', StudentStatus::TRANSFEREE->value)->count();
        $completerLearners = (clone $studentsQuery)->whereIn('status', [
            StudentStatus::COMPLETER->value,
            StudentStatus::GRADUATED->value,
        ])->count();
        $retainedLearners = max($trackedLearners - $dropoutLearners, 0);
        $femaleLearners = (clone $studentsQuery)->where('sex', 'female')->count();
        $maleLearners = (clone $studentsQuery)->where('sex', 'male')->count();

        $sections = Section::query()
            ->where('school_id', $schoolId)
            ->where('academic_year_id', $academicYearId)
            ->count();
        $teachers = Teacher::query()
            ->where('school_id', $schoolId)
            ->count();

        /** @var Collection<int, float> $performanceValues */
        $performanceValues = StudentPerformanceRecord::query()
            ->where('academic_year_id', $academicYearId)
            ->whereHas('student', function ($query) use ($schoolId): void {
                $query->where('school_id', $schoolId);
            })
            ->pluck('value')
            ->map(static fn (mixed $value): float => (float) $value)
            ->values();

        $performanceTotal = $performanceValues->count();
        $nearlyProficient = $performanceValues->filter(
            static fn (float $value): bool => $value >= 50 && $value < 75,
        )->count();
        $proficient = $performanceValues->filter(
            static fn (float $value): bool => $value >= 75 && $value < 90,
        )->count();
        $highlyProficient = $performanceValues->filter(
            static fn (float $value): bool => $value >= 90,
        )->count();
        $aePassers = $performanceValues->filter(
            static fn (float $value): bool => $value >= 75,
        )->count();

        $reportedStudents = (int) ($school?->reported_student_count ?? 0);
        $reportedTeachers = (int) ($school?->reported_teacher_count ?? 0);

        $hasData = $trackedLearners > 0
            || $sections > 0
            || $teachers > 0
            || $performanceTotal > 0
            || $reportedStudents > 0
            || $reportedTeachers > 0;

        if (! $hasData) {
            return null;
        }

        return [
            'enrollmentRatePercent' => $this->percentage($enrolledLearners, $trackedLearners),
            'retentionRatePercent' => $this->percentage($retainedLearners, $trackedLearners),
            'dropoutRatePercent' => $this->percentage($dropoutLearners, $trackedLearners),
            'transitionRatePercent' => $this->percentage($transfereeLearners + $completerLearners, $trackedLearners),
            'completionRatePercent' => $this->percentage($completerLearners, $trackedLearners),
            'genderParityIndex' => $this->ratio($femaleLearners, $maleLearners),
            'interquartileRatio' => $this->interquartileRatio($performanceValues),
            'learningMasteryNearlyProficientPercent' => $this->percentage($nearlyProficient, $performanceTotal),
            'learningMasteryProficientPercent' => $this->percentage($proficient, $performanceTotal),
            'learningMasteryHighlyProficientPercent' => $this->percentage($highlyProficient, $performanceTotal),
            'aePassRatePercent' => $this->percentage($aePassers, $performanceTotal),
            'rbeManifestPercent' => ($school?->status === 'active') ? 100.0 : 0.0,
        ];
    }

    /**
     * @param array<string, float|null> $series
     *
     * @return array<string, float>
     */
    private function backfillSeries(array $years, array $series): array
    {
        $values = [];
        foreach ($years as $year) {
            $raw = $series[$year] ?? null;
            $values[] = is_numeric($raw) ? (float) $raw : null;
        }

        $previous = null;
        foreach ($values as $index => $value) {
            if ($value !== null) {
                $previous = $value;
                continue;
            }

            if ($previous !== null) {
                $values[$index] = $previous;
            }
        }

        $next = null;
        for ($index = count($values) - 1; $index >= 0; $index--) {
            $value = $values[$index];
            if ($value !== null) {
                $next = $value;
                continue;
            }

            if ($next !== null) {
                $values[$index] = $next;
            }
        }

        $filled = [];
        foreach ($years as $index => $year) {
            $filled[$year] = round((float) ($values[$index] ?? 0.0), 2);
        }

        return $filled;
    }

    /**
     * @param array<string, float> $actualValues
     *
     * @return array<string, float>
     */
    private function deriveTargetSeries(array $years, array $actualValues): array
    {
        $targets = [];
        $previousActual = null;

        foreach ($years as $year) {
            $actual = (float) ($actualValues[$year] ?? 0.0);

            $targets[$year] = round($previousActual ?? $actual, 2);
            $previousActual = $actual;
        }

        return $targets;
    }

    private function percentage(int $numerator, int $denominator): float
    {
        if ($denominator <= 0) {
            return 0.0;
        }

        return round(($numerator / $denominator) * 100, 2);
    }

    private function ratio(int $numerator, int $denominator): float
    {
        if ($denominator <= 0) {
            return $numerator > 0 ? 1.0 : 0.0;
        }

        return round($numerator / $denominator, 2);
    }

    private function interquartileRatio(Collection $values): ?float
    {
        if ($values->count() < 4) {
            return null;
        }

        $sorted = $values->sort()->values()->all();
        $q1 = $this->percentile($sorted, 25);
        $q3 = $this->percentile($sorted, 75);

        if ($q1 <= 0) {
            return null;
        }

        return round($q3 / $q1, 2);
    }

    /**
     * @param array<int, float> $sortedValues
     */
    private function percentile(array $sortedValues, int $percent): float
    {
        $count = count($sortedValues);
        if ($count === 0) {
            return 0.0;
        }

        if ($count === 1) {
            return (float) $sortedValues[0];
        }

        $rank = ($percent / 100) * ($count - 1);
        $lowerIndex = (int) floor($rank);
        $upperIndex = (int) ceil($rank);

        if ($lowerIndex === $upperIndex) {
            return (float) $sortedValues[$lowerIndex];
        }

        $weight = $rank - $lowerIndex;
        $lower = (float) $sortedValues[$lowerIndex];
        $upper = (float) $sortedValues[$upperIndex];

        return $lower + (($upper - $lower) * $weight);
    }
}
