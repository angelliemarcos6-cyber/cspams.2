<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\Auth\RequestAuthModeResolver;
use App\Support\Auth\SchoolHeadAccountSetupService;
use Illuminate\Http\Request;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class AuthSessionSecurityTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_suspicious_login_revokes_existing_sessions_and_tokens(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);

        $schoolHead->forceFill([
            'last_login_at' => now()->subDay(),
            'last_login_ip' => '10.0.0.10',
            'last_login_user_agent' => 'Legacy Browser/1.0',
        ])->save();

        $legacyToken = $schoolHead->createToken('legacy-device');
        $legacyTokenId = $legacyToken->accessToken->id;
        $legacySessionId = 'legacy-' . Str::lower(Str::random(16));

        DB::table('sessions')->insert([
            'id' => $legacySessionId,
            'user_id' => $schoolHead->id,
            'ip_address' => '10.0.0.10',
            'user_agent' => 'Legacy Browser/1.0',
            'payload' => 'stub',
            'last_activity' => now()->subHour()->getTimestamp(),
        ]);

        $response = $this
            ->withServerVariables(['REMOTE_ADDR' => '203.0.113.20'])
            ->withHeader('User-Agent', 'New Browser/2.0')
            ->postJson('/api/auth/login', [
                'role' => 'school_head',
                'login' => $schoolCode,
                'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
            ]);

        $response->assertOk()
            ->assertJsonPath('user.role', 'school_head');

        $this->assertDatabaseMissing('personal_access_tokens', ['name' => 'legacy-reset-token']);
        $this->assertDatabaseMissing('sessions', ['id' => $legacySessionId]);

        /** @var AuditLog $suspiciousAudit */
        $suspiciousAudit = AuditLog::query()
            ->where('action', 'auth.login.suspicious_detected')
            ->where('user_id', $schoolHead->id)
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('challenge', data_get($suspiciousAudit->metadata, 'outcome'));
        $this->assertSame('new_device_or_location_detected', data_get($suspiciousAudit->metadata, 'reason'));
    }

    public function test_password_reset_revokes_all_existing_sessions_and_tokens(): void
    {
        $this->seed();

        $schoolCode = '103811';
        $newPassword = 'Updated@Password2026';

        /** @var User $schoolHead */
        $schoolHead = User::query()
            ->whereHas('school', static fn ($query) => $query->where('school_code', $schoolCode))
            ->firstOrFail();

        /** @var SchoolHeadAccountSetupService $setupService */
        $setupService = app(SchoolHeadAccountSetupService::class);
        $issuedSetup = $setupService->issue($schoolHead);

        $legacyToken = $schoolHead->createToken('legacy-reset-token');
        $legacySessionId = 'reset-' . Str::lower(Str::random(16));

        DB::table('sessions')->insert([
            'id' => $legacySessionId,
            'user_id' => $schoolHead->id,
            'ip_address' => '198.51.100.45',
            'user_agent' => 'Reset Session Browser',
            'payload' => 'stub',
            'last_activity' => now()->subHour()->getTimestamp(),
        ]);

        $response = $this->postJson('/api/auth/setup-account', [
            'token' => $issuedSetup['plainToken'],
            'password' => $newPassword,
            'password_confirmation' => $newPassword,
        ]);

        $response->assertOk()
            ->assertJsonPath(
                'message',
                'Account setup completed. Your Division Monitor must verify and activate your account before sign-in.',
            );

        $this->assertDatabaseMissing('personal_access_tokens', ['name' => 'legacy-reset-token']);
        $this->assertDatabaseMissing('sessions', ['id' => $legacySessionId]);

        /** @var AuditLog $resetAudit */
        $resetAudit = AuditLog::query()
            ->where('action', 'auth.account_setup.completed')
            ->where('user_id', $schoolHead->id)
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('pending_verification', data_get($resetAudit->metadata, 'new_account_status'));
    }

    public function test_active_sessions_endpoint_lists_devices_and_can_revoke_others(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);

        $login = $this
            ->withToken('token-mode-request')
            ->postJson('/api/auth/login', [
                'role' => 'school_head',
                'login' => $schoolCode,
                'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
            ]);
        $login->assertOk();

        $token = (string) $login->json('token');
        $currentTokenId = (int) explode('|', $token, 2)[0];
        $this->assertGreaterThan(0, $currentTokenId);

        $legacyToken = $schoolHead->createToken('legacy-session-token');
        $legacyTokenId = $legacyToken->accessToken->id;
        $legacySessionId = 'session-' . Str::lower(Str::random(16));

        DB::table('sessions')->insert([
            'id' => $legacySessionId,
            'user_id' => $schoolHead->id,
            'ip_address' => '198.51.100.52',
            'user_agent' => 'Legacy Session Browser',
            'payload' => 'stub',
            'last_activity' => now()->subMinutes(30)->getTimestamp(),
        ]);

        $sessions = $this->withToken($token)->getJson('/api/auth/sessions');
        $sessions->assertOk();

        $sessionRows = $sessions->json('data');
        $this->assertIsArray($sessionRows);
        $this->assertNotEmpty($sessionRows);

        $ids = array_map(
            static fn (mixed $entry): string => (string) data_get($entry, 'id', ''),
            $sessionRows,
        );
        $this->assertContains('pat_' . $currentTokenId, $ids);
        $this->assertContains('pat_' . $legacyTokenId, $ids);
        $this->assertContains('web_' . $legacySessionId, $ids);

        $revokeOthers = $this->withToken($token)->postJson('/api/auth/sessions/revoke-others');
        $revokeOthers->assertStatus(Response::HTTP_OK)
            ->assertJsonPath('data.revokedTokenCount', 1)
            ->assertJsonPath('data.revokedWebSessionCount', 1);

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $currentTokenId]);
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $legacyTokenId]);
        $this->assertDatabaseMissing('sessions', ['id' => $legacySessionId]);
    }

    public function test_logout_succeeds_for_stateful_sanctum_session_without_personal_access_token(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();

        $this->actingAs($monitor);

        $response = $this->postJson('/api/auth/logout');

        $response->assertStatus(Response::HTTP_OK)
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Logout successful.');
    }

    public function test_active_sessions_endpoint_supports_stateful_sanctum_session_without_personal_access_token(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();

        $this->actingAs($monitor);

        $response = $this->getJson('/api/auth/sessions');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Active sessions retrieved.')
            ->assertJsonStructure([
                'data',
                'meta' => [
                    'total',
                    'currentTokenId',
                    'currentSessionId',
                ],
            ]);
    }

    public function test_stateful_login_persists_without_origin_header_when_csrf_session_is_present(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);

        $csrfToken = 'stateful-session-csrf-token';

        $login = $this
            ->withSession(['_token' => $csrfToken])
            ->withHeader('X-CSRF-TOKEN', $csrfToken)
            ->postJson('/api/auth/login', [
                'role' => 'school_head',
                'login' => $schoolCode,
                'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
            ]);

        $login->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Login successful.')
            ->assertJsonPath('mode', 'cookie')
            ->assertJsonMissingPath('token')
            ->assertJsonPath('user.role', 'school_head');

        $this->assertAuthenticated('web');

        $me = $this->getJson('/api/auth/me');

        $me->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('mode', 'cookie')
            ->assertJsonPath('user.email', (string) $schoolHead->email)
            ->assertJsonPath('user.role', 'school_head');
    }

    public function test_bearer_header_forces_stateless_login_even_when_csrf_state_exists(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);

        $csrfToken = 'explicit-token-transport-csrf-token';

        $login = $this
            ->withSession(['_token' => $csrfToken])
            ->withHeader('Origin', (string) config('app.frontend_url'))
            ->withHeader('X-CSRF-TOKEN', $csrfToken)
            ->withToken('token-mode-request')
            ->postJson('/api/auth/login', [
                'role' => 'school_head',
                'login' => $schoolCode,
                'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
            ]);

        $login->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('mode', 'token')
            ->assertJsonPath('user.role', 'school_head');

        $this->assertGuest('web');
    }

    public function test_bearer_requests_are_not_classified_as_stateful_even_when_origin_and_csrf_headers_exist(): void
    {
        config()->set('sanctum.stateful', ['spa.cspams.test']);
        config()->set('session.cookie', 'cspams_session');

        $request = Request::create('/api/auth/me', 'GET', [], [
            'cspams_session' => 'session-cookie',
            'XSRF-TOKEN' => 'xsrf-cookie',
        ], [], [
            'HTTP_ORIGIN' => 'https://spa.cspams.test',
            'HTTP_AUTHORIZATION' => 'Bearer test-token',
            'HTTP_X_XSRF_TOKEN' => 'xsrf-header',
        ]);

        $this->assertSame(RequestAuthModeResolver::TOKEN, RequestAuthModeResolver::resolveAuthMode($request));
    }

    public function test_non_bearer_requests_default_to_cookie_mode_without_origin_or_cookie_heuristics(): void
    {
        $request = Request::create('/api/auth/login', 'POST');

        $this->assertSame(RequestAuthModeResolver::COOKIE, RequestAuthModeResolver::resolveAuthMode($request));
    }

    public function test_user_agent_version_change_alone_does_not_trigger_suspicious_login_containment(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);

        $schoolHead->forceFill([
            'last_login_at' => now()->subDay(),
            'last_login_ip' => '203.0.113.20',
            'last_login_user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/133.0.0.0 Safari/537.36',
        ])->save();

        $legacyToken = $schoolHead->createToken('legacy-version-change-token');
        $legacyTokenId = $legacyToken->accessToken->id;
        $legacySessionId = 'ua-' . Str::lower(Str::random(16));

        DB::table('sessions')->insert([
            'id' => $legacySessionId,
            'user_id' => $schoolHead->id,
            'ip_address' => '203.0.113.20',
            'user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/133.0.0.0 Safari/537.36',
            'payload' => 'stub',
            'last_activity' => now()->subHour()->getTimestamp(),
        ]);

        $response = $this
            ->withServerVariables(['REMOTE_ADDR' => '203.0.113.20'])
            ->withHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36')
            ->postJson('/api/auth/login', [
                'role' => 'school_head',
                'login' => $schoolCode,
                'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
            ]);

        $response->assertOk()
            ->assertJsonPath('user.role', 'school_head');

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $legacyTokenId]);
        $this->assertDatabaseHas('sessions', ['id' => $legacySessionId]);
        $this->assertDatabaseMissing('audit_logs', [
            'action' => 'auth.login.suspicious_detected',
            'user_id' => $schoolHead->id,
        ]);
    }

    public function test_loopback_ip_variants_do_not_trigger_suspicious_login_containment(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);

        $schoolHead->forceFill([
            'last_login_at' => now()->subDay(),
            'last_login_ip' => '127.0.0.1',
            'last_login_user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36',
        ])->save();

        $legacyToken = $schoolHead->createToken('legacy-loopback-token');
        $legacyTokenId = $legacyToken->accessToken->id;
        $legacySessionId = 'loopback-' . Str::lower(Str::random(16));

        DB::table('sessions')->insert([
            'id' => $legacySessionId,
            'user_id' => $schoolHead->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36',
            'payload' => 'stub',
            'last_activity' => now()->subHour()->getTimestamp(),
        ]);

        $response = $this
            ->withServerVariables(['REMOTE_ADDR' => '::1'])
            ->withHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36')
            ->postJson('/api/auth/login', [
                'role' => 'school_head',
                'login' => $schoolCode,
                'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
            ]);

        $response->assertOk()
            ->assertJsonPath('user.role', 'school_head');

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $legacyTokenId]);
        $this->assertDatabaseHas('sessions', ['id' => $legacySessionId]);
        $this->assertDatabaseMissing('audit_logs', [
            'action' => 'auth.login.suspicious_detected',
            'user_id' => $schoolHead->id,
        ]);
    }

    public function test_login_identifier_tracker_locks_authentication_across_rate_limit_windows(): void
    {
        $this->seed();

        config()->set('auth_security.login.attempt_lockout_threshold', 3);
        config()->set('auth_security.login.attempt_lockout_minutes', 15);

        $payload = [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => 'wrong-password',
        ];

        $this->postJson('/api/auth/login', $payload)
            ->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'Invalid credentials.');

        $this->travel(61)->seconds();

        $this->postJson('/api/auth/login', $payload)
            ->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'Invalid credentials.');

        $this->travel(61)->seconds();

        $lockedOut = $this->postJson('/api/auth/login', $payload);
        $lockedOut->assertStatus(Response::HTTP_TOO_MANY_REQUESTS)
            ->assertJsonPath('message', 'Too many login attempts. Please try again later.')
            ->assertJsonPath('success', false);

        $this->travel(61)->seconds();

        $stillLockedOut = $this->postJson('/api/auth/login', $payload);
        $stillLockedOut->assertStatus(Response::HTTP_TOO_MANY_REQUESTS)
            ->assertJsonPath('message', 'Too many login attempts. Please try again later.');

        /** @var AuditLog $lockoutAudit */
        $lockoutAudit = AuditLog::query()
            ->where('action', 'auth.login.locked_out')
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('credential_tracker', data_get($lockoutAudit->metadata, 'throttle_scope'));
        $this->assertSame('credential_tracker', data_get($lockoutAudit->metadata, 'lockout_source'));
    }

}

