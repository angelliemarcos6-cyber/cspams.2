<?php

namespace App\Http\Requests\Api;

use App\Models\PerformanceMetric;
use App\Support\Domain\ReportingPeriod;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpsertIndicatorSubmissionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'academic_year_id' => ['required', 'integer', 'exists:academic_years,id'],
            'reporting_period' => ['sometimes', 'nullable', 'string', Rule::in(array_keys(ReportingPeriod::options()))],
            'notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'mode' => ['sometimes', 'nullable', 'string', Rule::in(['upsert', 'full_replace'])],
            'replace_missing' => ['sometimes', 'nullable', 'boolean'],
            'indicators' => ['sometimes', 'array'],
            'indicators.*.metric_id' => ['sometimes', 'nullable', 'integer'],
            'indicators.*.metric_code' => ['sometimes', 'nullable', 'string', 'max:255'],
            'indicators.*.target_value' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'indicators.*.actual_value' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'indicators.*.target' => ['sometimes', 'nullable', 'array'],
            'indicators.*.actual' => ['sometimes', 'nullable', 'array'],
            'indicators.*.remarks' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $indicators = $this->input('indicators');
        if (! is_array($indicators)) {
            return;
        }

        $normalized = array_map(static function (mixed $row): mixed {
            if (! is_array($row)) {
                return $row;
            }

            if (array_key_exists('metric_code', $row)) {
                $row['metric_code'] = strtoupper(trim((string) $row['metric_code']));
            }

            return $row;
        }, $indicators);

        $this->merge(['indicators' => $normalized]);
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $rows = $this->input('indicators', []);
            if (! is_array($rows)) {
                return;
            }

            $seenMetricIds = [];
            $seenMetricCodes = [];

            foreach ($rows as $index => $row) {
                if (! is_array($row)) {
                    continue;
                }

                $metricId = Arr::get($row, 'metric_id');
                $metricCode = strtoupper(trim((string) Arr::get($row, 'metric_code', '')));

                if (($metricId === null || $metricId === '') && $metricCode === '') {
                    $validator->errors()->add(
                        "indicators.{$index}.metric_code",
                        'An indicator row must include either metric_id or metric_code.',
                    );
                    continue;
                }

                if ($metricId !== null && $metricId !== '') {
                    if (! is_numeric($metricId) || (int) $metricId <= 0) {
                        $validator->errors()->add(
                            "indicators.{$index}.metric_id",
                            'Metric ID must be a positive integer when provided.',
                        );
                    } else {
                        $normalizedMetricId = (int) $metricId;
                        if ($metricCode === '' && ! PerformanceMetric::query()->whereKey($normalizedMetricId)->exists()) {
                            $validator->errors()->add(
                                "indicators.{$index}.metric_id",
                                'Selected indicator metric does not exist.',
                            );
                        }
                        if (isset($seenMetricIds[$normalizedMetricId])) {
                            $validator->errors()->add(
                                "indicators.{$index}.metric_id",
                                'Duplicate metric_id values are not allowed in one submission payload.',
                            );
                        } else {
                            $seenMetricIds[$normalizedMetricId] = true;
                        }
                    }
                }

                if ($metricCode !== '') {
                    if (isset($seenMetricCodes[$metricCode])) {
                        $validator->errors()->add(
                            "indicators.{$index}.metric_code",
                            'Duplicate metric_code values are not allowed in one submission payload.',
                        );
                    } else {
                        $seenMetricCodes[$metricCode] = true;
                    }
                }
            }
        });
    }
}
