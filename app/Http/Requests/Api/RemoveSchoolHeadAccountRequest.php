<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RemoveSchoolHeadAccountRequest extends FormRequest
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
            'reason' => ['nullable', 'string', 'max:500'],
            'verificationChallengeId' => ['required', 'string', 'uuid'],
            'verificationCode' => ['required', 'string', 'regex:/^\\d{6}$/'],
        ];
    }
}

