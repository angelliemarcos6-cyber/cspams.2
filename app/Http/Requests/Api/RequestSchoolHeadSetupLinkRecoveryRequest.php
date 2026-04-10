<?php

namespace App\Http\Requests\Api;

use App\Support\Auth\AuthLoginNormalizer;
use Illuminate\Foundation\Http\FormRequest;

class RequestSchoolHeadSetupLinkRecoveryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'school_code' => AuthLoginNormalizer::normalizeSchoolCodeForValidation($this->input('school_code')),
        ]);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'school_code' => ['required', 'string', 'size:6', 'regex:/^\d{6}$/'],
        ];
    }
}
