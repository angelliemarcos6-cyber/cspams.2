<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\Api\Concerns\NormalizesAuthRoleAndLoginInput;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class ResetRequiredPasswordRequest extends FormRequest
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
            'role' => ['required', 'string', Rule::in(UserRoleResolver::loginRoles())],
            'login' => [
                'required',
                'string',
                'max:255',
                Rule::when(
                    UserRoleResolver::normalizeLoginRole($this->input('role')) === UserRoleResolver::SCHOOL_HEAD,
                    ['size:6', 'regex:/^\d{6}$/'],
                ),
                Rule::when(
                    UserRoleResolver::normalizeLoginRole($this->input('role')) === UserRoleResolver::MONITOR,
                    ['email'],
                ),
            ],
            'current_password' => ['required', 'string', 'max:255'],
            'new_password' => [
                'required',
                'string',
                'confirmed',
                Password::min(10)->letters()->numbers()->symbols(),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'login.size' => 'School code must be exactly 6 digits.',
            'login.regex' => 'School code must contain only digits.',
            'login.email' => 'Monitor login must be a valid email address.',
        ];
    }
}
