<?php

namespace App\Http\Requests\Api;

use App\Models\Teacher;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpsertTeacherRecordRequest extends FormRequest
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

        if ($this->has('name')) {
            $payload['name'] = $normalize($this->input('name'));
        }

        if ($this->has('sex')) {
            $normalizedSex = $normalize($this->input('sex'));
            $payload['sex'] = $normalizedSex ? strtolower($normalizedSex) : null;
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
        $teacherParam = $this->route('teacher');
        $teacherId = $teacherParam instanceof Teacher ? $teacherParam->id : null;
        $schoolId = $this->user()?->school_id;

        $nameUniqueRule = Rule::unique('teachers', 'name')
            ->ignore($teacherId)
            ->where(function ($query) use ($schoolId) {
                $query->whereNull('deleted_at');

                if ($schoolId !== null) {
                    $query->where('school_id', $schoolId);
                }
            });

        return [
            'name' => ['required', 'string', 'max:255', $nameUniqueRule],
            'sex' => ['sometimes', 'nullable', 'string', Rule::in(['male', 'female'])],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.unique' => 'Teacher name already exists for your school.',
        ];
    }
}
