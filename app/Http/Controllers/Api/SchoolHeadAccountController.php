<?php

namespace App\Http\Controllers\Api;

use App\Events\CspamsUpdateBroadcast;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\IssueSchoolHeadAccountActionVerificationCodeRequest;
use App\Http\Requests\Api\IssueSchoolHeadPasswordResetLinkRequest;
use App\Http\Requests\Api\IssueSchoolHeadSetupLinkRequest;
use App\Http\Requests\Api\RemoveSchoolHeadAccountRequest;
use App\Http\Requests\Api\UpsertSchoolHeadAccountProfileRequest;
use App\Http\Requests\Api\UpdateSchoolHeadAccountStatusRequest;
use App\Models\AuditLog;
use App\Models\School;
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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class SchoolHeadAccountController extends Controller
{
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

            $updates = [
                'name' => $name,
                'email' => $email,
            ];

            if ($emailChanged) {
                $updates['email_verified_at'] = null;
                $updates['must_reset_password'] = true;
                $updates['password_changed_at'] = null;
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

            $setupLink = null;
            $setupLinkExpiresAt = null;
            $deliveryStatus = null;
            $deliveryMessage = null;
            $exposeSetupLink = $this->shouldExposeOneTimeSecrets();

            if ($reissueAllowed) {
                $issuedSetup = $this->schoolHeadAccountSetupService->issue(
                    $account,
                    $monitor,
                    $request->ip(),
                    $request->userAgent(),
                );

                $setupLink = $exposeSetupLink ? $issuedSetup['setupUrl'] : null;
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
                    $deliveryMessage = $exposeSetupLink
                        ? 'Setup link email delivery failed. Share the setup link manually.'
                        : 'Setup link email delivery failed. Please try again or contact an administrator.';
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
                'setupLink' => $setupLink,
                'expiresAt' => $setupLinkExpiresAt,
                'delivery' => $deliveryStatus,
                'deliveryMessage' => $deliveryMessage,
            ],
        ]);
        }

        if (! $this->schoolHeadAccountSetupService->storageAvailable()) {
            return response()->json(
                ['message' => 'Account setup token storage is unavailable. Run database migrations first.'],
                Response::HTTP_SERVICE_UNAVAILABLE,
            );
        }

        $duplicateQuery = User::query()->where('school_id', $school->id);
        if (Schema::hasColumn('users', 'account_type')) {
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
        $account->name = $name;
        $account->email = $email;
        $account->password = Hash::make(Str::password(40));
        $account->must_reset_password = true;
        $account->password_changed_at = null;
        $account->account_status = AccountStatus::PENDING_SETUP->value;
        $account->school_id = $school->id;
        if (Schema::hasColumn('users', 'account_type')) {
            $account->account_type = UserRoleResolver::SCHOOL_HEAD;
        }
        $account->save();
        $account->assignRole(UserRoleResolver::SCHOOL_HEAD);

        $issuedSetup = $this->schoolHeadAccountSetupService->issue(
            $account,
            $monitor,
            $request->ip(),
            $request->userAgent(),
        );
        $exposeSetupLink = $this->shouldExposeOneTimeSecrets();

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
            $deliveryMessage = $exposeSetupLink
                ? 'Setup link email delivery failed. Share the setup link manually.'
                : 'Setup link email delivery failed. Please try again or contact an administrator.';
        }

        $this->loadLatestAccountSetupToken($account);

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
                'setup_link_expires_at' => $issuedSetup['expiresAt'],
                'delivery_status' => $deliveryStatus,
                'delivery_message' => $deliveryMessage,
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
            'setupLinkExpiresAt' => $issuedSetup['expiresAt'],
        ]));

        return response()->json([
            'data' => [
                'account' => $this->serializeSchoolHeadAccount($account),
                'setupLink' => $exposeSetupLink ? $issuedSetup['setupUrl'] : null,
                'expiresAt' => $issuedSetup['expiresAt'],
                'delivery' => $deliveryStatus,
                'deliveryMessage' => $deliveryMessage,
                'message' => 'School Head account created.',
            ],
        ], Response::HTTP_CREATED);
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
        $deleteRecordFlagAvailable = Schema::hasColumn('users', 'delete_record_flagged_at')
            && Schema::hasColumn('users', 'delete_record_flagged_by_user_id')
            && Schema::hasColumn('users', 'delete_record_flag_reason');

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

        if (
            $nextStatus === AccountStatus::ACTIVE->value &&
            ($account->must_reset_password || $account->password_changed_at === null)
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
            'deleted',
            $challengeId,
            $code,
        );

        if (! $verified) {
            return response()->json(
                ['message' => 'The confirmation code is invalid or expired. Send a new code and try again.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

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

        DB::transaction(function () use ($accounts, $setupTokenStorageAvailable, &$removedCount, &$revocationSummaries): void {
            foreach ($accounts as $account) {
                $revocationSummary = $this->revokeSchoolHeadSessionsAndTokens($account);

                if ($setupTokenStorageAvailable) {
                    $account->accountSetupTokens()->delete();
                }

                $account->syncPermissions([]);
                $account->syncRoles([]);

                $account->forceFill([
                    'account_status' => AccountStatus::ARCHIVED->value,
                    'must_reset_password' => true,
                    'password_changed_at' => null,
                    'email_verified_at' => null,
                    'school_id' => null,
                ])->save();

                $revocationSummaries[] = [
                    'user_id' => (int) $account->id,
                    'revoked_tokens' => $revocationSummary['revokedTokens'],
                    'revoked_web_sessions' => $revocationSummary['revokedWebSessions'],
                ];

                $removedCount += 1;
            }
        });

        AuditLog::query()->create([
            'user_id' => $monitor->id,
            'action' => 'account.removed',
            'auditable_type' => School::class,
            'auditable_id' => $school->id,
            'metadata' => [
                'category' => 'account_management',
                'outcome' => 'success',
                'actor_role' => UserRoleResolver::MONITOR,
                'school_id' => (string) $school->id,
                'school_code' => (string) $school->school_code,
                'removed_user_ids' => $accountIds,
                'removed_emails' => $accountEmails,
                'reason' => $reason,
                'revocations' => $revocationSummaries,
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_head_account.removed',
            'schoolId' => (string) $school->id,
            'schoolCode' => (string) $school->school_code,
            'removedCount' => $removedCount,
        ]));

        return response()->json([
            'data' => [
                'message' => $removedCount === 1 ? 'School Head account removed.' : 'School Head accounts removed.',
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
            'email_verified_at' => null,
        ])->save();

        $revocationSummary = $this->revokeSchoolHeadSessionsAndTokens($account);

        $issuedSetup = $this->schoolHeadAccountSetupService->issue(
            $account,
            $monitor,
            $request->ip(),
            $request->userAgent(),
        );
        $exposeSetupLink = $this->shouldExposeOneTimeSecrets();

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
            $deliveryMessage = $exposeSetupLink
                ? 'Setup link email delivery failed. Share the setup link manually.'
                : 'Setup link email delivery failed. Please try again or contact an administrator.';
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
                'setupLink' => $exposeSetupLink ? $issuedSetup['setupUrl'] : null,
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

        $exposeResetLink = $this->shouldExposeOneTimeSecrets();
        $enforced = false;
        $revocationSummary = [
            'revokedTokens' => 0,
            'revokedWebSessions' => 0,
        ];

        if ($deliveryStatus !== 'failed' || $exposeResetLink) {
            $account->forceFill([
                'must_reset_password' => true,
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
                'resetLink' => $exposeResetLink ? $resetUrl : null,
                'enforced' => $enforced,
                'message' => $deliveryStatus === 'failed'
                    ? 'Password reset email delivery failed.'
                    : 'Password reset link issued.',
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
        $query = User::query()
            ->where('school_id', $school->id)
            ->orderByDesc('id');

        if ($this->accountSetupTokensAvailable()) {
            $query->with('latestAccountSetupToken');
        }

        if (Schema::hasColumn('users', 'account_type')) {
            /** @var User|null $account */
            $account = (clone $query)
                ->with('roles')
                ->where('account_type', UserRoleResolver::SCHOOL_HEAD)
                ->first();

            if ($account) {
                return $account;
            }

            $aliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);

            /** @var User|null $fallback */
            $fallback = (clone $query)
                ->with('roles')
                ->whereHas('roles', static function ($builder) use ($aliases): void {
                    $builder->whereIn('name', $aliases);
                })
                ->first();

            return $fallback;
        }

        $aliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);

        return $query
            ->with('roles')
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
        $setupToken = null;
        if ($this->accountSetupTokensAvailable()) {
            $this->loadLatestAccountSetupToken($account);
            $setupToken = $account->latestAccountSetupToken;
        }
        $setupLinkExpiresAt = null;

        if ($setupToken && $setupToken->used_at === null && $setupToken->expires_at !== null && $setupToken->expires_at->isFuture()) {
            $setupLinkExpiresAt = $setupToken->expires_at->toISOString();
        }

        return [
            'id' => (string) $account->id,
            'name' => $account->name,
            'email' => $account->email,
            'emailVerifiedAt' => $account->email_verified_at?->toISOString(),
            'lastLoginAt' => $account->last_login_at?->toISOString(),
            'accountStatus' => $status->value,
            'mustResetPassword' => (bool) $account->must_reset_password,
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
        if (Schema::hasTable('sessions')) {
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
        return Schema::hasTable('account_setup_tokens');
    }

    private function loadLatestAccountSetupToken(User $account): void
    {
        if ($this->accountSetupTokensAvailable()) {
            $account->loadMissing('latestAccountSetupToken');
        }
    }

    private function shouldExposeOneTimeSecrets(): bool
    {
        if (app()->environment(['local', 'testing'])) {
            return true;
        }

        if (MailDelivery::isSimulated()) {
            return true;
        }

        return (bool) config('app.debug', false);
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
}
