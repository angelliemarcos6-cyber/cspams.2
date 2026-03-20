<?php

namespace App\Http\Requests\Api;

use App\Models\School;
use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Schema;
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
        $existingAccountEmail = null;
        if ($schoolId) {
            $existingQuery = User::query()
                ->select(['id', 'email'])
                ->where('school_id', $schoolId)
                ->orderByDesc('id');

            if (Schema::hasColumn('users', 'account_type')) {
                $existingQuery->where('account_type', UserRoleResolver::SCHOOL_HEAD);
            } else {
                $aliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);
                $existingQuery->whereHas('roles', static function ($builder) use ($aliases): void {
                    $builder->whereIn('name', $aliases);
                });
            }

            $existingAccount = $existingQuery->first();
            if ($existingAccount) {
                $existingAccountId = $existingAccount->id;
                $existingAccountEmail = $existingAccount->email;
            }
        }

        $email = $this->input('email');
        $requiresEmailChangeVerification = false;
        if (
            $existingAccountId !== null
            && is_string($email)
            && strtolower(trim((string) $existingAccountEmail)) !== strtolower(trim($email))
        ) {
            $requiresEmailChangeVerification = true;
        }

        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email_normalized')->ignore($existingAccountId),
            ],
            'reason' => [
                Rule::requiredIf($requiresEmailChangeVerification),
                'string',
                'min:5',
                'max:500',
            ],
            'verificationChallengeId' => [
                Rule::requiredIf($requiresEmailChangeVerification),
                'string',
                'uuid',
            ],
            'verificationCode' => [
                Rule::requiredIf($requiresEmailChangeVerification),
                'string',
                'regex:/^\\d{6}$/',
            ],
        ];
    }
}
