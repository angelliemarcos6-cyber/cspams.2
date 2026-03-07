<?php

namespace App\Http\Requests\Api;

use App\Support\Domain\FormSubmissionStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ValidateFormSubmissionRequest extends FormRequest
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
            'notes' => [
                Rule::requiredIf(
                    fn (): bool => $this->input('decision') === FormSubmissionStatus::RETURNED->value,
                ),
                'nullable',
                'string',
                'max:1000',
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'notes.required' => 'Validation notes are required when returning a submission.',
        ];
    }
}
