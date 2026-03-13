<?php

namespace App\Support\Indicators;

use App\Models\AcademicYear;
use App\Models\IndicatorSubmissionItem;
use App\Models\PerformanceMetric;
use App\Support\Domain\MetricDataType;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class RollingIndicatorYearWindow
{
    private const BASE_START_YEAR = 2025;
    private const WINDOW_SIZE = 5;
    private const SCHOOL_YEAR_START_MONTH = 6;
    private const SCHOOL_YEAR_END_MONTH = 3;
    private const SCHOOL_YEAR_END_DAY = 31;
    private const CACHE_SIGNATURE_KEY = 'cspams.indicators.year_window_signature';

    /**
     * @return array{
     *     years: array<int, string>,
     *     academicYearsUpserted: int,
     *     academicYearsDeleted: int,
     *     metricsUpdated: int,
     *     itemsUpdated: int
     * }
     */
    public function sync(): array
    {
        $years = $this->windowYears();
        ['upserted' => $academicYearsUpserted, 'deleted' => $academicYearsDeleted] = $this->syncAcademicYears($years);
        $signature = implode('|', $years);

        if (Cache::get(self::CACHE_SIGNATURE_KEY) === $signature) {
            return [
                'years' => $years,
                'academicYearsUpserted' => $academicYearsUpserted,
                'academicYearsDeleted' => $academicYearsDeleted,
                'metricsUpdated' => 0,
                'itemsUpdated' => 0,
            ];
        }

        $metrics = PerformanceMetric::query()
            ->where('is_active', true)
            ->where('data_type', MetricDataType::YEARLY_MATRIX->value)
            ->get(['id', 'input_schema']);

        $metricsUpdated = $this->syncMetricSchemas($metrics, $years);
        $itemsUpdated = $this->purgeOldItemValues($metrics, $years);

        Cache::forever(self::CACHE_SIGNATURE_KEY, $signature);

        return [
            'years' => $years,
            'academicYearsUpserted' => $academicYearsUpserted,
            'academicYearsDeleted' => $academicYearsDeleted,
            'metricsUpdated' => $metricsUpdated,
            'itemsUpdated' => $itemsUpdated,
        ];
    }

    /**
     * @return array<int, string>
     */
    public function windowYears(): array
    {
        $startYear = $this->rollingStartYear();
        $years = [];

        for ($offset = 0; $offset < self::WINDOW_SIZE; $offset++) {
            $from = $startYear + $offset;
            $to = $from + 1;
            $years[] = "{$from}-{$to}";
        }

        return $years;
    }

    private function rollingStartYear(): int
    {
        // Keep the initial 5-year window anchored at 2025-2026 until a true
        // 6th school year appears, then slide forward by one each school year.
        $windowEndYear = max(
            self::BASE_START_YEAR + self::WINDOW_SIZE - 1,
            $this->currentSchoolYearStartYear(),
        );

        return $windowEndYear - (self::WINDOW_SIZE - 1);
    }

    private function currentSchoolYearStartYear(): int
    {
        $now = CarbonImmutable::now();

        return $now->month >= self::SCHOOL_YEAR_START_MONTH
            ? (int) $now->year
            : ((int) $now->year - 1);
    }

    private function currentSchoolYearName(array $years): string
    {
        if ($years === []) {
            throw new \RuntimeException('Cannot resolve current school year from an empty rolling window.');
        }

        $windowStartYear = $this->rollingStartYear();
        $windowEndYear = $windowStartYear + self::WINDOW_SIZE - 1;
        $currentStartYear = $this->currentSchoolYearStartYear();
        $clampedStartYear = max($windowStartYear, min($currentStartYear, $windowEndYear));

        return "{$clampedStartYear}-" . ($clampedStartYear + 1);
    }

    /**
     * @param array<int, string> $years
     *
     * @return array{upserted: int, deleted: int}
     */
    private function syncAcademicYears(array $years): array
    {
        $currentSchoolYearName = $this->currentSchoolYearName($years);

        return DB::transaction(function () use ($years, $currentSchoolYearName): array {
            $upserted = 0;

            foreach ($years as $schoolYearName) {
                [$startYear, $endYear] = $this->splitSchoolYear($schoolYearName);

                $academicYear = AcademicYear::query()->updateOrCreate(
                    ['name' => $schoolYearName],
                    [
                        'start_date' => sprintf('%04d-%02d-01', $startYear, self::SCHOOL_YEAR_START_MONTH),
                        'end_date' => sprintf(
                            '%04d-%02d-%02d',
                            $endYear,
                            self::SCHOOL_YEAR_END_MONTH,
                            self::SCHOOL_YEAR_END_DAY,
                        ),
                        'is_current' => $schoolYearName === $currentSchoolYearName,
                    ],
                );

                if (
                    $academicYear->wasRecentlyCreated
                    || $academicYear->wasChanged(['start_date', 'end_date', 'is_current'])
                ) {
                    $upserted++;
                }
            }

            $deleted = AcademicYear::query()
                ->whereNotIn('name', $years)
                ->delete();

            return [
                'upserted' => $upserted,
                'deleted' => $deleted,
            ];
        });
    }

    /**
     * @return array{0: int, 1: int}
     */
    private function splitSchoolYear(string $schoolYearName): array
    {
        [$rawStartYear, $rawEndYear] = explode('-', $schoolYearName, 2) + [1 => ''];
        $startYear = (int) trim($rawStartYear);
        $endYear = (int) trim($rawEndYear);

        if ($startYear <= 0 || $endYear !== $startYear + 1) {
            throw new \RuntimeException("Invalid school year format: {$schoolYearName}");
        }

        return [$startYear, $endYear];
    }

    /**
     * @param Collection<int, PerformanceMetric> $metrics
     * @param array<int, string> $years
     */
    private function syncMetricSchemas(Collection $metrics, array $years): int
    {
        $updates = 0;

        foreach ($metrics as $metric) {
            $schema = is_array($metric->input_schema) ? $metric->input_schema : [];
            $existingYears = array_values(array_filter(
                array_map(static fn (mixed $value): string => trim((string) $value), (array) ($schema['years'] ?? [])),
                static fn (string $value): bool => $value !== '',
            ));

            if ($existingYears === $years) {
                continue;
            }

            $schema['years'] = $years;
            $metric->forceFill(['input_schema' => $schema])->save();
            $updates++;
        }

        return $updates;
    }

    /**
     * @param Collection<int, PerformanceMetric> $metrics
     * @param array<int, string> $years
     */
    private function purgeOldItemValues(Collection $metrics, array $years): int
    {
        $metricIds = $metrics->pluck('id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->values();

        if ($metricIds->isEmpty()) {
            return 0;
        }

        $updated = 0;
        IndicatorSubmissionItem::query()
            ->whereIn('performance_metric_id', $metricIds)
            ->where(function ($query): void {
                $query->whereNotNull('target_typed_value')
                    ->orWhereNotNull('actual_typed_value');
            })
            ->chunkById(200, function (Collection $items) use (&$updated, $years): void {
                foreach ($items as $item) {
                    $targetTypedValue = $this->pruneYearValues($item->target_typed_value, $years);
                    $actualTypedValue = $this->pruneYearValues($item->actual_typed_value, $years);

                    if ($targetTypedValue === $item->target_typed_value && $actualTypedValue === $item->actual_typed_value) {
                        continue;
                    }

                    $item->forceFill([
                        'target_typed_value' => $targetTypedValue,
                        'actual_typed_value' => $actualTypedValue,
                    ])->save();

                    $updated++;
                }
            });

        return $updated;
    }

    /**
     * @param array<string, mixed>|null $typedValue
     * @param array<int, string> $years
     *
     * @return array<string, mixed>|null
     */
    private function pruneYearValues(?array $typedValue, array $years): ?array
    {
        if (! is_array($typedValue)) {
            return $typedValue;
        }

        $rawValues = $typedValue['values'] ?? null;
        if (! is_array($rawValues)) {
            return $typedValue;
        }

        $trimmedValues = [];
        foreach ($years as $year) {
            if (array_key_exists($year, $rawValues)) {
                $trimmedValues[$year] = $rawValues[$year];
            }
        }

        $typedValue['values'] = $trimmedValues;

        return $typedValue;
    }
}
