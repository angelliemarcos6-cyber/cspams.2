<?php

namespace App\Http\Requests\Api;

use App\Models\Student;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpsertStudentRecordRequest extends FormRequest
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
        $studentParam = $this->route('student');
        $studentId = $studentParam instanceof Student ? $studentParam->id : null;

        return [
            'lrn' => [
                'required',
                'string',
                'max:20',
                Rule::unique('students', 'lrn')->ignore($studentId),
            ],
            'firstName' => ['required', 'string', 'max:255'],
            'middleName' => ['sometimes', 'nullable', 'string', 'max:255'],
            'lastName' => ['required', 'string', 'max:255'],
            'sex' => ['sometimes', 'nullable', 'string', Rule::in(['male', 'female'])],
            'birthDate' => ['sometimes', 'nullable', 'date', 'before_or_equal:today'],
            'status' => ['required', 'string', Rule::in(array_column(StudentStatus::cases(), 'value'))],
            'riskLevel' => ['sometimes', 'nullable', 'string', Rule::in(array_column(StudentRiskLevel::cases(), 'value'))],
            'section' => ['sometimes', 'nullable', 'string', 'max:255'],
            'teacher' => ['sometimes', 'nullable', 'string', 'max:255'],
            'currentLevel' => ['sometimes', 'nullable', 'string', 'max:255'],
            'trackedFromLevel' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
