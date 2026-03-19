<?php

namespace App\Http\Requests\Api;

use App\Support\Domain\AccountStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IssueSchoolHeadAccountActionVerificationCodeRequest extends FormRequest
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
            'targetStatus' => [
                'required',
                'string',
                Rule::in([
                    AccountStatus::SUSPENDED->value,
                    AccountStatus::LOCKED->value,
                    AccountStatus::ARCHIVED->value,
                ]),
            ],
        ];
    }
}

