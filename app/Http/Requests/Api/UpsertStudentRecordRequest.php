<?php

namespace App\Http\Requests\Api;

use App\Models\Student;
use App\Support\Auth\ApiUserResolver;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpsertStudentRecordRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $normalize = static function (?string $value): ?string {
            if ($value === null) {
                return null;
            }

            $trimmed = preg_replace('/\s+/', ' ', trim($value)) ?? '';

            return $trimmed === '' ? null : $trimmed;
        };

        $payload = [];

        if ($this->has('lrn')) {
            $payload['lrn'] = $normalize($this->input('lrn'));
        }

        if ($this->has('firstName')) {
            $payload['firstName'] = $normalize($this->input('firstName'));
        }

        if ($this->has('middleName')) {
            $payload['middleName'] = $normalize($this->input('middleName'));
        }

        if ($this->has('lastName')) {
            $payload['lastName'] = $normalize($this->input('lastName'));
        }

        if ($this->has('sex')) {
            $normalizedSex = $normalize($this->input('sex'));
            $payload['sex'] = $normalizedSex ? strtolower($normalizedSex) : null;
        }

        if ($this->has('status')) {
            $normalizedStatus = $normalize($this->input('status'));
            $payload['status'] = $normalizedStatus ? strtolower($normalizedStatus) : null;
        }

        if ($this->has('riskLevel')) {
            $normalizedRiskLevel = $normalize($this->input('riskLevel'));
            $payload['riskLevel'] = $normalizedRiskLevel ? strtolower($normalizedRiskLevel) : null;
        }

        if ($this->has('section')) {
            $payload['section'] = $normalize($this->input('section'));
        }

        if ($this->has('teacher')) {
            $payload['teacher'] = $normalize($this->input('teacher'));
        }

        if ($this->has('currentLevel')) {
            $payload['currentLevel'] = $normalize($this->input('currentLevel'));
        }

        if ($this->has('trackedFromLevel')) {
            $payload['trackedFromLevel'] = $normalize($this->input('trackedFromLevel'));
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
        $studentParam = $this->route('student');
        $studentId = $studentParam instanceof Student ? $studentParam->id : null;
        $actor = ApiUserResolver::fromRequest($this);
        $schoolId = $studentParam instanceof Student
            ? (int) $studentParam->school_id
            : (int) ($actor?->school_id ?? 0);

        $lrnUniqueRule = Rule::unique('students', 'lrn')
            ->where(static function ($query) use ($schoolId): void {
                $query->whereNull('deleted_at');

                if ($schoolId > 0) {
                    $query->where('school_id', $schoolId);
                }
            })
            ->ignore($studentId);

        return [
            'lrn' => [
                'required',
                'string',
                'max:20',
                $lrnUniqueRule,
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

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'lrn.unique' => 'LRN already exists in this school\'s student records.',
        ];
    }
}
