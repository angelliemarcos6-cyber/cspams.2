<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\Auth\SchoolHeadAccountSetupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
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
            ->assertJsonPath('user.mustResetPassword', false);

        $this->assertDatabaseMissing('personal_access_tokens', ['name' => 'legacy-reset-token']);
        $this->assertDatabaseMissing('sessions', ['id' => $legacySessionId]);

        /** @var AuditLog $resetAudit */
        $resetAudit = AuditLog::query()
            ->where('action', 'auth.account_setup.completed')
            ->where('user_id', $schoolHead->id)
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('active', data_get($resetAudit->metadata, 'new_account_status'));
    }

    public function test_active_sessions_endpoint_lists_devices_and_can_revoke_others(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);

        $login = $this->postJson('/api/auth/login', [
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
        $monitor = User::query()->where('email', 'monitor@cspams.local')->firstOrFail();

        Sanctum::actingAs($monitor);

        $response = $this->postJson('/api/auth/logout');

        $response->assertStatus(Response::HTTP_NO_CONTENT);
    }

}
