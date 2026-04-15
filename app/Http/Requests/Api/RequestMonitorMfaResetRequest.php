<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\Api\Concerns\NormalizesAuthRoleAndLoginInput;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RequestMonitorMfaResetRequest extends FormRequest
{
    use NormalizesAuthRoleAndLoginInput;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $role = $this->normalizeRoleForLoginPayload($this->input('role'));

        $this->merge([
            'role' => $role,
            'login' => $this->normalizeLoginIdentifierForRole($this->input('login'), $role),
        ]);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'role' => ['required', 'string', Rule::in([UserRoleResolver::MONITOR])],
            'login' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'role.in' => 'MFA reset requests are only supported for division monitor accounts.',
        ];
    }
}
