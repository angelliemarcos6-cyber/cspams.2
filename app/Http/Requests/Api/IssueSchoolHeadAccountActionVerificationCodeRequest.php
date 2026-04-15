<?php

namespace App\Http\Requests\Api;

use App\Support\Domain\AccountStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IssueSchoolHeadAccountActionVerificationCodeRequest extends FormRequest
{
    public const TARGET_EMAIL_CHANGE = 'email_change';
    public const TARGET_PASSWORD_RESET = 'password_reset';

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
            'targetStatus' => [
                'required',
                'string',
                Rule::in([
                    AccountStatus::SUSPENDED->value,
                    AccountStatus::LOCKED->value,
                    AccountStatus::ARCHIVED->value,
                    'deleted',
                    self::TARGET_EMAIL_CHANGE,
                    self::TARGET_PASSWORD_RESET,
                ]),
            ],
        ];
    }
}
