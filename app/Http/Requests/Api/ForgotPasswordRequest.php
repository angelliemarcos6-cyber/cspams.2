<?php

namespace App\Http\Requests\Api;

use App\Support\Auth\UserRoleResolver;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ForgotPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'role' => strtolower(trim((string) $this->input('role'))),
            'email' => strtolower(trim((string) $this->input('email'))),
        ]);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'role' => ['sometimes', 'nullable', 'string', Rule::in(UserRoleResolver::loginRoles())],
            'email' => ['required', 'string', 'email', 'max:255'],
        ];
    }
}
