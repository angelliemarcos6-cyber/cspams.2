<?php

namespace App\Http\Requests\Api;

use App\Support\Domain\AccountStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSchoolHeadAccountStatusRequest extends FormRequest
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
            'accountStatus' => [
                'sometimes',
                'string',
                Rule::in([
                    AccountStatus::SUSPENDED->value,
                    AccountStatus::LOCKED->value,
                    AccountStatus::ARCHIVED->value,
                ]),
            ],
            'flagged' => ['sometimes', 'boolean'],
            'deleteRecordFlagged' => ['sometimes', 'boolean'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
            'verificationChallengeId' => ['sometimes', 'string', 'uuid'],
            'verificationCode' => ['sometimes', 'string', 'regex:/^\\d{6}$/'],
        ];
    }
}
