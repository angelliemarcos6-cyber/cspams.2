<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\ApproveMonitorMfaResetRequest;
use App\Http\Requests\Api\CompleteMonitorMfaResetRequest;
use App\Http\Requests\Api\CompleteAccountSetupRequest;
use App\Http\Requests\Api\ForgotPasswordRequest;
use App\Http\Requests\Api\LoginRequest;
use App\Http\Requests\Api\RegenerateMonitorMfaBackupCodesRequest;
use App\Http\Requests\Api\RequestMonitorMfaResetRequest;
use App\Http\Requests\Api\ResetPasswordRequest;
use App\Http\Requests\Api\ResetRequiredPasswordRequest;
use App\Http\Requests\Api\VerifyMonitorMfaRequest;
use App\Models\AccountSetupToken;
use App\Models\MonitorMfaResetTicket;
use App\Models\User;
use App\Notifications\MonitorMfaCodeNotification;
use App\Notifications\MonitorMfaResetApprovedNotification;
use App\Notifications\MonitorPasswordResetNotification;
use App\Notifications\SchoolHeadPasswordResetNotification;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\SchoolHeadAccountSetupService;
use App\Support\Auth\UserRoleResolver;
use App\Support\Audit\AuthAuditLogger;
use App\Support\Domain\AccountStatus;
use App\Support\Mail\MailDelivery;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\NewAccessToken;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class AuthController extends Controller
{
    public function __construct(
        private readonly SchoolHeadAccountSetupService $schoolHeadAccountSetupService,
    ) {
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $role = UserRoleResolver::normalizeLoginRole($request->string('role')->toString());
        $rawLogin = trim($request->string('login')->toString());
        $login = $role === UserRoleResolver::SCHOOL_HEAD
            ? (string) $this->normalizeSchoolCode($rawLogin)
            : $rawLogin;
        $password = $request->string('password')->toString();

        $user = $this->resolveUserForLogin($role, $login);

        if (! $user || ! Hash::check($password, $user->password)) {
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

        if ($user->must_reset_password && $this->enforceRequiredPasswordResetOnLogin()) {
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
            try {
                $mfaChallenge = $this->issueMonitorMfaChallenge($user, $login);
            } catch (\Throwable $exception) {
                report($exception);

                AuthAuditLogger::record(
                    $request,
                    'auth.login.mfa_challenge_failed',
                    'failure',
                    $user,
                    $role,
                    $login,
                    ['reason' => 'mfa_delivery_failed'],
                );

                return response()->json(
                    ['message' => 'Unable to send verification code. Please try again or contact your administrator.'],
                    Response::HTTP_SERVICE_UNAVAILABLE,
                );
            }

            $deliveryStatus = 'sent';
            $deliveryMessage = 'A verification code was sent to your email.';
            if (MailDelivery::isSimulated()) {
                $deliveryStatus = MailDelivery::simulatedStatus();
                $deliveryMessage = MailDelivery::simulatedMessage('Verification code was generated, but will not reach real inboxes.');
            }

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
                    'delivery_status' => $deliveryStatus,
                ],
            );

            return response()->json(
                [
                    'requiresMfa' => true,
                    'mfa' => [
                        'challengeId' => $mfaChallenge['challengeId'],
                        'expiresAt' => $mfaChallenge['expiresAt'],
                    ],
                    'delivery' => $deliveryStatus,
                    'deliveryMessage' => $deliveryMessage,
                    'message' => $deliveryMessage,
                ],
                Response::HTTP_ACCEPTED,
            );
        }

        $suspiciousLoginContainment = $this->containSuspiciousLogin(
            $request,
            $user,
            $role,
            $login,
            'auth.login.suspicious_detected',
        );

        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }

        // Keep bearer token response for backward-compatible non-SPA clients.
        $tokenPayload = $this->issueDashboardToken($user, $role, $request, false);
        $this->recordSuccessfulLoginTelemetry($user, $request);

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
                'suspicious_login_contained' => $suspiciousLoginContainment['suspicious'],
                'revoked_tokens' => $suspiciousLoginContainment['revokedTokens'],
                'revoked_web_sessions' => $suspiciousLoginContainment['revokedWebSessions'],
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

        if (! $user || ! Hash::check($currentPassword, $user->password)) {
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

        $revocationSummary = $this->revokeUserSessionsAndTokens($user);
        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }
        $tokenPayload = $this->issueDashboardToken($user, $role, $request, false);
        $this->recordSuccessfulLoginTelemetry($user, $request);

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
                'revoked_tokens' => $revocationSummary['revokedTokens'],
                'revoked_web_sessions' => $revocationSummary['revokedWebSessions'],
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

    public function forgotPassword(ForgotPasswordRequest $request): JsonResponse
    {
        $roleHint = strtolower(trim($request->string('role')->toString()));
        if (! in_array($roleHint, [UserRoleResolver::MONITOR, UserRoleResolver::SCHOOL_HEAD], true)) {
            $roleHint = null;
        }
        $email = strtolower(trim($request->string('email')->toString()));

        $payload = [
            'message' => 'If a matching account exists, a password reset link will be sent to the provided email address.',
        ];

        if (MailDelivery::isSimulated()) {
            $payload['delivery'] = MailDelivery::simulatedStatus();
            $payload['deliveryMessage'] = MailDelivery::simulatedMessage('Password reset link was requested.');
        }

        $user = User::query()
            ->where('email_normalized', $email)
            ->first();

        $role = $this->resolvePasswordResetRoleForUser($user, $roleHint);

        if (! $user || $role === null) {
            AuthAuditLogger::record(
                $request,
                'auth.forgot_password.requested',
                'success',
                $user,
                $roleHint,
                $email,
                ['result' => 'ignored'],
            );

            return response()->json($payload, Response::HTTP_ACCEPTED);
        }

        if (! $user->canAuthenticate()) {
            $status = $user->accountStatus();

            AuthAuditLogger::record(
                $request,
                'auth.forgot_password.requested',
                'failure',
                $user,
                $role,
                $email,
                [
                    'reason' => 'account_not_active',
                    'account_status' => $status->value,
                ],
            );

            return response()->json($payload, Response::HTTP_ACCEPTED);
        }

        $expiresAt = CarbonImmutable::now()->addMinutes((int) config('auth.passwords.users.expire', 60));

        try {
            $status = Password::broker()->sendResetLink(
                ['email' => (string) $user->email],
                function (User $user, string $token) use ($expiresAt, $role): void {
                    $resetUrl = $this->buildPasswordResetUrl((string) $user->email, $token, $role);

                    $user->notify(
                        $role === UserRoleResolver::SCHOOL_HEAD
                            ? new SchoolHeadPasswordResetNotification($resetUrl, $expiresAt)
                            : new MonitorPasswordResetNotification($resetUrl, $expiresAt),
                    );
                },
            );

            AuthAuditLogger::record(
                $request,
                'auth.forgot_password.requested',
                $status === Password::RESET_LINK_SENT ? 'success' : 'failure',
                $user,
                $role,
                $email,
                [
                    'broker_status' => $status,
                ],
            );
        } catch (\Throwable $exception) {
            AuthAuditLogger::record(
                $request,
                'auth.forgot_password.requested',
                'failure',
                $user,
                $role,
                $email,
                [
                    'reason' => 'email_delivery_failed',
                    'error' => $exception->getMessage(),
                ],
            );

            if ((bool) config('app.debug', false)) {
                $payload['delivery'] = 'failed';
                $payload['deliveryMessage'] = 'Password reset email delivery failed. Check server logs and mail configuration.';
            }
        }

        return response()->json($payload, Response::HTTP_ACCEPTED);
    }

    public function resetPassword(ResetPasswordRequest $request): JsonResponse
    {
        $roleHint = strtolower(trim($request->string('role')->toString()));
        if (! in_array($roleHint, [UserRoleResolver::MONITOR, UserRoleResolver::SCHOOL_HEAD], true)) {
            $roleHint = null;
        }
        $email = strtolower(trim($request->string('email')->toString()));
        $token = $request->string('token')->toString();
        $newPassword = $request->string('password')->toString();
        $confirmPassword = $request->string('password_confirmation')->toString();

        $user = User::query()
            ->where('email_normalized', $email)
            ->first();

        $role = $this->resolvePasswordResetRoleForUser($user, $roleHint);

        if (! $user || $role === null) {
            AuthAuditLogger::record(
                $request,
                'auth.reset_password.failed',
                'failure',
                $user,
                $roleHint,
                $email,
                ['reason' => 'invalid_user'],
            );

            return response()->json(
                ['message' => 'This password reset link is invalid or expired.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (! $user->canAuthenticate() && ! $user->must_reset_password) {
            if (($inactiveResponse = $this->rejectInactiveAccount(
                $request,
                $user,
                $role,
                $email,
                'auth.reset_password.failed',
            )) instanceof JsonResponse) {
                return $inactiveResponse;
            }
        }

        $revocationSummary = ['revokedTokens' => 0, 'revokedWebSessions' => 0];

        $status = Password::broker()->reset(
            [
                'email' => (string) $user->email,
                'token' => $token,
                'password' => $newPassword,
                'password_confirmation' => $confirmPassword,
            ],
            function (User $user, string $password) use (&$revocationSummary): void {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'must_reset_password' => false,
                    'password_changed_at' => now(),
                    'email_verified_at' => $user->email_verified_at ?? now(),
                ]);

                $user->setRememberToken(Str::random(60));
                $user->save();

                event(new PasswordReset($user));
                $revocationSummary = $this->revokeUserSessionsAndTokens($user);
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            AuthAuditLogger::record(
                $request,
                'auth.reset_password.failed',
                'failure',
                $user,
                $role,
                $email,
                [
                    'reason' => 'invalid_or_expired_token',
                    'broker_status' => $status,
                ],
            );

            return response()->json(
                ['message' => 'This password reset link is invalid or expired.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        AuthAuditLogger::record(
            $request,
            'auth.reset_password.completed',
            'success',
            $user,
            $role,
            $email,
            [
                'revoked_tokens' => $revocationSummary['revokedTokens'],
                'revoked_web_sessions' => $revocationSummary['revokedWebSessions'],
            ],
        );

        return response()->json([
            'message' => 'Password reset successfully. Please sign in with your new password.',
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

        if (! $user) {
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

        $suspiciousLoginContainment = $this->containSuspiciousLogin(
            $request,
            $user,
            $role,
            $login,
            'auth.mfa_verify.suspicious_detected',
        );

        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }

        $tokenPayload = $this->issueDashboardToken($user, $role, $request, false);
        $this->recordSuccessfulLoginTelemetry($user, $request);

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
                'suspicious_login_contained' => $suspiciousLoginContainment['suspicious'],
                'revoked_tokens' => $suspiciousLoginContainment['revokedTokens'],
                'revoked_web_sessions' => $suspiciousLoginContainment['revokedWebSessions'],
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

    public function completeAccountSetup(CompleteAccountSetupRequest $request): JsonResponse
    {
        $plainToken = trim($request->string('token')->toString());
        $newPassword = $request->string('password')->toString();
        $role = UserRoleResolver::SCHOOL_HEAD;

        if (! $this->schoolHeadAccountSetupService->storageAvailable()) {
            AuthAuditLogger::record(
                $request,
                'auth.account_setup.failed',
                'failure',
                null,
                $role,
                null,
                ['reason' => 'setup_token_storage_unavailable'],
            );

            return response()->json(
                ['message' => 'Account setup token storage is unavailable. Run database migrations first.'],
                Response::HTTP_SERVICE_UNAVAILABLE,
            );
        }

        $setupToken = $this->schoolHeadAccountSetupService->resolve($plainToken);
        if (! $setupToken) {
            AuthAuditLogger::record(
                $request,
                'auth.account_setup.failed',
                'failure',
                null,
                $role,
                null,
                ['reason' => 'invalid_or_expired_setup_token'],
            );

            return response()->json(
                ['message' => 'The setup link is invalid or expired. Request a new link from your Division Monitor.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $user = $setupToken->user()->with('school')->first();
        if (! $user || ! UserRoleResolver::has($user, $role)) {
            AuthAuditLogger::record(
                $request,
                'auth.account_setup.failed',
                'failure',
                $user,
                $role,
                null,
                ['reason' => 'account_not_supported'],
            );

            return response()->json(
                ['message' => 'This setup link is no longer valid for account activation.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $identifier = (string) ($user->school?->school_code ?? '');
        $status = $user->accountStatus();
        if (in_array($status, [AccountStatus::SUSPENDED, AccountStatus::LOCKED, AccountStatus::ARCHIVED], true)) {
            AuthAuditLogger::record(
                $request,
                'auth.account_setup.failed',
                'failure',
                $user,
                $role,
                $identifier !== '' ? $identifier : null,
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

        if (Hash::check($newPassword, $user->password)) {
            AuthAuditLogger::record(
                $request,
                'auth.account_setup.failed',
                'failure',
                $user,
                $role,
                $identifier !== '' ? $identifier : null,
                ['reason' => 'password_reuse_blocked'],
            );

            return response()->json(
                ['message' => 'New password must be different from the current password.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $previousStatus = $status->value;

        $tokenParts = explode('.', $plainToken, 2);
        $tokenSecret = isset($tokenParts[1]) ? trim((string) $tokenParts[1]) : '';

        $revocationSummary = DB::transaction(function () use (
            $setupToken,
            $tokenSecret,
            $user,
            $newPassword,
            $request,
        ): ?array {
            /** @var AccountSetupToken|null $lockedToken */
            $lockedToken = AccountSetupToken::query()
                ->whereKey($setupToken->id)
                ->lockForUpdate()
                ->first();

            if (
                ! $lockedToken ||
                ! is_string($lockedToken->token_hash) ||
                $lockedToken->token_hash === '' ||
                $tokenSecret === '' ||
                ! Hash::check($tokenSecret, $lockedToken->token_hash) ||
                ! $lockedToken->isUsable()
            ) {
                return null;
            }

            $this->schoolHeadAccountSetupService->consume($lockedToken, $request->ip(), $request->userAgent());

            $user->forceFill([
                'password' => Hash::make($newPassword),
                'must_reset_password' => false,
                'password_changed_at' => now(),
                'email_verified_at' => now(),
                'account_status' => AccountStatus::ACTIVE->value,
            ])->save();

            return $this->revokeUserSessionsAndTokens($user);
        });

        if (! is_array($revocationSummary)) {
            AuthAuditLogger::record(
                $request,
                'auth.account_setup.failed',
                'failure',
                $user,
                $role,
                $identifier !== '' ? $identifier : null,
                ['reason' => 'invalid_or_expired_setup_token'],
            );

            return response()->json(
                ['message' => 'The setup link is invalid or expired. Request a new link from your Division Monitor.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }

        $tokenPayload = $this->issueDashboardToken($user, $role, $request, false);
        $this->recordSuccessfulLoginTelemetry($user, $request);

        AuthAuditLogger::record(
            $request,
            'auth.account_setup.completed',
            'success',
            $user,
            $role,
            $identifier !== '' ? $identifier : null,
            [
                'previous_account_status' => $previousStatus,
                'new_account_status' => AccountStatus::ACTIVE->value,
                'token_expires_at' => $tokenPayload['expiresAt'],
                'token_refresh_after' => $tokenPayload['refreshAfter'],
                'revoked_tokens' => $revocationSummary['revokedTokens'],
                'revoked_web_sessions' => $revocationSummary['revokedWebSessions'],
            ],
        );

        return response()->json([
            'token' => $tokenPayload['token'],
            'tokenType' => 'Bearer',
            'expiresAt' => $tokenPayload['expiresAt'],
            'refreshAfter' => $tokenPayload['refreshAfter'],
            'user' => $this->serializeUser($user->fresh('school'), $role),
            'message' => 'Account setup completed successfully.',
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

        if (! $this->monitorMfaResetStorageAvailable()) {
            return $this->monitorMfaResetStorageUnavailableResponse(
                $request,
                'auth.mfa_reset.request.failed',
            );
        }

        $role = UserRoleResolver::MONITOR;
        $login = strtolower(trim($request->string('login')->toString()));
        $password = $request->string('password')->toString();
        $reason = trim($request->string('reason')->toString());

        $user = $this->resolveUserForLogin($role, $login);
        if (! $user || ! Hash::check($password, $user->password)) {
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
            'requested_by_user_id' => $user->id,
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

        if (! $this->monitorMfaResetStorageAvailable()) {
            return $this->monitorMfaResetStorageUnavailableResponse(
                $request,
                'auth.mfa_reset.requests.failed',
                $actor,
                $actor->email,
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
        string $ticket,
    ): JsonResponse {
        $ticketId = ctype_digit(trim($ticket)) ? (int) trim($ticket) : 0;
        if ($ticketId <= 0) {
            return response()->json(
                ['message' => 'MFA reset request identifier is invalid.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $actor = ApiUserResolver::fromRequest($request);
        if (! $actor) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! $this->monitorMfaResetStorageAvailable()) {
            return $this->monitorMfaResetStorageUnavailableResponse(
                $request,
                'auth.mfa_reset.approve.failed',
                $actor,
                $actor->email,
            );
        }

        $ticketModel = MonitorMfaResetTicket::query()->find($ticketId);
        if (! $ticketModel) {
            return response()->json(
                ['message' => 'MFA reset request was not found.'],
                Response::HTTP_NOT_FOUND,
            );
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
                    'mfa_reset_ticket_id' => $ticketModel->id,
                ],
            );

            return response()->json(
                ['message' => 'Only division monitor accounts can approve MFA reset requests.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $targetUser = $ticketModel->user()->first();
        if (! $targetUser || ! UserRoleResolver::has($targetUser, UserRoleResolver::MONITOR)) {
            return response()->json(
                ['message' => 'MFA reset approval is only supported for division monitor accounts.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if ((int) $actor->id === (int) $targetUser->id) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_reset.approve.failed',
                'failure',
                $actor,
                UserRoleResolver::MONITOR,
                $actor->email,
                [
                    'reason' => 'self_approval_disallowed',
                    'mfa_reset_ticket_id' => $ticketModel->id,
                    'target_user_id' => $targetUser->id,
                ],
            );

            return response()->json(
                ['message' => 'You cannot approve your own MFA reset request. Ask a different monitor to approve it.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $now = CarbonImmutable::now();
        if (
            $ticketModel->status !== MonitorMfaResetTicket::STATUS_PENDING ||
            $ticketModel->expires_at === null ||
            $ticketModel->expires_at->lte($now)
        ) {
            return response()->json(
                ['message' => 'MFA reset request is no longer pending approval.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $approvalToken = $this->monitorMfaResetApprovalToken();
        $approvalExpiresAt = $now->addMinutes($this->monitorMfaResetApprovalTtlMinutes());
        $approvalNotes = trim($request->string('notes')->toString());

        $ticketModel->forceFill([
            'status' => MonitorMfaResetTicket::STATUS_APPROVED,
            'approved_by_user_id' => $actor->id,
            'approved_at' => $now,
            'approval_token_hash' => Hash::make($approvalToken),
            'approval_token_expires_at' => $approvalExpiresAt,
        ])->save();

        $deliveryStatus = 'sent';
        $deliveryMessage = 'Approval token sent to the requester email.';

        if (MailDelivery::isSimulated()) {
            $deliveryStatus = MailDelivery::simulatedStatus();
            $deliveryMessage = MailDelivery::simulatedMessage('Approval token was generated, but will not reach real inboxes.');
        }

        $exposeApprovalToken = $this->shouldExposeOneTimeSecrets();

        try {
            $targetUser->notify(
                new MonitorMfaResetApprovedNotification($approvalToken, $approvalExpiresAt->toDateTimeString()),
            );
        } catch (\Throwable $exception) {
            report($exception);
            $deliveryStatus = 'failed';
            $deliveryMessage = $exposeApprovalToken
                ? 'Email delivery failed. Share the approval token through a secure channel.'
                : 'Email delivery failed. Ask the requester to submit a new request or contact an administrator.';
        }

        AuthAuditLogger::record(
            $request,
            'auth.mfa_reset.approved',
            'success',
            $actor,
            UserRoleResolver::MONITOR,
            $targetUser->email,
            [
                'mfa_reset_ticket_id' => $ticketModel->id,
                'target_user_id' => $targetUser->id,
                'approval_token_expires_at' => $approvalExpiresAt->toISOString(),
                'approval_notes' => $approvalNotes !== '' ? $approvalNotes : null,
                'delivery_status' => $deliveryStatus,
                'delivery_message' => $deliveryMessage,
            ],
        );

        $message = $deliveryStatus === 'failed'
            ? ($exposeApprovalToken
                ? 'MFA reset approved. Email delivery failed. Share the approval token through a secure channel.'
                : 'MFA reset approved, but email delivery failed. Ask the requester to submit a new request or contact an administrator.')
            : ($exposeApprovalToken
                ? 'MFA reset approved. Share the approval token through a secure channel.'
                : 'MFA reset approved. Approval token sent to the requester email.');

        return response()->json([
            'status' => MonitorMfaResetTicket::STATUS_APPROVED,
            'requestId' => $ticketModel->id,
            'approvalToken' => $exposeApprovalToken ? $approvalToken : null,
            'approvalTokenExpiresAt' => $approvalExpiresAt->toISOString(),
            'delivery' => $deliveryStatus,
            'deliveryMessage' => $deliveryMessage,
            'message' => $message,
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

        if (! $this->monitorMfaResetStorageAvailable()) {
            return $this->monitorMfaResetStorageUnavailableResponse(
                $request,
                'auth.mfa_reset.complete.failed',
            );
        }

        $role = UserRoleResolver::MONITOR;
        $login = strtolower(trim($request->string('login')->toString()));
        $password = $request->string('password')->toString();
        $requestId = (int) $request->integer('request_id');
        $approvalToken = $this->normalizeBackupCode($request->string('approval_token')->toString());

        $user = $this->resolveUserForLogin($role, $login);
        if (! $user || ! Hash::check($password, $user->password)) {
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

        $suspiciousLoginDetected = $this->isSuspiciousLoginAttempt($request, $user);
        $revocationSummary = $this->revokeUserSessionsAndTokens($user);

        if ($suspiciousLoginDetected) {
            AuthAuditLogger::record(
                $request,
                'auth.mfa_reset.complete.suspicious_detected',
                'challenge',
                $user,
                $role,
                $login,
                [
                    'reason' => 'new_device_or_location_detected',
                    'previous_ip' => $this->normalizeIpAddress($user->last_login_ip),
                    'current_ip' => $this->normalizeIpAddress($request->ip()),
                    'revoked_tokens' => $revocationSummary['revokedTokens'],
                    'revoked_web_sessions' => $revocationSummary['revokedWebSessions'],
                ],
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

        $tokenPayload = $this->issueDashboardToken($user, $role, $request, false);
        $this->recordSuccessfulLoginTelemetry($user, $request);

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
                'suspicious_login_detected' => $suspiciousLoginDetected,
                'revoked_tokens' => $revocationSummary['revokedTokens'],
                'revoked_web_sessions' => $revocationSummary['revokedWebSessions'],
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
        if (! $currentToken instanceof PersonalAccessToken) {
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

        if (! $user->canAuthenticate()) {
            $currentToken->delete();

            AuthAuditLogger::record(
                $request,
                'auth.token_refresh.failed',
                'failure',
                $user,
                $this->resolveRoleForUser($user),
                $user->email,
                [
                    'reason' => 'account_not_active',
                    'account_status' => $user->accountStatus()->value,
                ],
            );

            return response()->json(
                ['message' => 'This account is not active.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $role = $this->resolveRoleForUser($user);
        $tokenPayload = $this->issueDashboardToken($user, $role, $request, false);

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

    public function activeSessions(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $this->purgeExpiredTokens($user);

        $currentTokenId = $user->currentAccessToken()?->id;
        $currentSessionId = $request->hasSession() ? $request->session()->getId() : null;

        $tokenEntries = $user->tokens()
            ->orderByDesc('last_used_at')
            ->orderByDesc('created_at')
            ->limit(100)
            ->get()
            ->map(function (PersonalAccessToken $token) use ($currentTokenId): array {
                $derivedExpiry = $this->derivedTokenExpiryTimestamp($token);
                $expiresAt = $token->expires_at?->toISOString() ?? $derivedExpiry?->toISOString();

                return [
                    'id' => 'pat_' . $token->id,
                    'sessionType' => 'api_token',
                    'deviceLabel' => trim((string) $token->name) !== '' ? (string) $token->name : 'API token',
                    'ipAddress' => $this->normalizeIpAddress($token->ip_address ?? null),
                    'userAgent' => $this->normalizeUserAgentString($token->user_agent ?? null),
                    'createdAt' => $token->created_at?->toISOString(),
                    'lastActiveAt' => $token->last_used_at?->toISOString() ?? $token->created_at?->toISOString(),
                    'expiresAt' => $expiresAt,
                    'isCurrent' => $currentTokenId !== null && (int) $token->id === (int) $currentTokenId,
                ];
            })
            ->values()
            ->all();

        $webSessionEntries = $this->activeWebSessionEntries($user, $request, $currentSessionId);
        $sessions = array_merge($tokenEntries, $webSessionEntries);

        usort(
            $sessions,
            static function (array $left, array $right): int {
                $leftTimestamp = strtotime((string) ($left['lastActiveAt'] ?? $left['createdAt'] ?? '')) ?: 0;
                $rightTimestamp = strtotime((string) ($right['lastActiveAt'] ?? $right['createdAt'] ?? '')) ?: 0;

                return $rightTimestamp <=> $leftTimestamp;
            },
        );

        return response()->json([
            'data' => $sessions,
            'meta' => [
                'total' => count($sessions),
                'currentTokenId' => $currentTokenId !== null ? 'pat_' . $currentTokenId : null,
                'currentSessionId' => $currentSessionId !== null ? 'web_' . $currentSessionId : null,
            ],
        ]);
    }

    public function revokeSessionDevice(Request $request, string $session): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $identifier = trim($session);
        if (str_starts_with($identifier, 'pat_')) {
            $tokenId = (int) substr($identifier, 4);
            if ($tokenId <= 0) {
                return response()->json(['message' => 'Session identifier is invalid.'], Response::HTTP_UNPROCESSABLE_ENTITY);
            }

            /** @var PersonalAccessToken|null $token */
            $token = $user->tokens()->whereKey($tokenId)->first();
            if (! $token) {
                return response()->json(['message' => 'Session/device not found.'], Response::HTTP_NOT_FOUND);
            }

            $isCurrentToken = (int) ($user->currentAccessToken()?->id ?? 0) === (int) $token->id;
            $token->delete();

            if ($isCurrentToken && ! $this->isBearerAuthenticatedRequest($request)) {
                Auth::guard('web')->logout();
                if ($request->hasSession()) {
                    $request->session()->invalidate();
                    $request->session()->regenerateToken();
                }
            }

            AuthAuditLogger::record(
                $request,
                'auth.session.revoked',
                'success',
                $user,
                $this->resolveRoleForUser($user),
                $user->email,
                [
                    'session_type' => 'api_token',
                    'session_id' => $identifier,
                    'is_current' => $isCurrentToken,
                ],
            );

            return response()->json([], Response::HTTP_NO_CONTENT);
        }

        if (str_starts_with($identifier, 'web_')) {
            if (! Schema::hasTable('sessions')) {
                return response()->json(
                    ['message' => 'Session storage is not configured for device revocation.'],
                    Response::HTTP_UNPROCESSABLE_ENTITY,
                );
            }

            $sessionId = trim(substr($identifier, 4));
            if ($sessionId === '') {
                return response()->json(['message' => 'Session identifier is invalid.'], Response::HTTP_UNPROCESSABLE_ENTITY);
            }

            $deleted = DB::table('sessions')
                ->where('id', $sessionId)
                ->where('user_id', $user->id)
                ->delete();

            if ($deleted < 1) {
                return response()->json(['message' => 'Session/device not found.'], Response::HTTP_NOT_FOUND);
            }

            $currentSessionId = $request->hasSession() ? $request->session()->getId() : null;
            $isCurrentSession = is_string($currentSessionId) && $currentSessionId === $sessionId;
            if ($isCurrentSession) {
                Auth::guard('web')->logout();
                if ($request->hasSession()) {
                    $request->session()->invalidate();
                    $request->session()->regenerateToken();
                }
            }

            AuthAuditLogger::record(
                $request,
                'auth.session.revoked',
                'success',
                $user,
                $this->resolveRoleForUser($user),
                $user->email,
                [
                    'session_type' => 'web_session',
                    'session_id' => $identifier,
                    'is_current' => $isCurrentSession,
                ],
            );

            return response()->json([], Response::HTTP_NO_CONTENT);
        }

        return response()->json(['message' => 'Session identifier is invalid.'], Response::HTTP_UNPROCESSABLE_ENTITY);
    }

    public function revokeOtherSessions(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $currentTokenId = $user->currentAccessToken()?->id;
        $currentSessionId = $request->hasSession() ? $request->session()->getId() : null;
        $summary = $this->revokeUserSessionsAndTokens($user, $currentTokenId, $currentSessionId);

        AuthAuditLogger::record(
            $request,
            'auth.session.revoke_others',
            'success',
            $user,
            $this->resolveRoleForUser($user),
            $user->email,
            [
                'revoked_tokens' => $summary['revokedTokens'],
                'revoked_web_sessions' => $summary['revokedWebSessions'],
                'kept_current_token' => $currentTokenId !== null,
                'kept_current_session' => $currentSessionId !== null,
            ],
        );

        return response()->json([
            'data' => [
                'revokedTokenCount' => $summary['revokedTokens'],
                'revokedWebSessionCount' => $summary['revokedWebSessions'],
            ],
            'message' => 'Other active sessions were revoked.',
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
            $this->revokeCurrentPersonalAccessToken($user);
        }

        $invalidatedWebSession = false;
        if (! $this->isBearerAuthenticatedRequest($request)) {
            Auth::guard('web')->logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }
            $invalidatedWebSession = true;
        }

        AuthAuditLogger::record(
            $request,
            'auth.logout.success',
            'success',
            $user,
            $role,
            $identifier,
            ['session_invalidated' => $invalidatedWebSession],
        );

        return response()->json([], Response::HTTP_NO_CONTENT);
    }

    private function isBearerAuthenticatedRequest(Request $request): bool
    {
        return trim((string) $request->bearerToken()) !== '';
    }

    private function resolveUserForLogin(string $role, string $login): ?User
    {
        if ($role === UserRoleResolver::SCHOOL_HEAD) {
            $normalizedSchoolCode = $this->normalizeSchoolCode($login);
            if ($normalizedSchoolCode === null) {
                return null;
            }

            $normalizedSchoolCodeKey = strtolower($normalizedSchoolCode);

            $baseQuery = User::query()
                ->select([
                    'id',
                    'name',
                    'email',
                    'email_verified_at',
                    'password',
                    'must_reset_password',
                    'password_changed_at',
                    'account_status',
                    'school_id',
                    'last_login_at',
                    'last_login_ip',
                    'last_login_user_agent',
                ])
                ->with(['school:id,school_code,name'])
                ->whereHas('school', function ($builder) use ($normalizedSchoolCodeKey): void {
                    $builder->where('school_code_normalized', $normalizedSchoolCodeKey);
                })
                ->orderByDesc('id');

            if (Schema::hasColumn('users', 'account_type')) {
                /** @var User|null $accountTypeMatch */
                $accountTypeMatch = (clone $baseQuery)
                    ->where('account_type', UserRoleResolver::SCHOOL_HEAD)
                    ->first();

                if ($accountTypeMatch) {
                    return $accountTypeMatch;
                }
            }

            $roleAliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);

            return $baseQuery
                ->whereHas('roles', function ($builder) use ($roleAliases): void {
                    $builder->whereIn('name', $roleAliases);
                })
                ->first();
        }

        $normalizedEmail = strtolower(trim($login));
        $roleAliases = UserRoleResolver::roleAliases(UserRoleResolver::MONITOR);

        return User::query()
            ->select([
                'id',
                'name',
                'email',
                'email_verified_at',
                'mfa_backup_codes',
                'mfa_backup_codes_generated_at',
                'password',
                'must_reset_password',
                'password_changed_at',
                'account_status',
                'school_id',
                'last_login_at',
                'last_login_ip',
                'last_login_user_agent',
            ])
            ->with(['school:id,school_code,name'])
            ->where('email_normalized', $normalizedEmail)
            ->whereHas('roles', function ($builder) use ($roleAliases): void {
                $builder->whereIn('name', $roleAliases);
            })
            ->orderByDesc('id')
            ->first();
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
            'lastLoginAt' => $user->last_login_at?->toISOString(),
        ];
    }

    /**
     * @return array{suspicious: bool, revokedTokens: int, revokedWebSessions: int}
     */
    private function containSuspiciousLogin(
        Request $request,
        User $user,
        string $role,
        string $identifier,
        string $auditAction,
    ): array {
        if (! $this->isSuspiciousLoginAttempt($request, $user)) {
            return [
                'suspicious' => false,
                'revokedTokens' => 0,
                'revokedWebSessions' => 0,
            ];
        }

        $summary = $this->revokeUserSessionsAndTokens($user);

        AuthAuditLogger::record(
            $request,
            $auditAction,
            'challenge',
            $user,
            $role,
            $identifier,
            [
                'reason' => 'new_device_or_location_detected',
                'previous_ip' => $this->normalizeIpAddress($user->last_login_ip),
                'current_ip' => $this->normalizeIpAddress($request->ip()),
                'revoked_tokens' => $summary['revokedTokens'],
                'revoked_web_sessions' => $summary['revokedWebSessions'],
            ],
        );

        return [
            'suspicious' => true,
            'revokedTokens' => $summary['revokedTokens'],
            'revokedWebSessions' => $summary['revokedWebSessions'],
        ];
    }

    private function isSuspiciousLoginAttempt(Request $request, User $user): bool
    {
        $previousIp = $this->normalizeIpAddress($user->last_login_ip);
        $previousAgent = $this->normalizeUserAgentString($user->last_login_user_agent);
        $currentIp = $this->normalizeIpAddress($request->ip());
        $currentAgent = $this->normalizeUserAgentString($request->userAgent());

        if ($previousIp === null || $previousAgent === null || $currentIp === null || $currentAgent === null) {
            return false;
        }

        return $previousIp !== $currentIp || $previousAgent !== $currentAgent;
    }

    private function recordSuccessfulLoginTelemetry(User $user, Request $request): void
    {
        $user->forceFill([
            'last_login_at' => now(),
            'last_login_ip' => $this->normalizeIpAddress($request->ip()),
            'last_login_user_agent' => $this->normalizeUserAgentString($request->userAgent()),
        ])->save();
    }

    /**
     * @return array{revokedTokens: int, revokedWebSessions: int}
     */
    private function revokeUserSessionsAndTokens(
        User $user,
        ?int $exceptTokenId = null,
        ?string $exceptSessionId = null,
    ): array {
        return [
            'revokedTokens' => $this->revokeUserTokens($user, $exceptTokenId),
            'revokedWebSessions' => $this->revokeUserWebSessions($user, $exceptSessionId),
        ];
    }

    private function revokeUserTokens(User $user, ?int $exceptTokenId = null): int
    {
        $query = $user->tokens();
        if ($exceptTokenId !== null) {
            $query->where('id', '!=', $exceptTokenId);
        }

        return $query->delete();
    }

    private function revokeCurrentPersonalAccessToken(User $user): void
    {
        $currentToken = $user->currentAccessToken();
        if ($currentToken instanceof PersonalAccessToken) {
            $currentToken->delete();
        }
    }

    private function revokeUserWebSessions(User $user, ?string $exceptSessionId = null): int
    {
        if (! Schema::hasTable('sessions')) {
            return 0;
        }

        $query = DB::table('sessions')->where('user_id', $user->id);
        if (is_string($exceptSessionId) && $exceptSessionId !== '') {
            $query->where('id', '!=', $exceptSessionId);
        }

        return $query->delete();
    }

    /**
     * @return list<array{
     *   id: string,
     *   sessionType: string,
     *   deviceLabel: string,
     *   ipAddress: string|null,
     *   userAgent: string|null,
     *   createdAt: string|null,
     *   lastActiveAt: string|null,
     *   expiresAt: string|null,
     *   isCurrent: bool
     * }>
     */
    private function activeWebSessionEntries(User $user, Request $request, ?string $currentSessionId): array
    {
        $entries = [];
        $includedCurrent = false;

        if (Schema::hasTable('sessions')) {
            $rows = DB::table('sessions')
                ->where('user_id', $user->id)
                ->orderByDesc('last_activity')
                ->limit(100)
                ->get(['id', 'ip_address', 'user_agent', 'last_activity']);

            foreach ($rows as $row) {
                $sessionId = (string) ($row->id ?? '');
                if ($sessionId === '') {
                    continue;
                }

                $isCurrent = $currentSessionId !== null && $sessionId === $currentSessionId;
                $includedCurrent = $includedCurrent || $isCurrent;

                $lastActiveAt = $this->sessionLastActivityToIso($row->last_activity ?? null);
                $userAgent = $this->normalizeUserAgentString($row->user_agent ?? null);

                $entries[] = [
                    'id' => 'web_' . $sessionId,
                    'sessionType' => 'web_session',
                    'deviceLabel' => $userAgent !== null ? 'Browser session' : 'Web session',
                    'ipAddress' => $this->normalizeIpAddress($row->ip_address ?? null),
                    'userAgent' => $userAgent,
                    'createdAt' => null,
                    'lastActiveAt' => $lastActiveAt,
                    'expiresAt' => null,
                    'isCurrent' => $isCurrent,
                ];
            }
        }

        if ($currentSessionId !== null && ! $includedCurrent) {
            $entries[] = [
                'id' => 'web_' . $currentSessionId,
                'sessionType' => 'web_session',
                'deviceLabel' => 'Current browser session',
                'ipAddress' => $this->normalizeIpAddress($request->ip()),
                'userAgent' => $this->normalizeUserAgentString($request->userAgent()),
                'createdAt' => null,
                'lastActiveAt' => now()->toISOString(),
                'expiresAt' => null,
                'isCurrent' => true,
            ];
        }

        return $entries;
    }

    private function sessionLastActivityToIso(mixed $value): ?string
    {
        if (! is_numeric($value)) {
            return null;
        }

        $timestamp = (int) $value;
        if ($timestamp <= 0) {
            return null;
        }

        return CarbonImmutable::createFromTimestamp($timestamp)->toISOString();
    }

    private function derivedTokenExpiryTimestamp(PersonalAccessToken $token): ?CarbonImmutable
    {
        if ($token->expires_at !== null) {
            return CarbonImmutable::parse($token->expires_at);
        }

        $expirationMinutes = $this->tokenExpirationMinutes();
        if ($expirationMinutes === null || $token->created_at === null) {
            return null;
        }

        return CarbonImmutable::parse($token->created_at)->addMinutes($expirationMinutes);
    }

    private function normalizeIpAddress(mixed $value): ?string
    {
        $normalized = trim((string) $value);
        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeUserAgentString(mixed $value): ?string
    {
        $normalized = trim((string) $value);
        if ($normalized === '') {
            return null;
        }

        return Str::limit($normalized, 500, '');
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

        $payload = [
            'message' => $this->inactiveAccountMessage($status),
            'accountStatus' => $status->value,
        ];

        if ($status === AccountStatus::PENDING_SETUP) {
            $payload['requiresAccountSetup'] = true;
        }

        return response()->json(
            $payload,
            Response::HTTP_FORBIDDEN,
        );
    }

    private function inactiveAccountMessage(AccountStatus $status): string
    {
        return match ($status) {
            AccountStatus::PENDING_SETUP => 'Your account setup is not complete yet. Use your one-time setup link to activate your account.',
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
    private function issueDashboardToken(
        User $user,
        string $role,
        Request $request,
        bool $revokeExistingDashboardTokens,
    ): array
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

        /** @var NewAccessToken $issuedToken */
        $issuedToken = $user->createToken(
            $this->dashboardTokenName($role),
            ['role:' . $role],
            $expiresAt,
        );

        $issuedToken->accessToken->forceFill([
            'ip_address' => $this->normalizeIpAddress($request->ip()),
            'user_agent' => $this->normalizeUserAgentString($request->userAgent()),
        ])->save();

        return [
            'token' => $issuedToken->plainTextToken,
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

        try {
            $user->notify(new MonitorMfaCodeNotification($code, $expiresAt->toDateTimeString()));
        } catch (\Throwable $exception) {
            Cache::forget($this->monitorMfaCacheKey($challengeId));
            throw $exception;
        }

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

    private function enforceRequiredPasswordResetOnLogin(): bool
    {
        if (app()->environment('testing')) {
            return true;
        }

        $raw = strtolower(trim((string) env('CSPAMS_ENFORCE_REQUIRED_PASSWORD_RESET', 'true')));

        return ! in_array($raw, ['0', 'false', 'off', 'no'], true);
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
        if (! $this->monitorMfaResetStorageAvailable()) {
            return;
        }

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

    private function monitorMfaResetStorageAvailable(): bool
    {
        return Schema::hasTable('monitor_mfa_reset_tickets');
    }

    private function monitorMfaResetStorageUnavailableResponse(
        Request $request,
        string $auditAction,
        ?User $user = null,
        ?string $identifier = null,
    ): JsonResponse {
        AuthAuditLogger::record(
            $request,
            $auditAction,
            'failure',
            $user,
            UserRoleResolver::MONITOR,
            $identifier,
            ['reason' => 'mfa_reset_ticket_storage_unavailable'],
        );

        return response()->json(
            ['message' => 'MFA reset request storage is unavailable. Run database migrations first.'],
            Response::HTTP_SERVICE_UNAVAILABLE,
        );
    }

    private function buildPasswordResetUrl(string $email, string $token, ?string $role = null): string
    {
        $frontend = trim((string) config('app.frontend_url', ''));
        if ($frontend === '') {
            $frontend = (string) config('app.url', 'http://127.0.0.1:8000');
        }

        $frontend = rtrim($frontend, '/');

        $queryParams = [
            'token' => $token,
            'email' => $email,
        ];

        $role = UserRoleResolver::normalizeLoginRole((string) $role);
        if (in_array($role, [UserRoleResolver::MONITOR, UserRoleResolver::SCHOOL_HEAD], true)) {
            $queryParams['role'] = $role;
        }

        $query = http_build_query(
            $queryParams,
            '',
            '&',
            PHP_QUERY_RFC3986,
        );

        return $frontend . '/#/reset-password?' . $query;
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

    private function resolvePasswordResetRoleForUser(?User $user, ?string $roleHint = null): ?string
    {
        if (! $user) {
            return null;
        }

        if (
            $roleHint !== null
            && in_array($roleHint, [UserRoleResolver::MONITOR, UserRoleResolver::SCHOOL_HEAD], true)
            && UserRoleResolver::has($user, $roleHint)
        ) {
            return $roleHint;
        }

        if (UserRoleResolver::has($user, UserRoleResolver::MONITOR)) {
            return UserRoleResolver::MONITOR;
        }

        if (UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)) {
            return UserRoleResolver::SCHOOL_HEAD;
        }

        return null;
    }

    private function resolveRoleForUser(User $user): string
    {
        $currentToken = $user->currentAccessToken();
        if ($currentToken instanceof PersonalAccessToken) {
            $abilities = is_array($currentToken->abilities)
                ? $currentToken->abilities
                : [];

            foreach ($abilities as $ability) {
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
