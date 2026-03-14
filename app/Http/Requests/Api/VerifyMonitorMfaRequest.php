<?php

namespace App\Http\Requests\Api;

use App\Http\Requests\Api\Concerns\NormalizesAuthRoleAndLoginInput;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class VerifyMonitorMfaRequest extends FormRequest
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
            'challenge_id' => ['required', 'string', 'uuid'],
            'code' => ['required', 'string', 'regex:/^(?:\d{6}|[A-Za-z0-9]{4}-[A-Za-z0-9]{4})$/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'role.in' => 'MFA verification is currently supported for division monitor accounts only.',
            'code.regex' => 'Code must be a 6-digit verification code or an 8-character backup code (XXXX-XXXX).',
        ];
    }
}
