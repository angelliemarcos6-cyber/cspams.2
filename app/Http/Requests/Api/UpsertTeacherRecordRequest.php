<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpsertTeacherRecordRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $normalize = static function (?string $value): ?string {
            if ($value === null) {
                return null;
            }

            $trimmed = trim($value);

            return $trimmed === '' ? null : $trimmed;
        };

        $payload = [];

        if ($this->has('name')) {
            $payload['name'] = $normalize($this->input('name'));
        }

        if ($this->has('sex')) {
            $normalizedSex = $normalize($this->input('sex'));
            $payload['sex'] = $normalizedSex ? strtolower($normalizedSex) : null;
        }

        if ($payload !== []) {
            $this->merge($payload);
        }
    }

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
            'name' => ['required', 'string', 'max:255'],
            'sex' => ['sometimes', 'nullable', 'string', Rule::in(['male', 'female'])],
        ];
    }
}

