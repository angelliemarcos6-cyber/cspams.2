<?php

namespace App\Http\Requests\Api;

use App\Support\Domain\ReportingPeriod;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
            'indicators' => ['required', 'array', 'min:1'],
            'indicators.*.metric_id' => ['required', 'integer', 'exists:performance_metrics,id', 'distinct'],
            'indicators.*.target_value' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'indicators.*.actual_value' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'indicators.*.target' => ['sometimes', 'nullable', 'array'],
            'indicators.*.actual' => ['sometimes', 'nullable', 'array'],
            'indicators.*.remarks' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
