<?php

namespace App\Support\Auth;

use App\Models\School;
use App\Models\User;
use App\Support\Auth\SetupTokens\SetupTokenRecord;
use App\Support\Domain\AccountStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class SchoolHeadAccountLifecycleService
{
    private static ?bool $usersHasAccountTypeColumn = null;

    private static ?bool $rolesTablesExist = null;

    private static ?bool $sessionsTableExists = null;

    public function __construct(
        private readonly SchoolHeadAccountSetupService $schoolHeadAccountSetupService,
    ) {
    }

    public function storageAvailable(): bool
    {
        return $this->schoolHeadAccountSetupService->storageAvailable();
    }

    public function storageUnavailableMessage(): string
    {
        return $this->schoolHeadAccountSetupService->storageUnavailableMessage();
    }

    public function logStorageUnavailable(string $operation, array $context = []): void
    {
        Log::error('School Head account setup token storage is unavailable.', [
            'operation' => $operation,
            ...$context,
        ]);
    }

    public function normalizeSchoolCode(string $value): ?string
    {
        return AuthLoginNormalizer::normalizeSchoolCode($value);
    }

    public function synchronizeSchoolHeadIdentity(User $user): array
    {
        $rolePresent = $this->hasRoleAlias($user, UserRoleResolver::SCHOOL_HEAD);
        $accountTypePresent = $this->hasSchoolHeadAccountType($user);
        $roleRepaired = false;
        $accountTypeRepaired = false;

        if (! $rolePresent && $accountTypePresent && $this->rolesTablesExist() && (int) ($user->school_id ?? 0) > 0) {
            try {
                $user->assignRole(UserRoleResolver::SCHOOL_HEAD);
                $user->unsetRelation('roles');
                $rolePresent = $this->hasRoleAlias($user->loadMissing('roles'), UserRoleResolver::SCHOOL_HEAD);
                $roleRepaired = $rolePresent;
            } catch (\Throwable $exception) {
                Log::warning('Unable to repair missing school_head role from account_type.', [
                    'user_id' => $user->id,
                    'school_id' => $user->school_id,
                    'error' => $exception->getMessage(),
                ]);
            }
        }

        if ($rolePresent && $this->usersHaveAccountTypeColumn() && ! $accountTypePresent) {
            $user->forceFill([
                'account_type' => UserRoleResolver::SCHOOL_HEAD,
            ])->save();

            $accountTypePresent = true;
            $accountTypeRepaired = true;
        }

        return [
            'supported' => $rolePresent,
            'rolePresent' => $rolePresent,
            'accountTypePresent' => $accountTypePresent,
            'roleRepaired' => $roleRepaired,
            'accountTypeRepaired' => $accountTypeRepaired,
        ];
    }

    public function resolveSchoolHeadAccountForSchool(School $school, bool $withSetupToken = true): ?User
    {
        return $this->resolvePreferredCandidate(
            $this->schoolHeadCandidatesQuery()
            ->where('school_id', $school->id)
            ->orderByDesc('id')
            ->with(['roles', 'verifiedBy']),
        );
    }

    public function resolveSchoolHeadAccountForSchoolCode(string $schoolCode): ?User
    {
        $normalizedSchoolCode = $this->normalizeSchoolCode($schoolCode);
        if ($normalizedSchoolCode === null) {
            return null;
        }

        $normalizedSchoolCodeKey = strtolower($normalizedSchoolCode);

        return $this->resolvePreferredCandidate(
            $this->schoolHeadCandidatesQuery()
                ->with(['school:id,school_code,name'])
                ->whereHas('school', function ($builder) use ($normalizedSchoolCodeKey): void {
                    $builder->where('school_code_normalized', $normalizedSchoolCodeKey);
                })
                ->orderByDesc('id'),
        );
    }

    public function resolveSchoolHeadAccountForEmail(string $email): ?User
    {
        $normalizedEmail = strtolower(trim($email));
        if ($normalizedEmail === '' || filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL) === false) {
            return null;
        }

        return $this->resolvePreferredCandidate(
            $this->schoolHeadCandidatesQuery()
                ->where('email_normalized', $normalizedEmail)
                ->orderByDesc('id'),
        );
    }

    public function schoolHeadCandidatesQuery(): Builder
    {
        return User::query()->where(function (Builder $builder): void {
            $roleAliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);

            $builder->whereHas('roles', function ($roleQuery) use ($roleAliases): void {
                $roleQuery->whereIn('name', $roleAliases);
            });

            if ($this->usersHaveAccountTypeColumn()) {
                $builder->orWhere('account_type', UserRoleResolver::SCHOOL_HEAD);
            }
        });
    }

    public function issueSetupLink(
        User $user,
        ?User $issuedBy = null,
        ?string $issuedIp = null,
        ?string $issuedUserAgent = null,
        ?int $ttlHours = null,
    ): array {
        try {
            $sync = $this->synchronizeSchoolHeadIdentity($user);
            if (! $sync['supported']) {
                return [
                    'status' => 'unsupported',
                    'message' => 'This setup link is no longer valid for account activation.',
                ];
            }

            return [
                'status' => 'issued',
                'setup' => $this->schoolHeadAccountSetupService->issue(
                    $user,
                    $issuedBy,
                    $issuedIp,
                    $issuedUserAgent,
                    $ttlHours,
                ),
                'roleRepaired' => $sync['roleRepaired'],
                'accountTypeRepaired' => $sync['accountTypeRepaired'],
            ];
        } catch (\RuntimeException $exception) {
            if (! $this->isStorageUnavailableException($exception)) {
                throw $exception;
            }

            $this->logStorageUnavailable('issue_setup_link', [
                'user_id' => $user->id,
                'school_id' => $user->school_id,
            ]);

            return [
                'status' => 'storage_unavailable',
                'message' => $this->storageUnavailableMessage(),
            ];
        }
    }

    public function prepareForSetupLinkRecovery(User $user): void
    {
        $user->forceFill([
            'account_status' => AccountStatus::PENDING_SETUP->value,
            'must_reset_password' => true,
            'password_changed_at' => null,
            'email_verified_at' => null,
            'verified_by_user_id' => null,
            'verified_at' => null,
            'verification_notes' => null,
        ])->save();

        $this->synchronizeSchoolHeadIdentity($user);
    }

    public function determineRecoveryAction(User $user, bool $allowArchivedRecovery = false): array
    {
        return match ($user->accountStatus()) {
            AccountStatus::PENDING_SETUP => [
                'action' => 'reissue_setup_link',
                'allowed' => true,
                'message' => 'A new setup link can be issued for this pending setup account.',
            ],
            AccountStatus::PENDING_VERIFICATION => [
                'action' => 'activate_account',
                'allowed' => false,
                'message' => 'This account is waiting for Division Monitor activation. Use the Activate Account action instead.',
            ],
            AccountStatus::ACTIVE => [
                'action' => 'password_reset',
                'allowed' => false,
                'message' => 'This account is already active. Use a password reset link instead of a setup link.',
            ],
            AccountStatus::ARCHIVED => $allowArchivedRecovery
                ? [
                    'action' => 'admin_recovery_setup_link',
                    'allowed' => true,
                    'message' => 'Archived account recovery is allowed for this request. A new setup link can be issued after resetting the account to pending setup.',
                ]
                : [
                    'action' => 'archived_admin_recovery_required',
                    'allowed' => false,
                    'message' => 'Archived accounts require an explicit admin recovery action before setup can be reissued.',
                ],
            default => [
                'action' => 'status_management',
                'allowed' => false,
                'message' => 'This account must be restored through status management before sending recovery links.',
            ],
        };
    }

    public function completeAccountSetup(
        string $plainToken,
        string $newPassword,
        ?string $usedIp = null,
        ?string $usedUserAgent = null,
    ): array {
        try {
            $setupToken = $this->schoolHeadAccountSetupService->resolve($plainToken);
        } catch (\RuntimeException $exception) {
            if (! $this->isStorageUnavailableException($exception)) {
                throw $exception;
            }

            $this->logStorageUnavailable('complete_account_setup');

            return [
                'status' => 'storage_unavailable',
                'message' => $this->storageUnavailableMessage(),
            ];
        }

        if (! $setupToken instanceof SetupTokenRecord) {
            return [
                'status' => 'invalid_token',
            ];
        }

        /** @var User|null $user */
        $user = User::query()
            ->with('school')
            ->find($setupToken->user_id);
        if (! $user instanceof User) {
            return [
                'status' => 'unsupported',
                'user' => null,
            ];
        }

        $sync = $this->synchronizeSchoolHeadIdentity($user);
        if (! $sync['supported']) {
            return [
                'status' => 'unsupported',
                'user' => $user,
                'identifier' => (string) ($user->school?->school_code ?? ''),
            ];
        }

        $identifier = (string) ($user->school?->school_code ?? '');
        $status = $user->accountStatus();

        if (in_array($status, [AccountStatus::SUSPENDED, AccountStatus::LOCKED, AccountStatus::ARCHIVED], true)) {
            return [
                'status' => 'inactive',
                'user' => $user,
                'identifier' => $identifier,
                'accountStatus' => $status,
            ];
        }

        if (Hash::check($newPassword, $user->password)) {
            return [
                'status' => 'password_reuse',
                'user' => $user,
                'identifier' => $identifier,
            ];
        }

        $previousStatus = $status->value;

        try {
            $revocationSummary = DB::transaction(function () use (
                $plainToken,
                $user,
                $newPassword,
                $usedIp,
                $usedUserAgent,
            ): ?array {
                /** @var User|null $lockedUser */
                $lockedUser = User::query()
                    ->whereKey($user->id)
                    ->lockForUpdate()
                    ->first();

                if (! $lockedUser instanceof User) {
                    return null;
                }

                $consumedToken = $this->schoolHeadAccountSetupService->consume($plainToken, $usedIp, $usedUserAgent);
                if (! $consumedToken instanceof SetupTokenRecord || $consumedToken->user_id !== (int) $lockedUser->id) {
                    return null;
                }

                $lockedUser->forceFill([
                    'password' => Hash::make($newPassword),
                    'must_reset_password' => false,
                    'password_changed_at' => now(),
                    'email_verified_at' => now(),
                    'account_status' => AccountStatus::PENDING_VERIFICATION->value,
                    'verified_by_user_id' => null,
                    'verified_at' => null,
                    'verification_notes' => null,
                ])->save();

                $this->synchronizeSchoolHeadIdentity($lockedUser);

                return $this->revokeUserSessionsAndTokens($lockedUser);
            });
        } catch (\RuntimeException $exception) {
            if (! $this->isStorageUnavailableException($exception)) {
                throw $exception;
            }

            $this->logStorageUnavailable('complete_account_setup_transaction', [
                'user_id' => $user->id,
            ]);

            return [
                'status' => 'storage_unavailable',
                'message' => $this->storageUnavailableMessage(),
            ];
        }

        if (! is_array($revocationSummary)) {
            return [
                'status' => 'invalid_token',
                'user' => $user,
                'identifier' => $identifier,
            ];
        }

        return [
            'status' => 'completed',
            'user' => $user->fresh('school') ?? $user,
            'identifier' => $identifier,
            'previousStatus' => $previousStatus,
            'revocationSummary' => $revocationSummary,
        ];
    }

    /**
     * @param iterable<int, User> $accounts
     *
     * @return array{
     *     removedCount: int,
     *     monitorAccessPresent: bool,
     *     accountIds: array<int, string>,
     *     accountEmails: array<int, string>,
     *     revocations: array<int, array{user_id: int, revoked_tokens: int, revoked_web_sessions: int, purged_setup_tokens: int}>
     * }
     */
    public function cleanupAndArchiveAccounts(iterable $accounts): array
    {
        $accountCollection = collect($accounts)->values();
        $monitorAccessPresent = $accountCollection->contains(
            static fn (User $account): bool => UserRoleResolver::has($account, UserRoleResolver::MONITOR)
        );

        $removedCount = 0;
        $revocations = [];

        DB::transaction(function () use ($accountCollection, &$removedCount, &$revocations): void {
            foreach ($accountCollection as $account) {
                /** @var User $lockedAccount */
                $lockedAccount = User::query()
                    ->with('roles')
                    ->whereKey($account->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                $revocationSummary = $this->revokeUserSessionsAndTokens($lockedAccount);
                $purgedSetupTokens = $this->schoolHeadAccountSetupService->purgeForUser($lockedAccount);

                $lockedAccount->syncPermissions([]);
                $lockedAccount->syncRoles([]);

                $archivedEmail = 'archived+' . $lockedAccount->id . '+' . now()->timestamp . '@example.invalid';

                $lockedAccount->forceFill([
                    'email' => $archivedEmail,
                    'email_normalized' => $archivedEmail,
                    'account_status' => AccountStatus::ARCHIVED->value,
                    'must_reset_password' => true,
                    'password_changed_at' => null,
                    'email_verified_at' => null,
                    'verified_by_user_id' => null,
                    'verified_at' => null,
                    'verification_notes' => null,
                    'school_id' => null,
                ])->save();

                $revocations[] = [
                    'user_id' => (int) $lockedAccount->id,
                    'revoked_tokens' => (int) $revocationSummary['revokedTokens'],
                    'revoked_web_sessions' => (int) $revocationSummary['revokedWebSessions'],
                    'purged_setup_tokens' => $purgedSetupTokens,
                ];

                $removedCount++;
            }
        });

        return [
            'removedCount' => $removedCount,
            'monitorAccessPresent' => $monitorAccessPresent,
            'accountIds' => $accountCollection
                ->map(static fn (User $account): string => (string) $account->id)
                ->values()
                ->all(),
            'accountEmails' => $accountCollection
                ->map(static fn (User $account): string => (string) $account->email)
                ->values()
                ->all(),
            'revocations' => $revocations,
        ];
    }

    private function resolvePreferredCandidate(Builder $query): ?User
    {
        $roleAliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);

        /** @var User|null $candidate */
        $candidate = (clone $query)
            ->whereHas('roles', function ($builder) use ($roleAliases): void {
                $builder->whereIn('name', $roleAliases);
            })
            ->first();

        if ($candidate instanceof User) {
            $this->synchronizeSchoolHeadIdentity($candidate);

            return $candidate;
        }

        if (! $this->usersHaveAccountTypeColumn()) {
            return null;
        }

        /** @var User|null $fallback */
        $fallback = (clone $query)
            ->where('account_type', UserRoleResolver::SCHOOL_HEAD)
            ->first();

        if (! $fallback instanceof User) {
            return null;
        }

        $sync = $this->synchronizeSchoolHeadIdentity($fallback);

        return $sync['supported']
            ? ($fallback->fresh(['roles', 'school', 'verifiedBy']) ?? $fallback)
            : null;
    }

    private function hasRoleAlias(User $user, string $role): bool
    {
        foreach (UserRoleResolver::roleAliases($role) as $alias) {
            if ($user->hasRole($alias)) {
                return true;
            }
        }

        return false;
    }

    private function hasSchoolHeadAccountType(User $user): bool
    {
        if (! $this->usersHaveAccountTypeColumn()) {
            return false;
        }

        return strtolower(trim((string) $user->getAttribute('account_type'))) === UserRoleResolver::SCHOOL_HEAD;
    }

    private function revokeUserSessionsAndTokens(User $user): array
    {
        $revokedTokens = $user->tokens()->delete();

        $revokedWebSessions = 0;
        if ($this->sessionsTableExists()) {
            $revokedWebSessions = DB::table('sessions')
                ->where('user_id', $user->id)
                ->delete();
        }

        return [
            'revokedTokens' => $revokedTokens,
            'revokedWebSessions' => $revokedWebSessions,
        ];
    }

    private function isStorageUnavailableException(\RuntimeException $exception): bool
    {
        return trim($exception->getMessage()) === $this->storageUnavailableMessage();
    }

    private function usersHaveAccountTypeColumn(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasColumn('users', 'account_type');
        }

        if (self::$usersHasAccountTypeColumn === null) {
            self::$usersHasAccountTypeColumn = Schema::hasColumn('users', 'account_type');
        }

        return self::$usersHasAccountTypeColumn;
    }

    private function rolesTablesExist(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('roles') && Schema::hasTable('model_has_roles');
        }

        if (self::$rolesTablesExist === null) {
            self::$rolesTablesExist = Schema::hasTable('roles') && Schema::hasTable('model_has_roles');
        }

        return self::$rolesTablesExist;
    }

    private function sessionsTableExists(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('sessions');
        }

        if (self::$sessionsTableExists === null) {
            self::$sessionsTableExists = Schema::hasTable('sessions');
        }

        return self::$sessionsTableExists;
    }
}
