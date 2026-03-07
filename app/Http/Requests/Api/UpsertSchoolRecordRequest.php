<?php

namespace App\Http\Requests\Api;

use App\Support\Domain\SchoolStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpsertSchoolRecordRequest extends FormRequest
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
            'schoolName' => ['sometimes', 'nullable', 'string', 'max:255'],
            'studentCount' => ['required', 'integer', 'min:0'],
            'teacherCount' => ['required', 'integer', 'min:0'],
            'region' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['required', 'string', Rule::in(array_column(SchoolStatus::cases(), 'value'))],
            'district' => ['sometimes', 'nullable', 'string', 'max:255'],
            'type' => ['sometimes', 'nullable', 'string', Rule::in(['public', 'private'])],
        ];
    }
}
