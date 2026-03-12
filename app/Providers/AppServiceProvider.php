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
    }
}
