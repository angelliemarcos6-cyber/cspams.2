<?php

namespace App\Http\Controllers\Api;

use App\Events\CspamsUpdateBroadcast;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\IssueSchoolHeadSetupLinkRequest;
use App\Http\Requests\Api\UpdateSchoolHeadAccountStatusRequest;
use App\Models\AuditLog;
use App\Models\School;
use App\Models\User;
use App\Notifications\SchoolHeadAccountSetupNotification;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\SchoolHeadAccountSetupService;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\AccountStatus;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;

class SchoolHeadAccountController extends Controller
{
    public function __construct(
        private readonly SchoolHeadAccountSetupService $schoolHeadAccountSetupService,
    ) {
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
            $previousStatus === AccountStatus::PENDING_SETUP &&
            ($account->must_reset_password || $account->password_changed_at === null)
        ) {
            return response()->json(
                ['message' => 'This account has not completed setup yet. Reissue the setup link instead.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
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
            ])->save();

            $statusChangedToPendingSetup = true;
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
            ->where('school_id', $school->id);

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
