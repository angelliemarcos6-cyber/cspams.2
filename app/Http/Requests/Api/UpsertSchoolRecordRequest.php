<?php

namespace App\Http\Requests\Api;

use App\Models\School;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\SchoolStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpsertSchoolRecordRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        $normalize = static function (?string $value): ?string {
            if ($value === null) {
                return null;
            }

            $normalized = trim($value);

            return $normalized === '' ? null : $normalized;
        };

        $payload = [];

        if ($this->has('schoolId')) {
            $normalizedSchoolId = $normalize($this->input('schoolId'));
            $payload['schoolId'] = $normalizedSchoolId !== null ? strtoupper($normalizedSchoolId) : null;
        }

        if ($this->has('schoolName')) {
            $payload['schoolName'] = $normalize($this->input('schoolName'));
        }

        if ($this->has('level')) {
            $payload['level'] = $normalize($this->input('level'));
        }

        if ($this->has('district')) {
            $payload['district'] = $normalize($this->input('district'));
        }

        if ($this->has('address')) {
            $payload['address'] = $normalize($this->input('address'));
        }

        if ($this->has('region')) {
            $payload['region'] = $normalize($this->input('region'));
        }

        if ($this->has('type')) {
            $normalizedType = $normalize($this->input('type'));
            $payload['type'] = $normalizedType !== null ? strtolower($normalizedType) : null;
        }

        if ($this->has('schoolHeadAccount')) {
            $schoolHeadAccount = $this->input('schoolHeadAccount');
            if (is_array($schoolHeadAccount)) {
                $schoolHeadAccount['name'] = $normalize($schoolHeadAccount['name'] ?? null);
                $normalizedEmail = $normalize($schoolHeadAccount['email'] ?? null);
                $schoolHeadAccount['email'] = $normalizedEmail ? strtolower($normalizedEmail) : null;
            }

            $payload['schoolHeadAccount'] = $schoolHeadAccount;
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
        $schoolParam = $this->route('school');
        $schoolId = $schoolParam instanceof School ? $schoolParam->id : null;
        $isMonitorStore = $this->isMethod('post') && $this->isMonitor();
        $requiresOperationalFields = ! $this->isMonitor();

        $schoolIdRule = Rule::unique('schools', 'school_code_normalized')
            ->where(static fn ($query) => $query->whereNull('deleted_at'))
            ->ignore($schoolId);

        return [
            'schoolId' => [
                $isMonitorStore ? 'required' : 'sometimes',
                'string',
                'size:6',
                'regex:/^\d{6}$/',
                $schoolIdRule,
            ],
            'schoolName' => [$isMonitorStore ? 'required' : 'sometimes', 'string', 'max:255'],
            'level' => [$isMonitorStore ? 'required' : 'sometimes', 'string', 'max:100'],
            'studentCount' => [$requiresOperationalFields ? 'required' : 'sometimes', 'integer', 'min:0'],
            'teacherCount' => [$requiresOperationalFields ? 'required' : 'sometimes', 'integer', 'min:0'],
            'region' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => [$requiresOperationalFields ? 'required' : 'sometimes', 'string', Rule::in(array_column(SchoolStatus::cases(), 'value'))],
            'district' => ['sometimes', 'nullable', 'string', 'max:255'],
            'address' => [$isMonitorStore ? 'required' : 'sometimes', 'string', 'max:255'],
            'type' => [$isMonitorStore ? 'required' : 'sometimes', 'string', Rule::in(['public', 'private'])],
            'schoolHeadAccount' => ['sometimes', 'nullable', 'array'],
            'schoolHeadAccount.name' => ['required_with:schoolHeadAccount', 'string', 'max:255'],
            'schoolHeadAccount.email' => [
                'required_with:schoolHeadAccount',
                'email',
                'max:255',
                Rule::unique('users', 'email_normalized'),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'schoolId.size' => 'School code must be exactly 6 digits.',
            'schoolId.regex' => 'School code must contain only digits.',
            'schoolId.unique' => 'School code already exists in active records.',
        ];
    }

    private function isMonitor(): bool
    {
        return UserRoleResolver::has($this->user(), UserRoleResolver::MONITOR);
    }
}
