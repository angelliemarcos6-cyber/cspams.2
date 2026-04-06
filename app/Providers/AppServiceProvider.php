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
        if (! $this->shouldSkipProductionConfigurationAudit()) {
            $this->assertSafeProductionRuntimeConfiguration();
        }

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

    public function runProductionConfigurationAudit(): void
    {
        $this->throwIfUnsafeProductionConfiguration([
            ...$this->productionRuntimeConfigurationIssues(),
            ...$this->productionCrossOriginConfigurationIssues(),
        ]);
    }

    private function assertSafeProductionRuntimeConfiguration(): void
    {
        $this->throwIfUnsafeProductionConfiguration($this->productionRuntimeConfigurationIssues());
    }

    private function shouldSkipProductionConfigurationAudit(): bool
    {
        if (! app()->runningInConsole()) {
            return false;
        }

        $argv = $_SERVER['argv'] ?? [];
        $commandLine = implode(' ', array_map(
            static fn (mixed $value): string => (string) $value,
            is_array($argv) ? $argv : [],
        ));

        return str_contains($commandLine, 'package:discover')
            || str_contains($commandLine, 'filament:upgrade')
            || str_contains($commandLine, 'config:cache')
            || str_contains($commandLine, 'config:clear')
            || str_contains($commandLine, 'optimize');
    }

    /**
     * @return list<string>
     */
    private function productionRuntimeConfigurationIssues(): array
    {
        if (! app()->environment(['production', 'staging'])) {
            return [];
        }

        $issues = [];

        if ((bool) config('app.debug', false)) {
            $issues[] = 'APP_DEBUG must be false.';
        }

        $testCode = trim((string) config('auth_mfa.monitor.test_code', ''));
        if ($testCode !== '') {
            $issues[] = 'CSPAMS_MONITOR_MFA_TEST_CODE must be empty.';
        }

        $queueConnection = strtolower(trim((string) config('queue.default', 'database')));
        if ((bool) config('auth_mfa.monitor.enabled', false) && $queueConnection === 'sync') {
            $issues[] = 'QUEUE_CONNECTION must not be sync when monitor MFA email is enabled.';
        }

        $resetTestApprovalToken = trim((string) config('auth_mfa.monitor.reset_test_approval_token', ''));
        if ($resetTestApprovalToken !== '') {
            $issues[] = 'CSPAMS_MONITOR_MFA_RESET_TEST_APPROVAL_TOKEN must be empty.';
        }

        $mailer = strtolower(trim((string) config('mail.default', 'log')));
        if (in_array($mailer, ['log', 'array'], true)) {
            $issues[] = "MAIL_MAILER must not be '{$mailer}'.";
        }

        if (\App\Support\Mail\MailDelivery::isLikelyMisconfigured()) {
            $issues[] = "Mail appears misconfigured (MAIL_MAILER='{$mailer}'). Check SMTP credentials, RESEND_KEY, or MAIL_FROM_ADDRESS.";
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

        $sessionSecure = (bool) config('session.secure', false);
        if ($sessionSecure !== true) {
            $issues[] = 'SESSION_SECURE_COOKIE must be true.';
        }

        $sessionHttpOnly = (bool) config('session.http_only', true);
        if ($sessionHttpOnly !== true) {
            $issues[] = 'SESSION_HTTP_ONLY must be true.';
        }

        $sessionLifetime = (int) config('session.lifetime', 0);
        if ($sessionLifetime <= 0 || $sessionLifetime > 1440) {
            $issues[] = 'SESSION_LIFETIME must be between 1 and 1440 minutes.';
        }

        $sameSite = config('session.same_site');
        $normalizedSameSite = is_string($sameSite) ? strtolower(trim($sameSite)) : null;
        if (! in_array($normalizedSameSite, ['lax', 'strict', 'none'], true)) {
            $issues[] = 'SESSION_SAME_SITE must be lax, strict, or none.';
        }

        if ($normalizedSameSite === 'none' && $sessionSecure !== true) {
            $issues[] = 'SESSION_SAME_SITE=none requires SESSION_SECURE_COOKIE=true.';
        }

        return $issues;
    }

    /**
     * @return list<string>
     */
    private function productionCrossOriginConfigurationIssues(): array
    {
        if (! app()->environment(['production', 'staging'])) {
            return [];
        }

        $issues = [];
        $frontendUrl = trim((string) config('app.frontend_url', ''));
        $appUrl = trim((string) config('app.url', ''));

        $frontendOrigin = $this->normalizeOrigin($frontendUrl);
        if ($frontendOrigin === null) {
            $issues[] = 'FRONTEND_URL must be a valid URL.';
        }

        $appOrigin = $this->normalizeOrigin($appUrl);
        if ($appOrigin === null) {
            $issues[] = 'APP_URL must be a valid URL.';
        }

        if ($frontendOrigin !== null && $appOrigin !== null && $frontendOrigin !== $appOrigin) {
            $corsAllowedOrigins = config('cors.allowed_origins', []);
            $allowedOrigins = is_array($corsAllowedOrigins)
                ? array_values(array_filter(array_map(
                    static fn (mixed $value): string => rtrim(trim((string) $value), '/'),
                    $corsAllowedOrigins,
                )))
                : [];

            if (! in_array($frontendOrigin, $allowedOrigins, true)) {
                $issues[] = "CORS_ALLOWED_ORIGINS must include '{$frontendOrigin}'.";
            }

            if ((bool) config('cors.supports_credentials', false) !== true) {
                $issues[] = 'CORS supports_credentials must be true.';
            }

            $statefulConfig = config('sanctum.stateful', []);
            $statefulDomains = [];
            if (is_array($statefulConfig)) {
                foreach ($statefulConfig as $domain) {
                    $domain = trim((string) $domain);
                    if ($domain === '') {
                        continue;
                    }

                    if (str_contains($domain, '://')) {
                        $parsedDomain = parse_url($domain);
                        if (is_array($parsedDomain) && isset($parsedDomain['host'])) {
                            $host = strtolower(trim((string) $parsedDomain['host']));
                            $port = isset($parsedDomain['port']) && is_numeric($parsedDomain['port'])
                                ? (int) $parsedDomain['port']
                                : null;
                            $statefulDomains[] = $port === null ? $host : ($host . ':' . $port);
                            continue;
                        }
                    }

                    $statefulDomains[] = strtolower($domain);
                }
            }

            $expectedStateful = $this->normalizeHostWithPort($frontendUrl);
            if ($expectedStateful !== null && ! in_array($expectedStateful, $statefulDomains, true)) {
                $issues[] = "SANCTUM_STATEFUL_DOMAINS must include '{$expectedStateful}'.";
            }
        }

        return $issues;
    }

    /**
     * @param list<string> $issues
     */
    private function throwIfUnsafeProductionConfiguration(array $issues): void
    {
        if ($issues === []) {
            return;
        }

        throw new \RuntimeException('Unsafe production configuration: ' . implode(' ', $issues));
    }

    private function normalizeOrigin(string $url): ?string
    {
        $url = trim($url);
        if ($url === '') {
            return null;
        }

        $parsed = parse_url($url);
        if (! is_array($parsed)) {
            return null;
        }

        $scheme = isset($parsed['scheme']) ? strtolower(trim((string) $parsed['scheme'])) : null;
        $host = isset($parsed['host']) ? strtolower(trim((string) $parsed['host'])) : null;
        if (! $scheme || ! $host) {
            return null;
        }

        $port = isset($parsed['port']) && is_numeric($parsed['port']) ? (int) $parsed['port'] : null;
        $defaultPort = match ($scheme) {
            'https' => 443,
            'http' => 80,
            default => null,
        };

        $origin = $scheme . '://' . $host;
        if ($port !== null && ($defaultPort === null || $port !== $defaultPort)) {
            $origin .= ':' . $port;
        }

        return rtrim($origin, '/');
    }

    private function normalizeHostWithPort(string $url): ?string
    {
        $url = trim($url);
        if ($url === '') {
            return null;
        }

        $parsed = parse_url($url);
        if (! is_array($parsed)) {
            return null;
        }

        $host = isset($parsed['host']) ? strtolower(trim((string) $parsed['host'])) : null;
        if (! $host) {
            return null;
        }

        $port = isset($parsed['port']) && is_numeric($parsed['port']) ? (int) $parsed['port'] : null;
        if ($port === null) {
            return $host;
        }

        return $host . ':' . $port;
    }
}
