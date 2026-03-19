<?php

namespace App\Http\Requests\Api;

use App\Models\School;
use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpsertSchoolHeadAccountProfileRequest extends FormRequest
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

        if ($this->has('name')) {
            $payload['name'] = $normalize($this->input('name'));
        }

        if ($this->has('email')) {
            $normalizedEmail = $normalize($this->input('email'));
            $payload['email'] = $normalizedEmail ? strtolower($normalizedEmail) : null;
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

        $existingAccountId = null;
        if ($schoolId) {
            $aliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);
            $existingAccountId = User::query()
                ->where('school_id', $schoolId)
                ->whereHas('roles', static function ($builder) use ($aliases): void {
                    $builder->whereIn('name', $aliases);
                })
                ->orderByDesc('id')
                ->value('id');
        }

        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email_normalized')->ignore($existingAccountId),
            ],
        ];
    }
}

