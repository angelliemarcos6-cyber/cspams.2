<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;
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
        ];
    }
}

