<?php

namespace App\Http\Controllers\Api;

use App\Events\CspamsUpdateBroadcast;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\IssueSchoolHeadAccountActionVerificationCodeRequest;
use App\Http\Requests\Api\IssueSchoolHeadSetupLinkRequest;
use App\Http\Requests\Api\UpsertSchoolHeadAccountProfileRequest;
use App\Http\Requests\Api\UpdateSchoolHeadAccountStatusRequest;
use App\Models\AuditLog;
use App\Models\School;
use App\Models\User;
use App\Notifications\SchoolHeadAccountSetupNotification;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\MonitorActionVerificationService;
use App\Support\Auth\SchoolHeadAccountSetupService;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\AccountStatus;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Hash;
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

        return response()->json([
            'data' => [
                'challengeId' => $challenge['challengeId'],
                'expiresAt' => $challenge['expiresAt'],
                'delivery' => 'sent',
                'deliveryMessage' => 'Confirmation code sent to your monitor email.',
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

            if ($emailChanged && ! $this->schoolHeadAccountSetupService->storageAvailable()) {
                return response()->json(
                    ['message' => 'Account setup token storage is unavailable. Run database migrations first.'],
                    Response::HTTP_SERVICE_UNAVAILABLE,
                );
            }

            $account->forceFill([
                'name' => $name,
                'email' => $email,
                ...($emailChanged ? [
                    'email_verified_at' => null,
                    'account_status' => AccountStatus::PENDING_SETUP->value,
                    'must_reset_password' => true,
                    'password_changed_at' => null,
                ] : []),
            ])->save();

            $setupLink = null;
            $setupLinkExpiresAt = null;
            $deliveryStatus = null;
            $deliveryMessage = null;

            if ($emailChanged) {
                $issuedSetup = $this->schoolHeadAccountSetupService->issue(
                    $account,
                    $monitor,
                    $request->ip(),
                    $request->userAgent(),
                );

                $setupLink = $issuedSetup['setupUrl'];
                $setupLinkExpiresAt = $issuedSetup['expiresAt'];
                $deliveryStatus = 'sent';
                $deliveryMessage = 'Setup link sent to the School Head email.';

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
                    $deliveryMessage = 'Setup link email delivery failed. Share the setup link manually.';
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
                    'setup_link_issued' => $emailChanged,
                    'setup_link_expires_at' => $setupLinkExpiresAt,
                    'delivery_status' => $deliveryStatus,
                    'delivery_message' => $deliveryMessage,
                    'account_status' => $account->accountStatus()->value,
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
                        ? 'School Head account updated. Setup link reissued for email verification.'
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

        $account = new User();
        $account->name = $name;
        $account->email = $email;
        $account->password = Hash::make(Str::password(40));
        $account->must_reset_password = true;
        $account->password_changed_at = null;
        $account->account_status = AccountStatus::PENDING_SETUP->value;
        $account->school_id = $school->id;
        $account->save();
        $account->assignRole(UserRoleResolver::SCHOOL_HEAD);

        $issuedSetup = $this->schoolHeadAccountSetupService->issue(
            $account,
            $monitor,
            $request->ip(),
            $request->userAgent(),
        );

        $deliveryStatus = 'sent';
        $deliveryMessage = 'Setup link sent to the School Head email.';
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
            $deliveryMessage = 'Setup link email delivery failed. Share the setup link manually.';
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
                'setupLink' => $issuedSetup['setupUrl'],
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
        $nextStatus = $request->filled('accountStatus')
            ? (string) $request->string('accountStatus')->toString()
            : $previousStatus->value;
        $nextFlagged = $request->has('flagged')
            ? $request->boolean('flagged')
            : $previousFlagged;
        $reason = trim($request->string('reason')->toString());

        $statusChanged = $nextStatus !== $previousStatus->value;
        $flagChanged = $nextFlagged !== $previousFlagged;

        if (! $statusChanged && ! $flagChanged) {
            return response()->json(
                ['message' => 'No account state changes were requested.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (
            $nextStatus === AccountStatus::ACTIVE->value &&
            ($account->must_reset_password || $account->password_changed_at === null)
        ) {
            return response()->json(
                ['message' => 'This account has not completed setup yet. Reissue the setup link instead.'],
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

        $account->save();
        $this->loadLatestAccountSetupToken($account);

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
                'reason' => $reason,
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
        ]));

        return response()->json([
            'data' => [
                'account' => $this->serializeSchoolHeadAccount($account),
                'message' => 'School Head account updated.',
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

        $statusChangedToPendingSetup = false;
        if ($account->email_verified_at !== null) {
            $account->email_verified_at = null;
        }
        if ($previousStatus !== AccountStatus::PENDING_SETUP) {
            if ($reason === '') {
                return response()->json(
                    ['message' => 'Provide a reason before reissuing a setup link for an active account.'],
                    Response::HTTP_UNPROCESSABLE_ENTITY,
                );
            }

            $account->forceFill([
                'account_status' => AccountStatus::PENDING_SETUP->value,
                'must_reset_password' => true,
                'password_changed_at' => null,
                'email_verified_at' => null,
            ])->save();

            $statusChangedToPendingSetup = true;
        } else {
            $account->save();
        }

        $issuedSetup = $this->schoolHeadAccountSetupService->issue(
            $account,
            $monitor,
            $request->ip(),
            $request->userAgent(),
        );

        $deliveryStatus = 'sent';
        $deliveryMessage = 'Setup link sent to the School Head email.';
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
            $deliveryMessage = 'Setup link email delivery failed. Share the setup link manually.';
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
                'status_changed_to_pending_setup' => $statusChangedToPendingSetup,
                'reason' => $reason !== '' ? $reason : 'setup_link_reissued',
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
            'eventType' => 'school_head_account.setup_link_issued',
            'schoolId' => (string) $school->id,
            'schoolCode' => (string) $school->school_code,
            'accountStatus' => $account->accountStatus()->value,
            'setupLinkExpiresAt' => $issuedSetup['expiresAt'],
        ]));

        return response()->json([
            'data' => [
                'account' => $this->serializeSchoolHeadAccount($account),
                'setupLink' => $issuedSetup['setupUrl'],
                'expiresAt' => $issuedSetup['expiresAt'],
                'delivery' => $deliveryStatus,
                'deliveryMessage' => $deliveryMessage,
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
            ->with('roles')
            ->where('school_id', $school->id)
            ->orderByDesc('id');

        if ($this->accountSetupTokensAvailable()) {
            $query->with('latestAccountSetupToken');
        }

        return $query
            ->get()
            ->first(
                static fn (User $candidate): bool => UserRoleResolver::has($candidate, UserRoleResolver::SCHOOL_HEAD),
            );
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
            'setupLinkExpiresAt' => $setupLinkExpiresAt,
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
}
