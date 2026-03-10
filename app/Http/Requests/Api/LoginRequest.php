<?php

namespace App\Http\Requests\Api;

use App\Support\Auth\UserRoleResolver;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class LoginRequest extends FormRequest
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
            'role' => ['required', 'string', Rule::in(UserRoleResolver::loginRoles())],
            'login' => [
                'required',
                'string',
                'max:255',
                Rule::when(
                    UserRoleResolver::normalizeLoginRole($this->input('role')) === UserRoleResolver::SCHOOL_HEAD,
                    ['size:6', 'regex:/^\d{6}$/'],
                ),
            ],
            'password' => ['required', 'string', 'max:255'],
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
        ];
    }
}
