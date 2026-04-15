<?php

namespace App\Http\Requests\Api;

use App\Support\Domain\ReportingPeriod;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class GenerateFormSubmissionRequest extends FormRequest
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
            'school_id' => ['sometimes', 'nullable', 'integer', 'exists:schools,id'],
            'academic_year_id' => ['required', 'integer', 'exists:academic_years,id'],
            'reporting_period' => ['sometimes', 'nullable', 'string', Rule::in(array_keys(ReportingPeriod::options()))],
        ];
    }
}
