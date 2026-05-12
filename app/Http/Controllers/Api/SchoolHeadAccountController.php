<?php

namespace App\Http\Controllers\Api;

use App\Events\CspamsUpdateBroadcast;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\ActivateSchoolHeadAccountRequest;
use App\Http\Requests\Api\IssueSchoolHeadAccountActionVerificationCodeRequest;
use App\Http\Requests\Api\IssueSchoolHeadPasswordResetLinkRequest;
use App\Http\Requests\Api\IssueSchoolHeadSetupLinkRequest;
use App\Http\Requests\Api\IssueSchoolHeadTemporaryPasswordRequest;
use App\Http\Requests\Api\RemoveSchoolHeadAccountRequest;
use App\Http\Requests\Api\UpsertSchoolHeadAccountProfileRequest;
use App\Http\Requests\Api\UpdateSchoolHeadAccountStatusRequest;
use App\Models\AuditLog;
use App\Models\FormSubmissionHistory;
use App\Models\IndicatorSubmission;
use App\Models\Section;
use App\Models\School;
use App\Models\Student;
use App\Models\User;
use App\Notifications\SchoolHeadAccountSetupNotification;
use App\Notifications\SchoolHeadPasswordResetNotification;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\MonitorActionVerificationService;
use App\Support\Auth\SchoolHeadAccountSetupService;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\AccountStatus;
use App\Support\Mail\MailDelivery;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class SchoolHeadAccountController extends Controller
{
    private static ?bool $usersHasAccountTypeColumn = null;

    private static ?bool $usersHasDeleteRecordFlags = null;

    private static ?bool $sessionsTableExists = null;

    private static ?bool $accountSetupTokensTableExists = null;

    public function __construct(
        private readonly SchoolHeadAccountSetupService $schoolHeadAccountSetupService,
        private readonly MonitorActionVerificationService $monitorActionVerificationService,
    ) {
    }

    public function issueActionVerificationCode(
        IssueSchoolHeadAccountActionVerificationCodeRequest $request,
        School $school,
    ): JsonResponse {
        $monitor = $this->requireMonitor($request);

        $account = $this->resolveSchoolHeadAccount($school);
        if (! $account) {
            return response()->json(
                ['message' => 'No School Head account is linked to this school.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $targetStatus = (string) $request->string('targetStatus')->toString();

        try {
            $challenge = $this->monitorActionVerificationService->issue(
                $monitor,
                $school,
                $targetStatus,
            );
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json(
                ['message' => 'Unable to send confirmation code. Please try again.'],
                Response::HTTP_SERVICE_UNAVAILABLE,
            );
        }

        AuditLog::query()->create([
            'user_id' => $monitor->id,
            'action' => 'account.action_verification_code_issued',
            'auditable_type' => User::class,
            'auditable_id' => $account->id,
            'metadata' => [
                'category' => 'account_management',
                'outcome' => 'success',
                'actor_role' => UserRoleResolver::MONITOR,
                'target_user_id' => $account->id,
                'target_email' => $account->email,
                'target_role' => UserRoleResolver::SCHOOL_HEAD,
                'school_id' => (string) $school->id,
                'school_code' => (string) $school->school_code,
                'target_status' => $targetStatus,
                'challenge_id' => $challenge['challengeId'],
                'expires_at' => $challenge['expiresAt'],
                'delivery' => 'mail',
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        $delivery = 'sent';
        $deliveryMessage = 'Confirmation code sent to your monitor email.';
        if (MailDelivery::isSimulated()) {
            $delivery = MailDelivery::simulatedStatus();
            $deliveryMessage = MailDelivery::simulatedMessage('Confirmation code was generated, but will not reach real inboxes.');
        }

        return response()->json([
            'data' => [
                'challengeId' => $challenge['challengeId'],
                'expiresAt' => $challenge['expiresAt'],
                'delivery' => $delivery,
                'deliveryMessage' => $deliveryMessage,
            ],
        ]);
    }

    public function upsertProfile(
        UpsertSchoolHeadAccountProfileRequest $request,
        School $school,
    ): JsonResponse {
        $monitor = $this->requireMonitor($request);

        $name = trim($request->string('name')->toString());
        $email = strtolower(trim($request->string('email')->toString()));

        $account = $this->resolveSchoolHeadAccount($school);
        if ($account) {
            $previousEmail = strtolower(trim((string) $account->email));
            $emailChanged = $previousEmail !== $email;
            $previousStatus = $account->accountStatus();
            $reason = trim($request->string('reason')->toString());
            $reissueAllowed = $emailChanged
                && ! in_array($previousStatus, [
                    AccountStatus::SUSPENDED,
                    AccountStatus::LOCKED,
                    AccountStatus::ARCHIVED,
                ], true);

            if ($emailChanged) {
                $challengeId = trim($request->string('verificationChallengeId')->toString());
                $code = trim($request->string('verificationCode')->toString());

                if ($challengeId === '' || $code === '') {
                    return response()->json(
                        ['message' => 'Confirmation code is required to change the School Head email.'],
                        Response::HTTP_UNPROCESSABLE_ENTITY,
                    );
                }

                $verified = $this->monitorActionVerificationService->verify(
                    $monitor,
                    $school,
                    IssueSchoolHeadAccountActionVerificationCodeRequest::TARGET_EMAIL_CHANGE,
                    $challengeId,
                    $code,
                );

                if (! $verified) {
                    return response()->json(
                        ['message' => 'Confirmation code is invalid or expired. Request a new code and try again.'],
                        Response::HTTP_UNPROCESSABLE_ENTITY,
                    );
                }
            }

            if ($reissueAllowed && ! $this->schoolHeadAccountSetupService->storageAvailable()) {
                return response()->json(
                    ['message' => 'Account setup token storage is unavailable. Run database migrations first.'],
                    Response::HTTP_SERVICE_UNAVAILABLE,
                );
            }

            $normalizedEmail = strtolower(trim($email));
            $updates = [
                'name' => $name,
                'email' => $normalizedEmail,
                'email_normalized' => $normalizedEmail,
            ];

            if ($emailChanged) {
                $updates['email_verified_at'] = null;
                $updates['must_reset_password'] = true;
                $updates['password_changed_at'] = null;
                $updates['temporary_password_issued_at'] = null;
                $updates['verified_by_user_id'] = null;
                $updates['verified_at'] = null;
                $updates['verification_notes'] = null;
            }

            if ($reissueAllowed) {
                $updates['account_status'] = AccountStatus::PENDING_SETUP->value;
            }

            $account->forceFill($updates)->save();

            $revocationSummary = [
                'revokedTokens' => 0,
                'revokedWebSessions' => 0,
            ];
            if ($emailChanged) {
                $revocationSummary = $this->revokeSchoolHeadSessionsAndTokens($account);
            }

            $setupLinkExpiresAt = null;
            $deliveryStatus = null;
            $deliveryMessage = null;

            if ($reissueAllowed) {
                $issuedSetup = $this->schoolHeadAccountSetupService->issue(
                    $account,
                    $monitor,
                    $request->ip(),
                    $request->userAgent(),
                );

                $setupLinkExpiresAt = $issuedSetup['expiresAt'];
                $deliveryStatus = 'sent';
                $deliveryMessage = 'Setup link sent to the School Head email.';

                if (MailDelivery::isSimulated()) {
                    $deliveryStatus = MailDelivery::simulatedStatus();
                    $deliveryMessage = MailDelivery::simulatedMessage('Setup link was generated, but will not reach real inboxes.');
                }

                try {
                    $account->notify(
                        new SchoolHeadAccountSetupNotification(
                            $school,
                            $issuedSetup['setupUrl'],
                            CarbonImmutable::parse($issuedSetup['expiresAt']),
                        ),
                    );
                } catch (\Throwable $exception) {
                    report($exception);
                    $deliveryStatus = 'failed';
                    $deliveryMessage = 'Setup link email delivery failed. Please try again or contact an administrator.';
                }
            }

            $this->loadLatestAccountSetupToken($account);

            AuditLog::query()->create([
                'user_id' => $monitor->id,
                'action' => 'account.profile_updated',
                'auditable_type' => User::class,
                'auditable_id' => $account->id,
                'metadata' => [
                    'category' => 'account_management',
                    'outcome' => 'success',
                    'actor_role' => UserRoleResolver::MONITOR,
                    'target_user_id' => $account->id,
                    'target_email' => $account->email,
                    'target_role' => UserRoleResolver::SCHOOL_HEAD,
                    'school_id' => (string) $school->id,
                    'school_code' => (string) $school->school_code,
                    'previous_email' => $previousEmail,
                    'new_email' => $account->email,
                    'email_changed' => $emailChanged,
                    'setup_link_issued' => $reissueAllowed,
                    'setup_link_expires_at' => $setupLinkExpiresAt,
                    'delivery_status' => $deliveryStatus,
                    'delivery_message' => $deliveryMessage,
                    'reason' => $emailChanged ? $reason : null,
                    'account_status' => $account->accountStatus()->value,
                    'revoked_tokens' => $revocationSummary['revokedTokens'],
                    'revoked_web_sessions' => $revocationSummary['revokedWebSessions'],
                ],
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'created_at' => now(),
            ]);

            event(new CspamsUpdateBroadcast([
                'entity' => 'dashboard',
                'eventType' => 'school_head_account.profile_updated',
                'schoolId' => (string) $school->id,
                'schoolCode' => (string) $school->school_code,
                'accountStatus' => $account->accountStatus()->value,
                'setupLinkExpiresAt' => $setupLinkExpiresAt,
            ]));

        return response()->json([
            'data' => [
                'account' => $this->serializeSchoolHeadAccount($account),
                'message' => $emailChanged
                    ? ($reissueAllowed
                        ? 'School Head account updated. Setup link reissued for email verification.'
                        : 'School Head account updated. Setup link was not reissued for inactive accounts.')
                    : 'School Head account updated.',
                'expiresAt' => $setupLinkExpiresAt,
                'delivery' => $deliveryStatus,
                'deliveryMessage' => $deliveryMessage,
            ],
        ]);
        }

        $duplicateQuery = User::query()->where('school_id', $school->id);
        if ($this->usersHaveAccountTypeColumn()) {
            $duplicateQuery->where('account_type', UserRoleResolver::SCHOOL_HEAD);
        } else {
            $aliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);
            $duplicateQuery->whereHas('roles', static function ($builder) use ($aliases): void {
                $builder->whereIn('name', $aliases);
            });
        }

        if ($duplicateQuery->exists()) {
            return response()->json(
                ['message' => 'A School Head account is already linked to this school. Update it instead of creating a new one.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $account = new User();
        $temporaryPassword = $this->generateTemporaryPassword();
        $account->name = $name;
        $account->email = $email;
        $account->password = Hash::make($temporaryPassword);
        $account->must_reset_password = true;
        $account->password_changed_at = now();
        $account->temporary_password_issued_at = now();
        $account->account_status = AccountStatus::ACTIVE->value;
        $account->email_verified_at = now();
        $account->verified_by_user_id = $monitor->id;
        $account->verified_at = now();
        $account->verification_notes = 'Provisioned by Division Monitor with a one-time temporary password.';
        $account->school_id = $school->id;
        if ($this->usersHaveAccountTypeColumn()) {
            $account->account_type = UserRoleResolver::SCHOOL_HEAD;
        }
        try {
            $account->save();
        } catch (QueryException $exception) {
            if ($this->isUniqueConstraintViolation($exception)) {
                return response()->json(
                    ['message' => 'A School Head account is already linked to this school. Update it instead of creating a new one.'],
                    Response::HTTP_UNPROCESSABLE_ENTITY,
                );
            }

            throw $exception;
        }
        $account->assignRole(UserRoleResolver::SCHOOL_HEAD);

        AuditLog::query()->create([
            'user_id' => $monitor->id,
            'action' => 'account.created',
            'auditable_type' => User::class,
            'auditable_id' => $account->id,
            'metadata' => [
                'category' => 'account_management',
                'outcome' => 'success',
                'actor_role' => UserRoleResolver::MONITOR,
                'target_user_id' => $account->id,
                'target_email' => $account->email,
                'target_role' => UserRoleResolver::SCHOOL_HEAD,
                'school_id' => (string) $school->id,
                'school_code' => (string) $school->school_code,
                'account_status' => $account->accountStatus()->value,
                'onboarding_flow' => 'temporary_password',
                'temporary_password_issued_at' => $account->temporary_password_issued_at?->toISOString(),
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_head_account.created',
            'schoolId' => (string) $school->id,
            'schoolCode' => (string) $school->school_code,
            'accountStatus' => $account->accountStatus()->value,
        ]));

        return response()->json([
            'data' => [
                'account' => $this->serializeSchoolHeadAccount($account),
                'temporaryPassword' => $temporaryPassword,
                'message' => 'School Head account created. Share the temporary password now because it will not be shown again.',
            ],
        ], Response::HTTP_CREATED);
    }

    public function activate(
        ActivateSchoolHeadAccountRequest $request,
        School $school,
    ): JsonResponse {
        $monitor = $this->requireMonitor($request);
        $account = $this->resolveSchoolHeadAccount($school);
        if (! $account) {
            return response()->json(
                ['message' => 'No School Head account is linked to this school.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $status = $account->accountStatus();
        if ($status !== AccountStatus::PENDING_VERIFICATION) {
            return response()->json(
                ['message' => 'Only accounts awaiting monitor verification can be activated.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (
            $account->must_reset_password
            || $account->password_changed_at === null
            || $account->email_verified_at === null
        ) {
            return response()->json(
                ['message' => 'Account setup is not complete yet.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $reason = trim($request->string('reason')->toString());

        $account->forceFill([
            'account_status' => AccountStatus::ACTIVE->value,
            'verified_by_user_id' => $monitor->id,
            'verified_at' => now(),
            'verification_notes' => $reason !== '' ? $reason : null,
        ])->save();

        $this->loadLatestAccountSetupToken($account);

        AuditLog::query()->create([
            'user_id' => $monitor->id,
            'action' => 'account.activated',
            'auditable_type' => User::class,
            'auditable_id' => $account->id,
            'metadata' => [
                'category' => 'account_management',
                'outcome' => 'success',
                'actor_role' => UserRoleResolver::MONITOR,
                'target_user_id' => $account->id,
                'target_email' => $account->email,
                'target_role' => UserRoleResolver::SCHOOL_HEAD,
                'school_id' => (string) $school->id,
                'school_code' => (string) $school->school_code,
                'previous_status' => $status->value,
                'new_status' => $account->accountStatus()->value,
                'reason' => $reason !== '' ? $reason : null,
                'verified_at' => $account->verified_at?->toISOString(),
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_head_account.activated',
            'schoolId' => (string) $school->id,
            'schoolCode' => (string) $school->school_code,
            'accountStatus' => $account->accountStatus()->value,
        ]));

        return response()->json([
            'data' => [
                'account' => $this->serializeSchoolHeadAccount($account),
                'message' => 'School Head account activated.',
            ],
        ]);
    }

    public function update(
        UpdateSchoolHeadAccountStatusRequest $request,
        School $school,
    ): JsonResponse {
        $monitor = $this->requireMonitor($request);
        $account = $this->resolveSchoolHeadAccount($school);
        if (! $account) {
            return response()->json(
                ['message' => 'No School Head account is linked to this school.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $previousStatus = $account->accountStatus();
        $previousFlagged = $account->flagged_at !== null;
        $deleteRecordFlagRequested = $request->has('deleteRecordFlagged');
        $deleteRecordFlagAvailable = $this->usersHaveDeleteRecordFlags();

        if ($deleteRecordFlagRequested && ! $deleteRecordFlagAvailable) {
            return response()->json(
                ['message' => 'Delete record flag storage is unavailable. Run database migrations first.'],
                Response::HTTP_SERVICE_UNAVAILABLE,
            );
        }

        $previousDeleteRecordFlagged = $deleteRecordFlagAvailable && $account->delete_record_flagged_at !== null;
        $nextStatus = $request->filled('accountStatus')
            ? (string) $request->string('accountStatus')->toString()
            : $previousStatus->value;
        $nextFlagged = $request->has('flagged')
            ? $request->boolean('flagged')
            : $previousFlagged;
        $nextDeleteRecordFlagged = $deleteRecordFlagRequested
            ? $request->boolean('deleteRecordFlagged')
            : $previousDeleteRecordFlagged;
        $reason = trim($request->string('reason')->toString());

        $statusChanged = $nextStatus !== $previousStatus->value;
        $flagChanged = $nextFlagged !== $previousFlagged;
        $deleteRecordFlagChanged = $nextDeleteRecordFlagged !== $previousDeleteRecordFlagged;

        if (! $statusChanged && ! $flagChanged && ! $deleteRecordFlagChanged) {
            return response()->json(
                ['message' => 'No account state changes were requested.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        // Block reactivation only when the account has never had a password set.
        // must_reset_password=true on a suspended/locked account means "force a
        // password change at next login" — not that the account lacks a password.
        // Allowing reactivation in that case is safe: canAuthenticate() returns true
        // for active accounts, and the forced reset is enforced at login.
        if ($statusChanged && $previousStatus === AccountStatus::PENDING_VERIFICATION && $nextStatus === AccountStatus::ACTIVE->value) {
            return response()->json(
                ['message' => 'Use the Activate Account action after reviewing this setup.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (
            $nextStatus === AccountStatus::ACTIVE->value &&
            $account->password_changed_at === null
        ) {
            $message = $previousStatus === AccountStatus::PENDING_SETUP
                ? 'This account has not completed setup yet. Reissue the setup link instead.'
                : 'Password reset is required before activation. Issue a password reset link first.';

            return response()->json(
                ['message' => $message],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (
            $statusChanged &&
            in_array($nextStatus, [
                AccountStatus::SUSPENDED->value,
                AccountStatus::LOCKED->value,
                AccountStatus::ARCHIVED->value,
            ], true)
        ) {
            $challengeId = trim($request->string('verificationChallengeId')->toString());
            $code = trim($request->string('verificationCode')->toString());

            if ($challengeId === '' || $code === '') {
                return response()->json(
                    ['message' => 'Confirmation code is required to complete this account action.'],
                    Response::HTTP_UNPROCESSABLE_ENTITY,
                );
            }

            $verified = $this->monitorActionVerificationService->verify(
                $monitor,
                $school,
                $nextStatus,
                $challengeId,
                $code,
            );

            if (! $verified) {
                return response()->json(
                    ['message' => 'Confirmation code is invalid or expired. Request a new code and try again.'],
                    Response::HTTP_UNPROCESSABLE_ENTITY,
                );
            }
        }

        if ($statusChanged) {
            $account->account_status = $nextStatus;
        }

        if ($flagChanged) {
            if ($nextFlagged) {
                $account->flagged_at = now();
                $account->flagged_by_user_id = $monitor->id;
                $account->flagged_reason = $reason;
            } else {
                $account->flagged_at = null;
                $account->flagged_by_user_id = null;
                $account->flagged_reason = null;
            }
        }

        if ($deleteRecordFlagChanged) {
            if ($nextDeleteRecordFlagged) {
                $account->delete_record_flagged_at = now();
                $account->delete_record_flagged_by_user_id = $monitor->id;
                $account->delete_record_flag_reason = $reason;
            } else {
                $account->delete_record_flagged_at = null;
                $account->delete_record_flagged_by_user_id = null;
                $account->delete_record_flag_reason = null;
            }
        }

        $account->save();
        $this->loadLatestAccountSetupToken($account);

        $revocationSummary = [
            'revokedTokens' => 0,
            'revokedWebSessions' => 0,
        ];
        if (
            $statusChanged
            && in_array($nextStatus, [
                AccountStatus::SUSPENDED->value,
                AccountStatus::LOCKED->value,
                AccountStatus::ARCHIVED->value,
            ], true)
        ) {
            $revocationSummary = $this->revokeSchoolHeadSessionsAndTokens($account);
        }

        AuditLog::query()->create([
            'user_id' => $monitor->id,
            'action' => 'account.status_updated',
            'auditable_type' => User::class,
            'auditable_id' => $account->id,
            'metadata' => [
                'category' => 'account_management',
                'outcome' => 'success',
                'actor_role' => UserRoleResolver::MONITOR,
                'target_user_id' => $account->id,
                'target_email' => $account->email,
                'target_role' => UserRoleResolver::SCHOOL_HEAD,
                'school_id' => (string) $school->id,
                'school_code' => (string) $school->school_code,
                'previous_status' => $previousStatus->value,
                'new_status' => $account->accountStatus()->value,
                'previous_flagged' => $previousFlagged,
                'new_flagged' => $nextFlagged,
                'previous_delete_record_flagged' => $previousDeleteRecordFlagged,
                'new_delete_record_flagged' => $nextDeleteRecordFlagged,
                'reason' => $reason,
                'revoked_tokens' => $revocationSummary['revokedTokens'],
                'revoked_web_sessions' => $revocationSummary['revokedWebSessions'],
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_head_account.updated',
            'schoolId' => (string) $school->id,
            'schoolCode' => (string) $school->school_code,
            'accountStatus' => $account->accountStatus()->value,
            'flagged' => $account->flagged_at !== null,
            'deleteRecordFlagged' => $account->delete_record_flagged_at !== null,
        ]));

        return response()->json([
            'data' => [
                'account' => $this->serializeSchoolHeadAccount($account),
                'message' => 'School Head account updated.',
            ],
        ]);
    }

    public function destroy(
        RemoveSchoolHeadAccountRequest $request,
        School $school,
    ): JsonResponse {
        // Despite the legacy route name, this action is the combined Accounts-panel
        // contract that permanently deletes the school and its linked School Head account(s).
        $monitor = $this->requireMonitor($request);

        $accounts = $school->schoolHeadAccounts()->with('roles')->get();
        if ($accounts->isEmpty()) {
            return response()->json(
                ['message' => 'No School Head account is linked to this school.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if ($accounts->contains(static fn (User $account): bool => UserRoleResolver::has($account, UserRoleResolver::MONITOR))) {
            return response()->json(
                ['message' => 'One of the linked accounts has monitor access and cannot be deleted here.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $reason = trim($request->string('reason')->toString());
        $challengeId = trim($request->string('verificationChallengeId')->toString());
        $code = trim($request->string('verificationCode')->toString());

        $verified = $this->monitorActionVerificationService->verify(
            $monitor,
            $school,
            AccountStatus::DELETED->value,
            $challengeId,
            $code,
        );

        if (! $verified) {
            return response()->json(
                ['message' => 'The confirmation code is invalid or expired. Send a new code and try again.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $schoolDependencies = [
            'students' => Student::query()->where('school_id', $school->id)->count(),
            'sections' => Section::query()->where('school_id', $school->id)->count(),
            'indicatorSubmissions' => IndicatorSubmission::query()->where('school_id', $school->id)->count(),
            'histories' => FormSubmissionHistory::query()->where('school_id', $school->id)->count(),
            'linkedUsers' => User::query()->where('school_id', $school->id)->count(),
        ];

        $accountEmails = $accounts
            ->map(static fn (User $account): string => (string) $account->email)
            ->values()
            ->all();
        $accountIds = $accounts
            ->map(static fn (User $account): string => (string) $account->id)
            ->values()
            ->all();

        $removedCount = 0;
        $setupTokenStorageAvailable = $this->schoolHeadAccountSetupService->storageAvailable();
        $revocationSummaries = [];
        $accountIdInts = $accounts
            ->map(static fn (User $account): int => (int) $account->id)
            ->values()
            ->all();

        $tokenRevocationsByUserId = collect();
        if ($accountIdInts !== []) {
            $tokenRevocationsByUserId = PersonalAccessToken::query()
                ->where('tokenable_type', User::class)
                ->whereIn('tokenable_id', $accountIdInts)
                ->selectRaw('tokenable_id, COUNT(*) as aggregate_count')
                ->groupBy('tokenable_id')
                ->pluck('aggregate_count', 'tokenable_id');

            PersonalAccessToken::query()
                ->where('tokenable_type', User::class)
                ->whereIn('tokenable_id', $accountIdInts)
                ->delete();
        }

        $sessionRevocationsByUserId = collect();
        if ($this->sessionsTableExists() && $accountIdInts !== []) {
            $sessionRevocationsByUserId = DB::table('sessions')
                ->whereIn('user_id', $accountIdInts)
                ->selectRaw('user_id, COUNT(*) as aggregate_count')
                ->groupBy('user_id')
                ->pluck('aggregate_count', 'user_id');

            DB::table('sessions')
                ->whereIn('user_id', $accountIdInts)
                ->delete();
        }

        if ($setupTokenStorageAvailable && $accountIdInts !== []) {
            DB::table('account_setup_tokens')
                ->whereIn('user_id', $accountIdInts)
                ->delete();
        }

        DB::transaction(function () use ($accounts, $school, $tokenRevocationsByUserId, $sessionRevocationsByUserId, &$removedCount, &$revocationSummaries): void {
            foreach ($accounts as $account) {
                $account->syncPermissions([]);
                $account->syncRoles([]);
                $account->delete();

                $revocationSummaries[] = [
                    'user_id' => (int) $account->id,
                    'revoked_tokens' => (int) ($tokenRevocationsByUserId->get((int) $account->id, 0)),
                    'revoked_web_sessions' => (int) ($sessionRevocationsByUserId->get((int) $account->id, 0)),
                ];

                $removedCount += 1;
            }

            $school->forceDelete();
        });

        AuditLog::query()->create([
            'user_id' => $monitor->id,
            'action' => 'account_and_school.removed',
            'auditable_type' => School::class,
            'auditable_id' => $school->id,
            'metadata' => [
                'category' => 'account_management',
                'outcome' => 'success',
                'actor_role' => UserRoleResolver::MONITOR,
                'school_id' => (string) $school->id,
                'school_code' => (string) $school->school_code,
                'school_name' => (string) $school->name,
                'removed_user_ids' => $accountIds,
                'removed_emails' => $accountEmails,
                'reason' => $reason,
                'dependencies' => $schoolDependencies,
                'revocations' => $revocationSummaries,
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_head_account_and_school.removed',
            'schoolId' => (string) $school->id,
            'schoolCode' => (string) $school->school_code,
            'removedCount' => $removedCount,
        ]));

        return response()->json([
            'data' => [
                'message' => 'School record, linked School Head account, and school data permanently deleted.',
                'deletedCount' => $removedCount,
            ],
        ]);
    }

    public function issueSetupLink(
        IssueSchoolHeadSetupLinkRequest $request,
        School $school,
    ): JsonResponse {
        if (! $this->schoolHeadAccountSetupService->storageAvailable()) {
            return response()->json(
                ['message' => 'Account setup token storage is unavailable. Run database migrations first.'],
                Response::HTTP_SERVICE_UNAVAILABLE,
            );
        }

        $monitor = $this->requireMonitor($request);
        $account = $this->resolveSchoolHeadAccount($school);
        if (! $account) {
            return response()->json(
                ['message' => 'No School Head account is linked to this school.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $reason = trim($request->string('reason')->toString());
        $previousStatus = $account->accountStatus();

        if ($previousStatus === AccountStatus::ARCHIVED) {
            return response()->json(
                ['message' => 'Archived accounts cannot receive setup links. Activate the account first.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if ($previousStatus !== AccountStatus::PENDING_SETUP) {
            return response()->json(
                ['message' => 'Setup links can only be issued for accounts that still need initial setup. Use password reset for active accounts.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $account->forceFill([
            'account_status' => AccountStatus::PENDING_SETUP->value,
            'must_reset_password' => true,
            'password_changed_at' => null,
            'temporary_password_issued_at' => null,
            'email_verified_at' => null,
            'verified_by_user_id' => null,
            'verified_at' => null,
            'verification_notes' => null,
        ])->save();

        $revocationSummary = $this->revokeSchoolHeadSessionsAndTokens($account);

        $issuedSetup = $this->schoolHeadAccountSetupService->issue(
            $account,
            $monitor,
            $request->ip(),
            $request->userAgent(),
        );

        $deliveryStatus = 'sent';
        $deliveryMessage = 'Setup link sent to the School Head email.';
        if (MailDelivery::isSimulated()) {
            $deliveryStatus = MailDelivery::simulatedStatus();
            $deliveryMessage = MailDelivery::simulatedMessage('Setup link was generated, but will not reach real inboxes.');
        }
        try {
            $account->notify(
                new SchoolHeadAccountSetupNotification(
                    $school,
                    $issuedSetup['setupUrl'],
                    CarbonImmutable::parse($issuedSetup['expiresAt']),
                ),
            );
        } catch (\Throwable $exception) {
            report($exception);
            $deliveryStatus = 'failed';
            $deliveryMessage = 'Setup link email delivery failed. Please try again or contact an administrator.';
        }

        $this->loadLatestAccountSetupToken($account);

        AuditLog::query()->create([
            'user_id' => $monitor->id,
            'action' => 'account.setup_link_issued',
            'auditable_type' => User::class,
            'auditable_id' => $account->id,
            'metadata' => [
                'category' => 'account_management',
                'outcome' => 'success',
                'actor_role' => UserRoleResolver::MONITOR,
                'target_user_id' => $account->id,
                'target_email' => $account->email,
                'target_role' => UserRoleResolver::SCHOOL_HEAD,
                'school_id' => (string) $school->id,
                'school_code' => (string) $school->school_code,
                'previous_status' => $previousStatus->value,
                'new_status' => $account->accountStatus()->value,
                'reason' => $reason !== '' ? $reason : 'setup_link_reissued',
                'setup_link_expires_at' => $issuedSetup['expiresAt'],
                'delivery_status' => $deliveryStatus,
                'delivery_message' => $deliveryMessage,
                'revoked_tokens' => $revocationSummary['revokedTokens'],
                'revoked_web_sessions' => $revocationSummary['revokedWebSessions'],
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_head_account.setup_link_issued',
            'schoolId' => (string) $school->id,
            'schoolCode' => (string) $school->school_code,
            'accountStatus' => $account->accountStatus()->value,
            'setupLinkExpiresAt' => $issuedSetup['expiresAt'],
        ]));

        return response()->json([
            'data' => [
                'account' => $this->serializeSchoolHeadAccount($account),
                'expiresAt' => $issuedSetup['expiresAt'],
                'delivery' => $deliveryStatus,
                'deliveryMessage' => $deliveryMessage,
            ],
        ]);
    }

    public function issuePasswordResetLink(
        IssueSchoolHeadPasswordResetLinkRequest $request,
        School $school,
    ): JsonResponse {
        $monitor = $this->requireMonitor($request);

        $account = $this->resolveSchoolHeadAccount($school);
        if (! $account) {
            return response()->json(
                ['message' => 'No School Head account is linked to this school.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $status = $account->accountStatus();
        if ($status === AccountStatus::PENDING_SETUP) {
            return response()->json(
                ['message' => 'School Head accounts pending setup should use setup links instead of password reset links.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if ($status === AccountStatus::PENDING_VERIFICATION) {
            return response()->json(
                ['message' => 'This account is waiting for Division Monitor activation. Activate the account before sending a password reset link.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (! in_array($status, [AccountStatus::ACTIVE, AccountStatus::LOCKED], true)) {
            return response()->json(
                ['message' => 'Password reset links can only be issued for active School Head accounts.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $reason = trim($request->string('reason')->toString());
        $challengeId = trim($request->string('verificationChallengeId')->toString());
        $code = trim($request->string('verificationCode')->toString());

        $verified = $this->monitorActionVerificationService->verify(
            $monitor,
            $school,
            IssueSchoolHeadAccountActionVerificationCodeRequest::TARGET_PASSWORD_RESET,
            $challengeId,
            $code,
        );

        if (! $verified) {
            return response()->json(
                ['message' => 'The confirmation code is invalid or expired. Send a new code and try again.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $expiresAt = CarbonImmutable::now()->addMinutes((int) config('auth.passwords.users.expire', 60));
        $deliveryStatus = 'sent';
        $deliveryMessage = 'Password reset link sent to the School Head email.';

        if (MailDelivery::isSimulated()) {
            $deliveryStatus = MailDelivery::simulatedStatus();
            $deliveryMessage = MailDelivery::simulatedMessage('Password reset link was generated, but will not reach real inboxes.');
        }

        $token = Password::broker()->createToken($account);
        $resetUrl = $this->buildPasswordResetUrl((string) $account->email, $token);

        try {
            $account->notify(new SchoolHeadPasswordResetNotification($resetUrl, $expiresAt));
        } catch (\Throwable $exception) {
            report($exception);
            $deliveryStatus = 'failed';
            $deliveryMessage = 'Password reset email delivery failed. Ask the School Head to retry forgot-password or contact an administrator.';
        }

        $enforced = false;
        $revocationSummary = [
            'revokedTokens' => 0,
            'revokedWebSessions' => 0,
        ];

        if ($deliveryStatus !== 'failed') {
            $account->forceFill([
                'must_reset_password' => true,
                'temporary_password_issued_at' => null,
            ])->save();

            $revocationSummary = $this->revokeSchoolHeadSessionsAndTokens($account);
            $enforced = true;
        }

        AuditLog::query()->create([
            'user_id' => $monitor->id,
            'action' => 'account.password_reset_link_issued',
            'auditable_type' => User::class,
            'auditable_id' => $account->id,
            'metadata' => [
                'category' => 'account_management',
                'outcome' => $deliveryStatus === 'failed' ? 'failure' : 'success',
                'actor_role' => UserRoleResolver::MONITOR,
                'target_user_id' => $account->id,
                'target_email' => $account->email,
                'target_role' => UserRoleResolver::SCHOOL_HEAD,
                'school_id' => (string) $school->id,
                'school_code' => (string) $school->school_code,
                'reason' => $reason,
                'delivery_status' => $deliveryStatus,
                'delivery_message' => $deliveryMessage,
                'expires_at' => $expiresAt->toISOString(),
                'enforced' => $enforced,
                'revoked_tokens' => $revocationSummary['revokedTokens'],
                'revoked_web_sessions' => $revocationSummary['revokedWebSessions'],
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_head_account.password_reset_link_issued',
            'schoolId' => (string) $school->id,
            'schoolCode' => (string) $school->school_code,
            'delivery' => $deliveryStatus,
        ]));

        return response()->json([
            'data' => [
                'account' => $this->serializeSchoolHeadAccount($account),
                'expiresAt' => $expiresAt->toISOString(),
                'delivery' => $deliveryStatus,
                'deliveryMessage' => $deliveryMessage,
                'enforced' => $enforced,
                'message' => $deliveryStatus === 'failed'
                    ? 'Password reset email delivery failed.'
                    : 'Password reset link issued.',
            ],
        ]);
    }

    public function issueTemporaryPassword(
        IssueSchoolHeadTemporaryPasswordRequest $request,
        School $school,
    ): JsonResponse {
        $monitor = $this->requireMonitor($request);

        $account = $this->resolveSchoolHeadAccount($school);
        if (! $account) {
            return response()->json(
                ['message' => 'No School Head account is linked to this school.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $status = $account->accountStatus();
        if ($status === AccountStatus::PENDING_SETUP) {
            return response()->json(
                ['message' => 'Accounts pending setup should continue using setup links until setup is completed.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if ($status === AccountStatus::PENDING_VERIFICATION) {
            return response()->json(
                ['message' => 'Activate the account before issuing a new temporary password.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        // Regeneration is intentionally limited to active accounts. Pending,
        // suspended, locked, or archived states must continue through their
        // existing lifecycle paths instead of using temp-password bootstrap.
        if ($status !== AccountStatus::ACTIVE) {
            return response()->json(
                ['message' => 'Temporary passwords can only be regenerated for active School Head accounts.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $reason = trim($request->string('reason')->toString());
        $challengeId = trim($request->string('verificationChallengeId')->toString());
        $code = trim($request->string('verificationCode')->toString());

        $verified = $this->monitorActionVerificationService->verify(
            $monitor,
            $school,
            IssueSchoolHeadAccountActionVerificationCodeRequest::TARGET_TEMPORARY_PASSWORD,
            $challengeId,
            $code,
        );

        if (! $verified) {
            return response()->json(
                ['message' => 'The confirmation code is invalid or expired. Send a new code and try again.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $temporaryPassword = $this->generateTemporaryPassword();
        $account->forceFill([
            'password' => Hash::make($temporaryPassword),
            'must_reset_password' => true,
            'password_changed_at' => now(),
            'temporary_password_issued_at' => now(),
            'verification_notes' => 'Temporary password regenerated by Division Monitor. Password change required on next login.',
        ])->save();

        $revocationSummary = $this->revokeSchoolHeadSessionsAndTokens($account);

        AuditLog::query()->create([
            'user_id' => $monitor->id,
            'action' => 'account.temporary_password_issued',
            'auditable_type' => User::class,
            'auditable_id' => $account->id,
            'metadata' => [
                'category' => 'account_management',
                'outcome' => 'success',
                'actor_role' => UserRoleResolver::MONITOR,
                'target_user_id' => $account->id,
                'target_email' => $account->email,
                'target_role' => UserRoleResolver::SCHOOL_HEAD,
                'school_id' => (string) $school->id,
                'school_code' => (string) $school->school_code,
                'account_status' => $account->accountStatus()->value,
                'reason' => $reason,
                'revoked_tokens' => $revocationSummary['revokedTokens'],
                'revoked_web_sessions' => $revocationSummary['revokedWebSessions'],
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_head_account.temporary_password_issued',
            'schoolId' => (string) $school->id,
            'schoolCode' => (string) $school->school_code,
            'accountStatus' => $account->accountStatus()->value,
        ]));

        return response()->json([
            'data' => [
                'account' => $this->serializeSchoolHeadAccount($account),
                'temporaryPassword' => $temporaryPassword,
                'message' => 'Temporary password generated. Share it now because it will not be shown again.',
            ],
        ]);
    }

    private function requireMonitor(Request $request): User
    {
        $user = ApiUserResolver::fromRequest($request);
        abort_if(! $user, Response::HTTP_UNAUTHORIZED, 'Unauthenticated.');
        abort_if(
            ! UserRoleResolver::has($user, UserRoleResolver::MONITOR),
            Response::HTTP_FORBIDDEN,
            'Only Division Monitors can manage School Head accounts.',
        );

        return $user;
    }

    private function resolveSchoolHeadAccount(School $school): ?User
    {
        // School Head uniqueness is being tightened elsewhere in the repo, but
        // the live dashboard still needs a deterministic answer when legacy
        // duplicate rows exist. Use the newest linked School Head consistently
        // for both serialization and mutation paths instead of relying on an
        // implicit collection order.
        $query = User::query()
            ->where('school_id', $school->id)
            ->orderByDesc('id');

        if ($this->accountSetupTokensAvailable()) {
            $query->with('latestAccountSetupToken');
        }

        if ($this->usersHaveAccountTypeColumn()) {
            return $query
                ->with(['roles', 'verifiedBy'])
                ->where('account_type', UserRoleResolver::SCHOOL_HEAD)
                ->first();
        }

        $aliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);

        return $query
            ->with(['roles', 'verifiedBy'])
            ->whereHas('roles', static function ($builder) use ($aliases): void {
                $builder->whereIn('name', $aliases);
            })
            ->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeSchoolHeadAccount(User $account): array
    {
        $status = $account->accountStatus();
        $account->load('verifiedBy');
        $setupToken = null;
        if ($this->accountSetupTokensAvailable()) {
            $this->loadLatestAccountSetupToken($account);
            $setupToken = $account->latestAccountSetupToken;
        }
        $setupLinkExpiresAt = null;

        if ($setupToken && $setupToken->used_at === null && $setupToken->expires_at !== null && $setupToken->expires_at->isFuture()) {
            $setupLinkExpiresAt = $setupToken->expires_at->toISOString();
        }

        $temporaryPasswordIssuedAt = $account->temporary_password_issued_at?->toISOString();
        $temporaryPasswordExpiresAt = $this->temporaryPasswordExpiresAt($account)?->toISOString();
        $temporaryPasswordExpired = $this->temporaryPasswordExpired($account);
        $lifecycleState = $this->lifecycleState($account, $status);

        return [
            'id' => (string) $account->id,
            'name' => $account->name,
            'email' => $account->email,
            'emailVerifiedAt' => $account->email_verified_at?->toISOString(),
            'lastLoginAt' => $account->last_login_at?->toISOString(),
            'accountStatus' => $status->value,
            'mustResetPassword' => (bool) $account->must_reset_password,
            'onboardingFlow' => $this->onboardingFlow($account, $status),
            'lifecycleState' => $lifecycleState,
            'lifecycleStateLabel' => $this->lifecycleStateLabel($lifecycleState),
            'recommendedAction' => $this->recommendedAction($lifecycleState),
            'temporaryPasswordIssuedAt' => $temporaryPasswordIssuedAt,
            'temporaryPasswordExpiresAt' => $temporaryPasswordExpiresAt,
            'temporaryPasswordExpired' => $temporaryPasswordExpired,
            'verifiedAt' => $account->verified_at?->toISOString(),
            'verifiedByUserId' => $account->verified_by_user_id ? (string) $account->verified_by_user_id : null,
            'verifiedByName' => $account->verifiedBy?->name,
            'verificationNotes' => $account->verification_notes,
            'flagged' => $account->flagged_at !== null,
            'flaggedAt' => $account->flagged_at?->toISOString(),
            'flagReason' => $account->flagged_reason,
            'deleteRecordFlagged' => $account->delete_record_flagged_at !== null,
            'deleteRecordFlaggedAt' => $account->delete_record_flagged_at?->toISOString(),
            'deleteRecordReason' => $account->delete_record_flag_reason,
            'setupLinkExpiresAt' => $setupLinkExpiresAt,
        ];
    }

    /**
     * @return array{revokedTokens: int, revokedWebSessions: int}
     */
    private function revokeSchoolHeadSessionsAndTokens(User $account): array
    {
        $revokedTokens = $account->tokens()->delete();

        $revokedWebSessions = 0;
        if ($this->sessionsTableExists()) {
            $revokedWebSessions = DB::table('sessions')
                ->where('user_id', $account->id)
                ->delete();
        }

        return [
            'revokedTokens' => $revokedTokens,
            'revokedWebSessions' => $revokedWebSessions,
        ];
    }

    private function accountSetupTokensAvailable(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasTable('account_setup_tokens');
        }

        if (self::$accountSetupTokensTableExists === null) {
            self::$accountSetupTokensTableExists = Schema::hasTable('account_setup_tokens');
        }

        return self::$accountSetupTokensTableExists;
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

    private function usersHaveDeleteRecordFlags(): bool
    {
        if (app()->runningUnitTests()) {
            return Schema::hasColumn('users', 'delete_record_flagged_at')
                && Schema::hasColumn('users', 'delete_record_flagged_by_user_id')
                && Schema::hasColumn('users', 'delete_record_flag_reason');
        }

        if (self::$usersHasDeleteRecordFlags === null) {
            self::$usersHasDeleteRecordFlags = Schema::hasColumn('users', 'delete_record_flagged_at')
                && Schema::hasColumn('users', 'delete_record_flagged_by_user_id')
                && Schema::hasColumn('users', 'delete_record_flag_reason');
        }

        return self::$usersHasDeleteRecordFlags;
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

    private function isUniqueConstraintViolation(QueryException $exception): bool
    {
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'unique constraint failed')
            || str_contains($message, 'duplicate entry')
            || str_contains($message, 'integrity constraint violation');
    }

    private function loadLatestAccountSetupToken(User $account): void
    {
        if ($this->accountSetupTokensAvailable()) {
            $account->load('latestAccountSetupToken');
        }
    }

    private function buildPasswordResetUrl(string $email, string $token): string
    {
        $frontend = trim((string) config('app.frontend_url', ''));
        if ($frontend === '') {
            $frontend = (string) config('app.url', 'http://127.0.0.1:8000');
        }

        $frontend = rtrim($frontend, '/');

        $query = http_build_query(
            [
                'token' => $token,
                'email' => $email,
                'role' => UserRoleResolver::SCHOOL_HEAD,
            ],
            '',
            '&',
            PHP_QUERY_RFC3986,
        );

        return $frontend . '/#/reset-password?' . $query;
    }

    private function generateTemporaryPassword(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        $maxIndex = strlen($alphabet) - 1;
        $password = '';

        for ($index = 0; $index < 8; $index += 1) {
            $password .= $alphabet[random_int(0, $maxIndex)];
        }

        return $password;
    }

    private function onboardingFlow(User $account, AccountStatus $status): string
    {
        // These statuses belong to the older setup-link onboarding lifecycle.
        // They should stay distinct from the Add School temp-password bootstrap flow.
        if (in_array($status, [AccountStatus::PENDING_SETUP, AccountStatus::PENDING_VERIFICATION], true)) {
            return 'setup_link';
        }

        // Active + must_reset_password + a temp-password issue timestamp means the
        // account is on the immediate-login bootstrap path introduced by Add School
        // creation and by monitor-side temporary password regeneration.
        if ($status === AccountStatus::ACTIVE && $account->must_reset_password && $account->temporary_password_issued_at !== null) {
            return 'temporary_password';
        }

        return 'standard';
    }

    private function lifecycleState(User $account, AccountStatus $status): string
    {
        if ($status === AccountStatus::PENDING_SETUP) {
            return 'pending_setup';
        }

        if ($status === AccountStatus::PENDING_VERIFICATION) {
            return 'pending_verification';
        }

        if ($status === AccountStatus::ACTIVE && $account->must_reset_password && $account->temporary_password_issued_at !== null) {
            return $this->temporaryPasswordExpired($account)
                ? 'temporary_password_expired'
                : 'temporary_password_active';
        }

        // An active account that still requires a password reset without a temp
        // password timestamp is using the standard reset-link path, not the
        // bootstrap temp-password lifecycle.
        if ($status === AccountStatus::ACTIVE && $account->must_reset_password) {
            return 'password_reset_required';
        }

        if ($status === AccountStatus::ACTIVE && ! $account->must_reset_password) {
            return 'active_ready';
        }

        return $status->value;
    }

    private function lifecycleStateLabel(string $state): string
    {
        return match ($state) {
            'temporary_password_active' => 'Temporary password active',
            'temporary_password_expired' => 'Temporary password expired',
            'pending_setup' => 'Pending setup',
            'pending_verification' => 'Pending verification',
            'password_reset_required' => 'Password change required',
            'active_ready' => 'Active',
            default => str_replace('_', ' ', $state),
        };
    }

    private function recommendedAction(string $state): string
    {
        return match ($state) {
            'temporary_password_expired' => 'regenerate_temporary_password',
            'pending_setup' => 'send_setup_link',
            'pending_verification' => 'activate_account',
            'password_reset_required' => 'send_password_reset_link',
            default => 'none',
        };
    }

    private function temporaryPasswordExpiresAt(User $account): ?CarbonImmutable
    {
        if (! $account->temporary_password_issued_at) {
            return null;
        }

        return CarbonImmutable::instance($account->temporary_password_issued_at)
            ->addHours($this->temporaryPasswordValidityHours());
    }

    private function temporaryPasswordExpired(User $account): bool
    {
        $expiresAt = $this->temporaryPasswordExpiresAt($account);

        return $expiresAt ? $expiresAt->isPast() : false;
    }

    private function temporaryPasswordValidityHours(): int
    {
        $configured = (int) env('CSPAMS_SCHOOL_HEAD_TEMP_PASSWORD_EXPIRE_HOURS', 72);

        return max(1, $configured);
    }
}
