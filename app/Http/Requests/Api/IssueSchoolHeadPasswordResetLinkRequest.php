<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class IssueSchoolHeadPasswordResetLinkRequest extends FormRequest
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
            'reason' => ['required', 'string', 'min:5', 'max:500'],
            'verificationChallengeId' => ['required', 'string', 'uuid'],
            'verificationCode' => ['required', 'string', 'regex:/^\\d{6}$/'],
        ];
    }
}
