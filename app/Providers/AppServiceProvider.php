<?php

namespace App\Providers;

use App\Models\User;
use App\Support\Audit\AuthAuditLogger;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->assertSafeProductionConfiguration();

        RateLimiter::for('api', function (Request $request): Limit {
            $key = $request->user()?->id
                ? 'user:' . $request->user()->id
                : 'ip:' . $request->ip();

            return Limit::perMinute(120)->by($key);
        });

        $lockoutResponse = function (
            Request $request,
            array $headers,
            string $action,
            string $scope,
        ) {
            $retryAfterHeader = $headers['Retry-After'] ?? $headers['retry-after'] ?? null;
            $retryAfterSeconds = is_numeric($retryAfterHeader) ? (int) $retryAfterHeader : null;

            $resolvedUser = $request->user();
            $user = $resolvedUser instanceof User ? $resolvedUser : null;

            AuthAuditLogger::record(
                $request,
                $action,
                'lockout',
                $user,
                null,
                null,
                [
                    'throttle_scope' => $scope,
                    'retry_after_seconds' => $retryAfterSeconds,
                ],
            );

            return response()->json(['message' => 'Too Many Attempts.'], 429, $headers);
        };

        RateLimiter::for('auth-login', function (Request $request) use ($lockoutResponse): array {
            $role = strtolower(trim((string) $request->input('role', 'unknown')));
            $login = strtolower(trim((string) $request->input('login', 'unknown')));
            $identity = $role . '|' . $login . '|' . $request->ip();

            return [
                Limit::perMinute(5)->by($identity)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.login.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(20)->by('auth-login-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.login.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-password-reset', function (Request $request) use ($lockoutResponse): array {
            $role = strtolower(trim((string) $request->input('role', 'unknown')));
            $login = strtolower(trim((string) $request->input('login', 'unknown')));
            $identity = $role . '|' . $login . '|' . $request->ip();

            return [
                Limit::perMinute(4)->by($identity)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.password_reset.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(12)->by('auth-reset-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.password_reset.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-forgot-password', function (Request $request) use ($lockoutResponse): array {
            $email = strtolower(trim((string) $request->input('email', 'unknown')));
            $identity = $email . '|' . $request->ip();

            return [
                Limit::perMinute(4)->by('auth-forgot-password:' . $identity)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.forgot_password.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(12)->by('auth-forgot-password-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.forgot_password.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-reset-password', function (Request $request) use ($lockoutResponse): array {
            $email = strtolower(trim((string) $request->input('email', 'unknown')));
            $tokenPrefix = strtolower(substr(trim((string) $request->input('token', 'unknown')), 0, 24));
            $identity = $email . '|' . $tokenPrefix . '|' . $request->ip();

            return [
                Limit::perMinute(5)->by('auth-reset-password:' . $identity)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.reset_password.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(15)->by('auth-reset-password-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.reset_password.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-account-setup', function (Request $request) use ($lockoutResponse): array {
            $tokenPrefix = strtolower(substr(trim((string) $request->input('token', 'unknown')), 0, 24));
            $identity = $tokenPrefix . '|' . $request->ip();

            return [
                Limit::perMinute(5)->by('auth-account-setup:' . $identity)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.account_setup.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(20)->by('auth-account-setup-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.account_setup.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-mfa-verify', function (Request $request) use ($lockoutResponse): array {
            $role = strtolower(trim((string) $request->input('role', 'unknown')));
            $login = strtolower(trim((string) $request->input('login', 'unknown')));
            $challengeId = strtolower(trim((string) $request->input('challenge_id', 'unknown')));
            $identity = $role . '|' . $login . '|' . $challengeId . '|' . $request->ip();

            return [
                Limit::perMinute(6)->by($identity)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.mfa_verify.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(25)->by('auth-mfa-verify-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.mfa_verify.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-mfa-reset-request', function (Request $request) use ($lockoutResponse): array {
            $role = strtolower(trim((string) $request->input('role', 'unknown')));
            $login = strtolower(trim((string) $request->input('login', 'unknown')));
            $identity = $role . '|' . $login . '|' . $request->ip();

            return [
                Limit::perMinute(3)->by($identity)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.mfa_reset.request.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(12)->by('auth-mfa-reset-request-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.mfa_reset.request.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-mfa-reset-complete', function (Request $request) use ($lockoutResponse): array {
            $role = strtolower(trim((string) $request->input('role', 'unknown')));
            $login = strtolower(trim((string) $request->input('login', 'unknown')));
            $requestId = strtolower(trim((string) $request->input('request_id', 'unknown')));
            $identity = $role . '|' . $login . '|' . $requestId . '|' . $request->ip();

            return [
                Limit::perMinute(4)->by($identity)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.mfa_reset.complete.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(15)->by('auth-mfa-reset-complete-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.mfa_reset.complete.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-mfa-backup-codes', function (Request $request) use ($lockoutResponse): array {
            $key = $request->user()?->id
                ? 'auth-mfa-backup-codes-user:' . $request->user()->id
                : 'auth-mfa-backup-codes-ip:' . $request->ip();

            return [
                Limit::perMinute(6)->by($key)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.mfa_backup_codes.regenerate.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(20)->by('auth-mfa-backup-codes-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.mfa_backup_codes.regenerate.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-mfa-reset-approve', function (Request $request) use ($lockoutResponse): array {
            $key = $request->user()?->id
                ? 'auth-mfa-reset-approve-user:' . $request->user()->id
                : 'auth-mfa-reset-approve-ip:' . $request->ip();

            return [
                Limit::perMinute(15)->by($key)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.mfa_reset.approve.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(40)->by('auth-mfa-reset-approve-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.mfa_reset.approve.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-session-management', function (Request $request) use ($lockoutResponse): array {
            $key = $request->user()?->id
                ? 'auth-session-management-user:' . $request->user()->id
                : 'auth-session-management-ip:' . $request->ip();

            return [
                Limit::perMinute(30)->by($key)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.session_management.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(80)->by('auth-session-management-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.session_management.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-token-refresh', function (Request $request) use ($lockoutResponse): array {
            $key = $request->user()?->id
                ? 'auth-refresh-user:' . $request->user()->id
                : 'auth-refresh-ip:' . $request->ip();

            return [
                Limit::perMinute(10)->by($key)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.token_refresh.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(30)->by('auth-refresh-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.token_refresh.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });

        RateLimiter::for('auth-account-management', function (Request $request) use ($lockoutResponse): array {
            $key = $request->user()?->id
                ? 'auth-account-management-user:' . $request->user()->id
                : 'auth-account-management-ip:' . $request->ip();

            return [
                Limit::perMinute(30)->by($key)
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.account_management.locked_out',
                            'identity',
                        ),
                    ),
                Limit::perMinute(80)->by('auth-account-management-ip:' . $request->ip())
                    ->response(
                        fn (Request $request, array $headers) => $lockoutResponse(
                            $request,
                            $headers,
                            'auth.account_management.locked_out',
                            'ip',
                        ),
                    ),
            ];
        });
    }

    private function assertSafeProductionConfiguration(): void
    {
        if (! app()->environment(['production', 'staging'])) {
            return;
        }

        $issues = [];

        if ((bool) config('app.debug', false)) {
            $issues[] = 'APP_DEBUG must be false.';
        }

        $testCode = trim((string) config('auth_mfa.monitor.test_code', ''));
        if ($testCode !== '') {
            $issues[] = 'CSPAMS_MONITOR_MFA_TEST_CODE must be empty.';
        }

        $resetTestApprovalToken = trim((string) config('auth_mfa.monitor.reset_test_approval_token', ''));
        if ($resetTestApprovalToken !== '') {
            $issues[] = 'CSPAMS_MONITOR_MFA_RESET_TEST_APPROVAL_TOKEN must be empty.';
        }

        $mailer = strtolower(trim((string) config('mail.default', 'log')));
        if (in_array($mailer, ['log', 'array'], true)) {
            $issues[] = "MAIL_MAILER must not be '{$mailer}'.";
        }

        $sanctumExpiration = config('sanctum.expiration');
        $expirationMinutes = is_numeric($sanctumExpiration) ? (int) $sanctumExpiration : null;
        if ($expirationMinutes === null || $expirationMinutes <= 0) {
            $issues[] = 'SANCTUM_TOKEN_EXPIRATION must be a positive integer.';
        }

        $enforceResetRaw = strtolower(trim((string) env('CSPAMS_ENFORCE_REQUIRED_PASSWORD_RESET', 'true')));
        if (in_array($enforceResetRaw, ['0', 'false', 'off', 'no'], true)) {
            $issues[] = 'CSPAMS_ENFORCE_REQUIRED_PASSWORD_RESET must be enabled.';
        }

        if ($issues !== []) {
            throw new \RuntimeException('Unsafe production configuration: ' . implode(' ', $issues));
        }
    }
}
