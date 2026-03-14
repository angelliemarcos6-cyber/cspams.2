<?php

namespace Tests\Feature;

use App\Models\MonitorMfaResetTicket;
use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class MonitorMfaRecoveryControlsTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('auth_mfa.monitor.enabled', true);
        config()->set('auth_mfa.monitor.test_code', '123456');
        config()->set('auth_mfa.monitor.backup_codes_count', 4);
    }

    public function test_monitor_can_regenerate_backup_codes_and_use_one_for_mfa_login(): void
    {
        $this->seed();

        $password = $this->demoPasswordForLogin('monitor', 'monitor@cspams.local');
        $token = $this->monitorTokenAfterMfa('monitor@cspams.local', $password);

        $regen = $this->withToken($token)->postJson('/api/auth/mfa/backup-codes/regenerate', [
            'current_password' => $password,
        ]);

        $regen->assertOk()
            ->assertJsonCount(4, 'backupCodes');

        /** @var list<string> $backupCodes */
        $backupCodes = $regen->json('backupCodes', []);
        $backupCode = $backupCodes[0] ?? null;
        $this->assertNotNull($backupCode);

        $challengeId = $this->monitorMfaChallengeId('monitor@cspams.local', $password);
        $backupVerify = $this->postJson('/api/auth/verify-mfa', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'challenge_id' => $challengeId,
            'code' => $backupCode,
        ]);

        $backupVerify->assertOk()
            ->assertJsonPath('user.role', 'monitor');

        $reuseChallengeId = $this->monitorMfaChallengeId('monitor@cspams.local', $password);
        $reuseAttempt = $this->postJson('/api/auth/verify-mfa', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'challenge_id' => $reuseChallengeId,
            'code' => $backupCode,
        ]);

        $reuseAttempt->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.mfa_verify.backup_code_used']);
    }

    public function test_mfa_reset_flow_requires_admin_approval_and_is_audited(): void
    {
        $this->seed();

        $targetPassword = $this->demoPasswordForLogin('monitor', 'monitor@cspams.local');

        /** @var User $admin */
        $admin = User::query()->create([
            'name' => 'Division Monitor Admin',
            'email' => 'monitor.admin@cspams.local',
            'password' => Hash::make('AdminPass@2026!'),
            'must_reset_password' => false,
            'password_changed_at' => now(),
        ]);
        $admin->assignRole(UserRoleResolver::MONITOR);

        $requestReset = $this->postJson('/api/auth/mfa/reset/request', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $targetPassword,
            'reason' => 'Lost authenticator device.',
        ]);

        $requestReset->assertStatus(Response::HTTP_ACCEPTED)
            ->assertJsonPath('status', MonitorMfaResetTicket::STATUS_PENDING);

        $requestId = (int) $requestReset->json('requestId');
        $this->assertGreaterThan(0, $requestId);

        $adminToken = $this->monitorTokenAfterMfa('monitor.admin@cspams.local', 'AdminPass@2026!');
        $approve = $this->withToken($adminToken)->postJson("/api/auth/mfa/reset/requests/{$requestId}/approve", [
            'notes' => 'Identity verified through helpdesk.',
        ]);

        $approve->assertOk()
            ->assertJsonPath('status', MonitorMfaResetTicket::STATUS_APPROVED);

        $approvalToken = (string) $approve->json('approvalToken');
        $this->assertNotSame('', $approvalToken);

        $complete = $this->postJson('/api/auth/mfa/reset/complete', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $targetPassword,
            'request_id' => $requestId,
            'approval_token' => $approvalToken,
        ]);

        $complete->assertOk()
            ->assertJsonPath('user.role', 'monitor')
            ->assertJsonCount(4, 'backupCodes');

        $this->assertDatabaseHas('monitor_mfa_reset_tickets', [
            'id' => $requestId,
            'status' => MonitorMfaResetTicket::STATUS_COMPLETED,
            'approved_by_user_id' => $admin->id,
        ]);

        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.mfa_reset.requested']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.mfa_reset.approved']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.mfa_reset.completed']);
    }

    public function test_mfa_reset_request_returns_service_unavailable_when_ticket_storage_is_missing(): void
    {
        $this->seed();

        Schema::dropIfExists('monitor_mfa_reset_tickets');

        $requestReset = $this->postJson('/api/auth/mfa/reset/request', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
            'reason' => 'Lost authenticator device.',
        ]);

        $requestReset->assertStatus(Response::HTTP_SERVICE_UNAVAILABLE)
            ->assertJsonPath('message', 'MFA reset request storage is unavailable. Run database migrations first.');
    }

    public function test_mfa_reset_approval_returns_service_unavailable_when_ticket_storage_is_missing(): void
    {
        $this->seed();

        $monitorToken = $this->monitorTokenAfterMfa(
            'monitor@cspams.local',
            $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        );

        Schema::dropIfExists('monitor_mfa_reset_tickets');

        $approve = $this->withToken($monitorToken)->postJson('/api/auth/mfa/reset/requests/1/approve', [
            'notes' => 'Storage missing test.',
        ]);

        $approve->assertStatus(Response::HTTP_SERVICE_UNAVAILABLE)
            ->assertJsonPath('message', 'MFA reset request storage is unavailable. Run database migrations first.');
    }

    private function monitorTokenAfterMfa(string $email, string $password): string
    {
        $challengeId = $this->monitorMfaChallengeId($email, $password);

        $verify = $this->postJson('/api/auth/verify-mfa', [
            'role' => 'monitor',
            'login' => $email,
            'challenge_id' => $challengeId,
            'code' => '123456',
        ]);

        $verify->assertOk()
            ->assertJsonPath('user.role', 'monitor');

        $token = (string) $verify->json('token');
        $this->assertNotSame('', $token);

        return $token;
    }

    private function monitorMfaChallengeId(string $email, string $password): string
    {
        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => $email,
            'password' => $password,
        ]);

        $login->assertStatus(Response::HTTP_ACCEPTED)
            ->assertJsonPath('requiresMfa', true);

        $challengeId = (string) $login->json('mfa.challengeId');
        $this->assertNotSame('', $challengeId);

        return $challengeId;
    }
}
