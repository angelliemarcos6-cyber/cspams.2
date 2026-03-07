<?php

namespace App\Http\Requests\Api;

use App\Support\Domain\FormSubmissionStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReviewIndicatorSubmissionRequest extends FormRequest
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
            'decision' => ['required', 'string', Rule::in([
                FormSubmissionStatus::VALIDATED->value,
                FormSubmissionStatus::RETURNED->value,
            ])],
            'notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];
    }
}
