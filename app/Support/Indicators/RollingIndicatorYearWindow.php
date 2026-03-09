<?php

namespace App\Support\Indicators;

use App\Models\IndicatorSubmissionItem;
use App\Models\PerformanceMetric;
use App\Support\Domain\MetricDataType;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Cache;

class RollingIndicatorYearWindow
{
    private const BASE_START_YEAR = 2026;
    private const WINDOW_SIZE = 5;
    private const SCHOOL_YEAR_START_MONTH = 6;
    private const CACHE_SIGNATURE_KEY = 'cspams.indicators.year_window_signature';

    /**
     * @return array{
     *     years: array<int, string>,
     *     metricsUpdated: int,
     *     itemsUpdated: int
     * }
     */
    public function sync(): array
    {
        $years = $this->windowYears();
        $signature = implode('|', $years);

        if (Cache::get(self::CACHE_SIGNATURE_KEY) === $signature) {
            return [
                'years' => $years,
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
        $now = CarbonImmutable::now();
        $currentSchoolYearStart = $now->month >= self::SCHOOL_YEAR_START_MONTH
            ? (int) $now->year
            : ((int) $now->year - 1);

        return max(self::BASE_START_YEAR, $currentSchoolYearStart);
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
