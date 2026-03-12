<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\ApproveMonitorMfaResetRequest;
use App\Http\Requests\Api\CompleteMonitorMfaResetRequest;
use App\Http\Requests\Api\LoginRequest;
use App\Http\Requests\Api\RegenerateMonitorMfaBackupCodesRequest;
use App\Http\Requests\Api\RequestMonitorMfaResetRequest;
use App\Http\Requests\Api\ResetRequiredPasswordRequest;
use App\Http\Requests\Api\VerifyMonitorMfaRequest;
use App\Models\MonitorMfaResetTicket;
use App\Models\User;
use App\Notifications\MonitorMfaCodeNotification;
use App\Notifications\MonitorMfaResetApprovedNotification;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use App\Support\Audit\AuthAuditLogger;
use App\Support\Domain\AccountStatus;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $role = UserRoleResolver::normalizeLoginRole($request->string('role')->toString());
        $rawLogin = trim($request->string('login')->toString());
        $login = $role === UserRoleResolver::SCHOOL_HEAD
            ? (string) $this->normalizeSchoolCode($rawLogin)
            : $rawLogin;
        $password = $request->string('password')->toString();

        $user = $this->resolveUserForLogin($role, $login);

        if (! $user || ! Hash::check($password, $user->password) || ! UserRoleResolver::has($user, $role)) {
            AuthAuditLogger::record(
                $request,
                'auth.login.failed',
                'failure',
                $user,
                $role,
                $login,
                ['reason' => 'invalid_credentials'],
            );

            $message = $role === UserRoleResolver::SCHOOL_HEAD
                ? 'Invalid school code or password.'
                : 'Invalid credentials for the selected role.';

            return response()->json(
                ['message' => $message],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (($inactiveResponse = $this->rejectInactiveAccount(
            $request,
            $user,
            $role,
            $login,
            'auth.login.failed',
        )) instanceof JsonResponse) {
            return $inactiveResponse;
        }

        if ($user->must_reset_password) {
            AuthAuditLogger::record(
                $request,
                'auth.login.failed',
                'failure',
                $user,
                $role,
                $login,
                ['reason' => 'password_reset_required'],
            );

            return response()->json(
                [
                    'message' => 'Password reset is required before dashboard access.',
                    'requiresPasswordReset' => true,
                ],
                Response::HTTP_FORBIDDEN,
            );
        }

        if ($role === UserRoleResolver::MONITOR && $this->monitorMfaEnabled()) {
            $mfaChallenge = $this->issueMonitorMfaChallenge($user, $login);

            AuthAuditLogger::record(
                $request,
                'auth.login.mfa_challenge_issued',
                'challenge',
                $user,
                $role,
                $login,
                [
                    'mfa_challenge_id' => $mfaChallenge['challengeId'],
                    'mfa_expires_at' => $mfaChallenge['expiresAt'],
                ],
            );

            return response()->json(
                [
                    'requiresMfa' => true,
                    'mfa' => [
                        'challengeId' => $mfaChallenge['challengeId'],
                        'expiresAt' => $mfaChallenge['expiresAt'],
                    ],
                    'message' => 'A verification code was sent to your email.',
                ],
                Response::HTTP_ACCEPTED,
            );
        }

        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }

        // Keep bearer token response for backward-compatible non-SPA clients.
        $tokenPayload = $this->issueDashboardToken($user, $role, true);

        AuthAuditLogger::record(
            $request,
            'auth.login.success',
            'success',
            $user,
            $role,
            $login,
            [
                'token_expires_at' => $tokenPayload['expiresAt'],
                'token_refresh_after' => $tokenPayload['refreshAfter'],
            ],
        );

        return response()->json([
            'token' => $tokenPayload['token'],
            'tokenType' => 'Bearer',
            'expiresAt' => $tokenPayload['expiresAt'],
            'refreshAfter' => $tokenPayload['refreshAfter'],
            'user' => $this->serializeUser($user, $role),
        ]);
    }

    public function resetRequiredPassword(ResetRequiredPasswordRequest $request): JsonResponse
    {
        $role = UserRoleResolver::normalizeLoginRole($request->string('role')->toString());
        $rawLogin = trim($request->string('login')->toString());
        $login = $role === UserRoleResolver::SCHOOL_HEAD
            ? (string) $this->normalizeSchoolCode($rawLogin)
            : $rawLogin;
        $currentPassword = $request->string('current_password')->toString();
        $newPassword = $request->string('new_password')->toString();

        $user = $this->resolveUserForLogin($role, $login);

        if (! $user || ! Hash::check($currentPassword, $user->password) || ! UserRoleResolver::has($user, $role)) {
            AuthAuditLogger::record(
                $request,
                'auth.password_reset.failed',
                'failure',
                $user,
                $role,
                $login,
                ['reason' => 'invalid_credentials'],
            );

            $message = $role === UserRoleResolver::SCHOOL_HEAD
                ? 'Invalid school code or password.'
                : 'Invalid credentials for the selected role.';

            return response()->json(
                ['message' => $message],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (($inactiveResponse = $this->rejectInactiveAccount(
            $request,
            $user,
            $role,
            $login,
            'auth.password_reset.failed',
        )) instanceof JsonResponse) {
            return $inactiveResponse;
        }

        if (! $user->must_reset_password) {
            AuthAuditLogger::record(
                $request,
                'auth.password_reset.failed',
                'failure',
                $user,
                $role,
                $login,
                ['reason' => 'reset_not_required'],
            );

            return response()->json(
                ['message' => 'Password reset is not required for this account.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (Hash::check($newPassword, $user->password)) {
            AuthAuditLogger::record(
                $request,
                'auth.password_reset.failed',
                'failure',
                $user,
                $role,
                $login,
                ['reason' => 'password_reuse_blocked'],
            );

            return response()->json(
                ['message' => 'New password must be different from your current password.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $user->forceFill([
            'password' => Hash::make($newPassword),
            'must_reset_password' => false,
            'password_changed_at' => now(),
        ])->save();

        // Password resets invalidate all existing API tokens immediately.
        $user->tokens()->delete();
        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }
        $tokenPayload = $this->issueDashboardToken($user, $role, false);

        AuthAuditLogger::record(
            $request,
            'auth.password_reset.success',
            'success',
            $user,
            $role,
            $login,
            [
                'token_expires_at' => $tokenPayload['expiresAt'],
                'token_refresh_after' => $tokenPayload['refreshAfter'],
            ],
        );

        return response()->json([
            'token' => $tokenPayload['token'],
            'tokenType' => 'Bearer',
            'expiresAt' => $tokenPayload['expiresAt'],
            'refreshAfter' => $tokenPayload['refreshAfter'],
            'user' => $this->serializeUser($user->fresh('school'), $role),
        ]);
    }

    public function verifyMonitorMfa(VerifyMonitorMfaRequest $request): JsonResponse
    {
        if (! $this->monitorMfaEnabled()) {
            return response()->json(
                ['message' => 'MFA verification is not required for this environment.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $role = UserRoleResolver::MONITOR;
        $login = strtolower(trim($request->string('login')->toString()));
        $challengeId = trim($request->string('challenge_id')->toString());
        $code = trim($request->string('code')->toString());

        $user = $this->resolveUserForLogin($role, $login);

        if (! $user || ! UserRoleResolver::has($user, $role)) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_verify.failed',
                'failure',
                null,
                $role,
                $login,
                ['reason' => 'invalid_credentials'],
            );

            return response()->json(
                ['message' => 'Invalid credentials for the selected role.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (($inactiveResponse = $this->rejectInactiveAccount(
            $request,
            $user,
            $role,
            $login,
            'auth.mfa_verify.failed',
        )) instanceof JsonResponse) {
            Cache::forget($this->monitorMfaCacheKey($challengeId));

            return $inactiveResponse;
        }

        $challenge = $this->readMonitorMfaChallenge($challengeId);
        if (! $challenge || $this->monitorMfaChallengeExpired($challenge)) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_verify.failed',
                'failure',
                $user,
                $role,
                $login,
                ['reason' => 'challenge_missing_or_expired'],
            );

            Cache::forget($this->monitorMfaCacheKey($challengeId));

            return response()->json(
                ['message' => 'Verification challenge expired. Please sign in again.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (
            (int) ($challenge['user_id'] ?? 0) !== (int) $user->id ||
            (string) ($challenge['role'] ?? '') !== $role ||
            (string) ($challenge['login'] ?? '') !== $login
        ) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_verify.failed',
                'failure',
                $user,
                $role,
                $login,
                [
                    'reason' => 'challenge_identity_mismatch',
                    'mfa_challenge_id' => $challengeId,
                ],
            );

            Cache::forget($this->monitorMfaCacheKey($challengeId));

            return response()->json(
                ['message' => 'Verification challenge is invalid. Please sign in again.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $usedBackupCode = false;
        if (! Hash::check($code, (string) ($challenge['code_hash'] ?? ''))) {
            $normalizedBackupCode = $this->normalizeBackupCode($code);
            if ($normalizedBackupCode !== null && $this->consumeMonitorBackupCode($user, $normalizedBackupCode)) {
                $usedBackupCode = true;

                AuthAuditLogger::record(
                    $request,
                    'auth.mfa_verify.backup_code_used',
                    'success',
                    $user,
                    $role,
                    $login,
                    [
                        'mfa_challenge_id' => $challengeId,
                        'backup_codes_remaining' => $this->monitorBackupCodeCount($user),
                    ],
                );
            } else {
                $attempts = (int) ($challenge['attempts'] ?? 0) + 1;
                $maxAttempts = (int) ($challenge['max_attempts'] ?? $this->monitorMfaMaxAttempts());

                if ($attempts >= $maxAttempts) {
                    Cache::forget($this->monitorMfaCacheKey($challengeId));

                    AuthAuditLogger::record(
                        $request,
                        'auth.mfa_verify.locked_out',
                        'lockout',
                        $user,
                        $role,
                        $login,
                        [
                            'reason' => 'max_attempts_exceeded',
                            'mfa_challenge_id' => $challengeId,
                        ],
                    );

                    return response()->json(
                        ['message' => 'Too many invalid verification attempts. Please sign in again.'],
                        Response::HTTP_TOO_MANY_REQUESTS,
                    );
                }

                $challenge['attempts'] = $attempts;
                $this->storeMonitorMfaChallenge($challengeId, $challenge);

                AuthAuditLogger::record(
                    $request,
                    'auth.mfa_verify.failed',
                    'failure',
                    $user,
                    $role,
                    $login,
                    [
                        'reason' => 'invalid_code',
                        'mfa_challenge_id' => $challengeId,
                        'attempts' => $attempts,
                        'attempts_remaining' => max(0, $maxAttempts - $attempts),
                    ],
                );

                return response()->json(
                    ['message' => 'Invalid verification code or backup code.'],
                    Response::HTTP_UNPROCESSABLE_ENTITY,
                );
            }
        }

        Cache::forget($this->monitorMfaCacheKey($challengeId));

        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }

        $tokenPayload = $this->issueDashboardToken($user, $role, true);

        AuthAuditLogger::record(
            $request,
            'auth.mfa_verify.success',
            'success',
            $user,
            $role,
            $login,
            [
                'mfa_challenge_id' => $challengeId,
                'token_expires_at' => $tokenPayload['expiresAt'],
                'token_refresh_after' => $tokenPayload['refreshAfter'],
                'mfa_method' => $usedBackupCode ? 'backup_code' : 'email_code',
            ],
        );

        return response()->json([
            'token' => $tokenPayload['token'],
            'tokenType' => 'Bearer',
            'expiresAt' => $tokenPayload['expiresAt'],
            'refreshAfter' => $tokenPayload['refreshAfter'],
            'user' => $this->serializeUser($user->fresh('school'), $role),
        ]);
    }

    public function regenerateMonitorMfaBackupCodes(RegenerateMonitorMfaBackupCodesRequest $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $role = UserRoleResolver::MONITOR;
        $login = strtolower((string) $user->email);

        if (! UserRoleResolver::has($user, $role)) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_backup_codes.regenerate.failed',
                'failure',
                $user,
                null,
                $login,
                ['reason' => 'insufficient_role'],
            );

            return response()->json(
                ['message' => 'Only division monitor accounts can manage MFA backup codes.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $currentPassword = $request->string('current_password')->toString();
        if (! Hash::check($currentPassword, $user->password)) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_backup_codes.regenerate.failed',
                'failure',
                $user,
                $role,
                $login,
                ['reason' => 'invalid_credentials'],
            );

            return response()->json(
                ['message' => 'Invalid credentials for the selected role.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $backupCodes = $this->generateAndStoreMonitorBackupCodes($user);
        $generatedAt = CarbonImmutable::now();

        AuthAuditLogger::record(
            $request,
            'auth.mfa_backup_codes.regenerate.success',
            'success',
            $user,
            $role,
            $login,
            [
                'backup_codes_generated' => count($backupCodes),
                'generated_at' => $generatedAt->toISOString(),
            ],
        );

        return response()->json([
            'backupCodes' => $backupCodes,
            'generatedAt' => $generatedAt->toISOString(),
            'message' => 'Backup codes generated. Store them securely; each code can be used once.',
        ]);
    }

    public function requestMonitorMfaReset(RequestMonitorMfaResetRequest $request): JsonResponse
    {
        if (! $this->monitorMfaEnabled()) {
            return response()->json(
                ['message' => 'MFA reset is not required for this environment.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $role = UserRoleResolver::MONITOR;
        $login = strtolower(trim($request->string('login')->toString()));
        $password = $request->string('password')->toString();
        $reason = trim($request->string('reason')->toString());

        $user = $this->resolveUserForLogin($role, $login);
        if (! $user || ! UserRoleResolver::has($user, $role) || ! Hash::check($password, $user->password)) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_reset.request.failed',
                'failure',
                $user,
                $role,
                $login,
                ['reason' => 'invalid_credentials'],
            );

            return response()->json(
                ['message' => 'Invalid credentials for the selected role.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (($inactiveResponse = $this->rejectInactiveAccount(
            $request,
            $user,
            $role,
            $login,
            'auth.mfa_reset.request.failed',
        )) instanceof JsonResponse) {
            return $inactiveResponse;
        }

        $expiresAt = CarbonImmutable::now()->addMinutes($this->monitorMfaResetRequestTtlMinutes());
        $this->expireOpenMonitorMfaResetTickets((int) $user->id);

        $ticket = MonitorMfaResetTicket::query()->create([
            'user_id' => $user->id,
            'requested_by_user_id' => null,
            'status' => MonitorMfaResetTicket::STATUS_PENDING,
            'reason' => $reason !== '' ? $reason : null,
            'expires_at' => $expiresAt,
            'requested_ip' => $request->ip(),
            'requested_user_agent' => $request->userAgent(),
        ]);

        AuthAuditLogger::record(
            $request,
            'auth.mfa_reset.requested',
            'challenge',
            $user,
            $role,
            $login,
            [
                'mfa_reset_ticket_id' => $ticket->id,
                'mfa_reset_expires_at' => $expiresAt->toISOString(),
            ],
        );

        return response()->json(
            [
                'status' => MonitorMfaResetTicket::STATUS_PENDING,
                'requestId' => $ticket->id,
                'expiresAt' => $expiresAt->toISOString(),
                'message' => 'MFA reset request submitted. Await admin approval before completion.',
            ],
            Response::HTTP_ACCEPTED,
        );
    }

    public function monitorMfaResetRequests(Request $request): JsonResponse
    {
        $actor = ApiUserResolver::fromRequest($request);
        if (! $actor) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! UserRoleResolver::has($actor, UserRoleResolver::MONITOR)) {
            return response()->json(
                ['message' => 'Only division monitor accounts can access MFA reset approvals.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $now = CarbonImmutable::now();
        $items = MonitorMfaResetTicket::query()
            ->with('user:id,name,email')
            ->where('status', MonitorMfaResetTicket::STATUS_PENDING)
            ->where('expires_at', '>', $now)
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(static function (MonitorMfaResetTicket $ticket): array {
                return [
                    'id' => $ticket->id,
                    'status' => $ticket->status,
                    'reason' => $ticket->reason,
                    'requestedAt' => $ticket->created_at?->toISOString(),
                    'expiresAt' => $ticket->expires_at?->toISOString(),
                    'requester' => [
                        'id' => $ticket->user?->id,
                        'name' => $ticket->user?->name,
                        'email' => $ticket->user?->email,
                    ],
                ];
            })
            ->values()
            ->all();

        return response()->json(['data' => $items]);
    }

    public function approveMonitorMfaReset(
        ApproveMonitorMfaResetRequest $request,
        MonitorMfaResetTicket $ticket,
    ): JsonResponse {
        $actor = ApiUserResolver::fromRequest($request);
        if (! $actor) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! UserRoleResolver::has($actor, UserRoleResolver::MONITOR)) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_reset.approve.failed',
                'failure',
                $actor,
                null,
                $actor->email,
                [
                    'reason' => 'insufficient_role',
                    'mfa_reset_ticket_id' => $ticket->id,
                ],
            );

            return response()->json(
                ['message' => 'Only division monitor accounts can approve MFA reset requests.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $targetUser = $ticket->user()->first();
        if (! $targetUser || ! UserRoleResolver::has($targetUser, UserRoleResolver::MONITOR)) {
            return response()->json(
                ['message' => 'MFA reset approval is only supported for division monitor accounts.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $now = CarbonImmutable::now();
        if (
            $ticket->status !== MonitorMfaResetTicket::STATUS_PENDING ||
            $ticket->expires_at === null ||
            $ticket->expires_at->lte($now)
        ) {
            return response()->json(
                ['message' => 'MFA reset request is no longer pending approval.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $approvalToken = $this->monitorMfaResetApprovalToken();
        $approvalExpiresAt = $now->addMinutes($this->monitorMfaResetApprovalTtlMinutes());
        $approvalNotes = trim($request->string('notes')->toString());

        $ticket->forceFill([
            'status' => MonitorMfaResetTicket::STATUS_APPROVED,
            'approved_by_user_id' => $actor->id,
            'approved_at' => $now,
            'approval_token_hash' => Hash::make($approvalToken),
            'approval_token_expires_at' => $approvalExpiresAt,
        ])->save();

        $targetUser->notify(
            new MonitorMfaResetApprovedNotification($approvalToken, $approvalExpiresAt->toDateTimeString()),
        );

        AuthAuditLogger::record(
            $request,
            'auth.mfa_reset.approved',
            'success',
            $actor,
            UserRoleResolver::MONITOR,
            $targetUser->email,
            [
                'mfa_reset_ticket_id' => $ticket->id,
                'target_user_id' => $targetUser->id,
                'approval_token_expires_at' => $approvalExpiresAt->toISOString(),
                'approval_notes' => $approvalNotes !== '' ? $approvalNotes : null,
            ],
        );

        return response()->json([
            'status' => MonitorMfaResetTicket::STATUS_APPROVED,
            'requestId' => $ticket->id,
            'approvalToken' => $approvalToken,
            'approvalTokenExpiresAt' => $approvalExpiresAt->toISOString(),
            'message' => 'MFA reset approved. Share the approval token through a secure channel.',
        ]);
    }

    public function completeMonitorMfaReset(CompleteMonitorMfaResetRequest $request): JsonResponse
    {
        if (! $this->monitorMfaEnabled()) {
            return response()->json(
                ['message' => 'MFA reset is not required for this environment.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $role = UserRoleResolver::MONITOR;
        $login = strtolower(trim($request->string('login')->toString()));
        $password = $request->string('password')->toString();
        $requestId = (int) $request->integer('request_id');
        $approvalToken = $this->normalizeBackupCode($request->string('approval_token')->toString());

        $user = $this->resolveUserForLogin($role, $login);
        if (! $user || ! UserRoleResolver::has($user, $role) || ! Hash::check($password, $user->password)) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_reset.complete.failed',
                'failure',
                $user,
                $role,
                $login,
                ['reason' => 'invalid_credentials'],
            );

            return response()->json(
                ['message' => 'Invalid credentials for the selected role.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (($inactiveResponse = $this->rejectInactiveAccount(
            $request,
            $user,
            $role,
            $login,
            'auth.mfa_reset.complete.failed',
        )) instanceof JsonResponse) {
            return $inactiveResponse;
        }

        if ($approvalToken === null) {
            return response()->json(
                ['message' => 'Approval token format is invalid.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $ticket = MonitorMfaResetTicket::query()
            ->whereKey($requestId)
            ->where('user_id', $user->id)
            ->first();

        if (! $ticket || $ticket->status !== MonitorMfaResetTicket::STATUS_APPROVED) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_reset.complete.failed',
                'failure',
                $user,
                $role,
                $login,
                [
                    'reason' => 'invalid_ticket_state',
                    'mfa_reset_ticket_id' => $requestId,
                ],
            );

            return response()->json(
                ['message' => 'MFA reset request is not approved or no longer valid.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $now = CarbonImmutable::now();
        if (
            $ticket->expires_at === null ||
            $ticket->expires_at->lte($now) ||
            $ticket->approval_token_expires_at === null ||
            $ticket->approval_token_expires_at->lte($now)
        ) {
            $ticket->forceFill([
                'status' => MonitorMfaResetTicket::STATUS_EXPIRED,
                'approval_token_hash' => null,
                'approval_token_expires_at' => null,
            ])->save();

            AuthAuditLogger::record(
                $request,
                'auth.mfa_reset.complete.failed',
                'failure',
                $user,
                $role,
                $login,
                [
                    'reason' => 'approval_token_invalid_or_expired',
                    'mfa_reset_ticket_id' => $ticket->id,
                ],
            );

            return response()->json(
                ['message' => 'Approval token is invalid or expired. Submit a new MFA reset request.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (
            ! is_string($ticket->approval_token_hash) ||
            $ticket->approval_token_hash === '' ||
            ! Hash::check($approvalToken, $ticket->approval_token_hash)
        ) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_reset.complete.failed',
                'failure',
                $user,
                $role,
                $login,
                [
                    'reason' => 'approval_token_invalid',
                    'mfa_reset_ticket_id' => $ticket->id,
                ],
            );

            return response()->json(
                ['message' => 'Approval token is invalid.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $backupCodes = $this->generateAndStoreMonitorBackupCodes($user);
        $ticket->forceFill([
            'status' => MonitorMfaResetTicket::STATUS_COMPLETED,
            'completed_at' => $now,
            'approval_token_hash' => null,
            'approval_token_expires_at' => null,
        ])->save();

        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }

        $tokenPayload = $this->issueDashboardToken($user, $role, true);

        AuthAuditLogger::record(
            $request,
            'auth.mfa_reset.completed',
            'success',
            $user,
            $role,
            $login,
            [
                'mfa_reset_ticket_id' => $ticket->id,
                'backup_codes_generated' => count($backupCodes),
                'token_expires_at' => $tokenPayload['expiresAt'],
                'token_refresh_after' => $tokenPayload['refreshAfter'],
            ],
        );

        return response()->json([
            'token' => $tokenPayload['token'],
            'tokenType' => 'Bearer',
            'expiresAt' => $tokenPayload['expiresAt'],
            'refreshAfter' => $tokenPayload['refreshAfter'],
            'user' => $this->serializeUser($user->fresh('school'), $role),
            'backupCodes' => $backupCodes,
            'message' => 'MFA reset completed. Store your backup codes securely.',
        ]);
    }

    public function refreshToken(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);

        if (! $user) {
            AuthAuditLogger::record(
                $request,
                'auth.token_refresh.failed',
                'failure',
                null,
                null,
                null,
                ['reason' => 'unauthenticated'],
            );

            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $currentToken = $user->currentAccessToken();
        if (! $currentToken) {
            AuthAuditLogger::record(
                $request,
                'auth.token_refresh.failed',
                'failure',
                $user,
                $this->resolveRoleForUser($user),
                $user->email,
                ['reason' => 'bearer_token_required'],
            );

            return response()->json(
                ['message' => 'Token refresh is only available for bearer-token clients.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $role = $this->resolveRoleForUser($user);
        $tokenPayload = $this->issueDashboardToken($user, $role, false);

        // Rotate by revoking the old token immediately after issuing a replacement.
        $currentToken->delete();

        AuthAuditLogger::record(
            $request,
            'auth.token_refresh.success',
            'success',
            $user,
            $role,
            $user->email,
            [
                'token_expires_at' => $tokenPayload['expiresAt'],
                'token_refresh_after' => $tokenPayload['refreshAfter'],
            ],
        );

        return response()->json([
            'token' => $tokenPayload['token'],
            'tokenType' => 'Bearer',
            'expiresAt' => $tokenPayload['expiresAt'],
            'refreshAfter' => $tokenPayload['refreshAfter'],
            'user' => $this->serializeUser($user->fresh('school'), $role),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $user->loadMissing('school');

        $role = UserRoleResolver::has($user, UserRoleResolver::MONITOR)
            ? UserRoleResolver::MONITOR
            : UserRoleResolver::SCHOOL_HEAD;

        return response()->json([
            'user' => $this->serializeUser($user, $role),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $role = null;
        $identifier = null;
        $user = ApiUserResolver::fromRequest($request);
        if ($user) {
            $role = $this->resolveRoleForUser($user);
            $user->loadMissing('school');
            $identifier = $role === UserRoleResolver::SCHOOL_HEAD
                ? (string) $user->school?->school_code
                : $user->email;
            $user->currentAccessToken()?->delete();
        }

        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        AuthAuditLogger::record(
            $request,
            'auth.logout.success',
            'success',
            $user,
            $role,
            $identifier,
            ['session_invalidated' => $request->hasSession()],
        );

        return response()->json([], Response::HTTP_NO_CONTENT);
    }

    private function resolveUserForLogin(string $role, string $login): ?User
    {
        if ($role === UserRoleResolver::SCHOOL_HEAD) {
            $normalizedSchoolCode = $this->normalizeSchoolCode($login);
            if ($normalizedSchoolCode === null) {
                return null;
            }

            $normalizedSchoolCodeKey = strtolower($normalizedSchoolCode);

            return User::query()
                ->with('school')
                ->whereHas('school', function ($builder) use ($normalizedSchoolCodeKey): void {
                    $builder->where('school_code_normalized', $normalizedSchoolCodeKey);
                })
                ->get()
                ->first(
                    fn (User $candidate): bool => UserRoleResolver::has($candidate, UserRoleResolver::SCHOOL_HEAD),
                );
        }

        $normalizedEmail = strtolower(trim($login));
        $query = User::query()
            ->with('school')
            ->where('email_normalized', $normalizedEmail);

        /** @var \Illuminate\Support\Collection<int, User> $candidates */
        $candidates = $query->limit(5)->get();

        return $candidates->first(
            fn (User $candidate): bool => UserRoleResolver::has($candidate, $role),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeUser(User $user, string $role): array
    {
        $status = $user->accountStatus();

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $role,
            'schoolId' => $user->school_id,
            'schoolCode' => $user->school?->school_code,
            'schoolName' => $user->school?->name,
            'mustResetPassword' => (bool) $user->must_reset_password,
            'accountStatus' => $status->value,
        ];
    }

    private function rejectInactiveAccount(
        Request $request,
        User $user,
        string $role,
        string $identifier,
        string $action,
    ): ?JsonResponse {
        if ($user->canAuthenticate()) {
            return null;
        }

        $status = $user->accountStatus();

        AuthAuditLogger::record(
            $request,
            $action,
            'failure',
            $user,
            $role,
            $identifier,
            [
                'reason' => 'account_not_active',
                'account_status' => $status->value,
            ],
        );

        return response()->json(
            ['message' => $this->inactiveAccountMessage($status)],
            Response::HTTP_FORBIDDEN,
        );
    }

    private function inactiveAccountMessage(AccountStatus $status): string
    {
        return match ($status) {
            AccountStatus::SUSPENDED => 'Your account is suspended. Please contact your administrator.',
            AccountStatus::LOCKED => 'Your account is locked. Please contact your administrator.',
            AccountStatus::ARCHIVED => 'Your account is archived and can no longer sign in.',
            default => 'This account is not active.',
        };
    }

    private function normalizeSchoolCode(string $value): ?string
    {
        $normalized = trim($value);

        if (preg_match('/^\d{6}$/', $normalized) !== 1) {
            return null;
        }

        return $normalized;
    }

    /**
     * @return array{token: string, expiresAt: string|null, refreshAfter: string|null}
     */
    private function issueDashboardToken(User $user, string $role, bool $revokeExistingDashboardTokens): array
    {
        $this->purgeExpiredTokens($user);

        if ($revokeExistingDashboardTokens) {
            $user->tokens()
                ->where('name', 'like', $this->dashboardTokenNamePrefix() . '%')
                ->delete();
        }

        $expirationMinutes = $this->tokenExpirationMinutes();
        $expiresAt = $expirationMinutes !== null
            ? CarbonImmutable::now()->addMinutes($expirationMinutes)
            : null;

        $token = $expiresAt !== null
            ? $user->createToken($this->dashboardTokenName($role), ['*'], $expiresAt)->plainTextToken
            : $user->createToken($this->dashboardTokenName($role))->plainTextToken;

        return [
            'token' => $token,
            'expiresAt' => $expiresAt?->toISOString(),
            'refreshAfter' => $this->refreshAfterTimestamp($expiresAt, $expirationMinutes)?->toISOString(),
        ];
    }

    private function purgeExpiredTokens(User $user): void
    {
        $now = CarbonImmutable::now();
        $expirationMinutes = $this->tokenExpirationMinutes();

        $user->tokens()
            ->where(function ($query) use ($now, $expirationMinutes): void {
                $query->where(function ($subQuery) use ($now): void {
                    $subQuery->whereNotNull('expires_at')
                        ->where('expires_at', '<=', $now);
                });

                if ($expirationMinutes !== null) {
                    $query->orWhere('created_at', '<=', $now->subMinutes($expirationMinutes));
                }
            })
            ->delete();
    }

    private function tokenExpirationMinutes(): ?int
    {
        $value = config('sanctum.expiration');

        if (! is_numeric($value)) {
            return null;
        }

        $minutes = (int) $value;

        return $minutes > 0 ? $minutes : null;
    }

    private function refreshAfterTimestamp(?CarbonImmutable $expiresAt, ?int $expirationMinutes): ?CarbonImmutable
    {
        if ($expiresAt === null || $expirationMinutes === null) {
            return null;
        }

        $refreshBefore = max(1, (int) config('sanctum.refresh_before', 5));

        if ($refreshBefore >= $expirationMinutes) {
            return CarbonImmutable::now()->addMinute();
        }

        return $expiresAt->subMinutes($refreshBefore);
    }

    private function dashboardTokenNamePrefix(): string
    {
        return 'cspams-dashboard-';
    }

    private function dashboardTokenName(string $role): string
    {
        return $this->dashboardTokenNamePrefix() . $role . '-' . now()->timestamp;
    }

    /**
     * @return array{challengeId: string, expiresAt: string}
     */
    private function issueMonitorMfaChallenge(User $user, string $login): array
    {
        $challengeId = (string) Str::uuid();
        $ttlMinutes = $this->monitorMfaTtlMinutes();
        $expiresAt = CarbonImmutable::now()->addMinutes($ttlMinutes);
        $testCode = $this->monitorMfaTestCode();
        $code = $testCode !== null
            ? $testCode
            : str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $challenge = [
            'user_id' => (int) $user->id,
            'role' => UserRoleResolver::MONITOR,
            'login' => strtolower(trim($login)),
            'code_hash' => Hash::make($code),
            'attempts' => 0,
            'max_attempts' => $this->monitorMfaMaxAttempts(),
            'expires_at' => $expiresAt->toISOString(),
        ];

        $this->storeMonitorMfaChallenge($challengeId, $challenge);
        $user->notify(new MonitorMfaCodeNotification($code, $expiresAt->toDateTimeString()));

        return [
            'challengeId' => $challengeId,
            'expiresAt' => $expiresAt->toISOString(),
        ];
    }

    /**
     * @param array<string, mixed> $challenge
     */
    private function storeMonitorMfaChallenge(string $challengeId, array $challenge): void
    {
        $expiresAt = $this->parseMfaExpiry($challenge['expires_at'] ?? null);
        $ttlSeconds = max(1, $expiresAt->getTimestamp() - time());

        Cache::put($this->monitorMfaCacheKey($challengeId), $challenge, now()->addSeconds($ttlSeconds));
    }

    /**
     * @return array<string, mixed>|null
     */
    private function readMonitorMfaChallenge(string $challengeId): ?array
    {
        $cached = Cache::get($this->monitorMfaCacheKey($challengeId));
        if (! is_array($cached)) {
            return null;
        }

        return $cached;
    }

    /**
     * @param array<string, mixed> $challenge
     */
    private function monitorMfaChallengeExpired(array $challenge): bool
    {
        return $this->parseMfaExpiry($challenge['expires_at'] ?? null)->lte(CarbonImmutable::now());
    }

    private function monitorMfaCacheKey(string $challengeId): string
    {
        return 'auth:mfa:monitor:' . $challengeId;
    }

    private function monitorMfaEnabled(): bool
    {
        return (bool) config('auth_mfa.monitor.enabled', false);
    }

    private function monitorMfaTtlMinutes(): int
    {
        return max(1, (int) config('auth_mfa.monitor.code_ttl_minutes', 10));
    }

    private function monitorMfaMaxAttempts(): int
    {
        return max(1, (int) config('auth_mfa.monitor.max_attempts', 5));
    }

    private function monitorMfaTestCode(): ?string
    {
        $configured = trim((string) config('auth_mfa.monitor.test_code', ''));
        if ($configured === '') {
            return null;
        }

        return preg_match('/^\d{6}$/', $configured) === 1 ? $configured : null;
    }

    private function parseMfaExpiry(mixed $value): CarbonImmutable
    {
        if (is_string($value) && trim($value) !== '') {
            try {
                return CarbonImmutable::parse($value);
            } catch (\Throwable) {
                // Fall through to default expiry.
            }
        }

        return CarbonImmutable::now()->addMinutes($this->monitorMfaTtlMinutes());
    }

    /**
     * @return list<string>
     */
    private function generateAndStoreMonitorBackupCodes(User $user): array
    {
        $codes = [];
        $hashes = [];

        for ($index = 0; $index < $this->monitorMfaBackupCodesCount(); $index++) {
            $raw = strtoupper(Str::random(8));
            $code = substr($raw, 0, 4) . '-' . substr($raw, 4, 4);
            $normalizedCode = $this->normalizeBackupCode($code);
            if ($normalizedCode === null) {
                continue;
            }

            $codes[] = $normalizedCode;
            $hashes[] = Hash::make($normalizedCode);
        }

        $user->forceFill([
            'mfa_backup_codes' => $hashes,
            'mfa_backup_codes_generated_at' => now(),
        ])->save();

        return $codes;
    }

    private function consumeMonitorBackupCode(User $user, string $normalizedCode): bool
    {
        $stored = $user->mfa_backup_codes;
        if (! is_array($stored) || $stored === []) {
            return false;
        }

        foreach ($stored as $index => $hash) {
            if (! is_string($hash) || $hash === '') {
                continue;
            }

            if (! Hash::check($normalizedCode, $hash)) {
                continue;
            }

            unset($stored[$index]);

            $user->forceFill([
                'mfa_backup_codes' => array_values($stored),
            ])->save();

            return true;
        }

        return false;
    }

    private function monitorBackupCodeCount(User $user): int
    {
        $stored = $user->mfa_backup_codes;
        if (! is_array($stored)) {
            return 0;
        }

        return count(array_filter($stored, static fn (mixed $item): bool => is_string($item) && $item !== ''));
    }

    private function normalizeBackupCode(string $value): ?string
    {
        $compact = preg_replace('/[^a-zA-Z0-9]/', '', strtoupper(trim($value)));
        if (! is_string($compact) || strlen($compact) !== 8) {
            return null;
        }

        return substr($compact, 0, 4) . '-' . substr($compact, 4, 4);
    }

    private function monitorMfaBackupCodesCount(): int
    {
        return max(4, (int) config('auth_mfa.monitor.backup_codes_count', 8));
    }

    private function monitorMfaResetRequestTtlMinutes(): int
    {
        return max(5, (int) config('auth_mfa.monitor.reset_request_ttl_minutes', 1440));
    }

    private function monitorMfaResetApprovalTtlMinutes(): int
    {
        return max(1, (int) config('auth_mfa.monitor.reset_approval_ttl_minutes', 60));
    }

    private function monitorMfaResetTestApprovalToken(): ?string
    {
        $configured = trim((string) config('auth_mfa.monitor.reset_test_approval_token', ''));
        if ($configured === '') {
            return null;
        }

        return $this->normalizeBackupCode($configured);
    }

    private function monitorMfaResetApprovalToken(): string
    {
        $configured = $this->monitorMfaResetTestApprovalToken();
        if ($configured !== null) {
            return $configured;
        }

        $raw = strtoupper(Str::random(8));

        return substr($raw, 0, 4) . '-' . substr($raw, 4, 4);
    }

    private function expireOpenMonitorMfaResetTickets(int $userId): void
    {
        MonitorMfaResetTicket::query()
            ->where('user_id', $userId)
            ->whereIn('status', [
                MonitorMfaResetTicket::STATUS_PENDING,
                MonitorMfaResetTicket::STATUS_APPROVED,
            ])
            ->update([
                'status' => MonitorMfaResetTicket::STATUS_EXPIRED,
                'updated_at' => now(),
            ]);
    }

    private function resolveRoleForUser(User $user): string
    {
        $currentToken = $user->currentAccessToken();
        if ($currentToken instanceof PersonalAccessToken) {
            foreach ($currentToken->abilities as $ability) {
                if ($ability === 'role:' . UserRoleResolver::MONITOR) {
                    return UserRoleResolver::MONITOR;
                }

                if ($ability === 'role:' . UserRoleResolver::SCHOOL_HEAD) {
                    return UserRoleResolver::SCHOOL_HEAD;
                }
            }
        }

        return UserRoleResolver::has($user, UserRoleResolver::MONITOR)
            ? UserRoleResolver::MONITOR
            : UserRoleResolver::SCHOOL_HEAD;
    }
}
