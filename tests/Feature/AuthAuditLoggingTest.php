<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class AuthAuditLoggingTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_login_success_and_failure_are_audited_with_context(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'monitor@cspams.local')->firstOrFail();

        $failedLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => 'wrong-password',
        ]);

        $failedLogin->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);

        $successfulLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        ]);

        $successfulLogin->assertOk();

        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.login.failed']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'auth.login.success']);

        /** @var AuditLog $failedAudit */
        $failedAudit = AuditLog::query()
            ->where('action', 'auth.login.failed')
            ->latest('id')
            ->firstOrFail();
        $this->assertSame('failure', data_get($failedAudit->metadata, 'outcome'));
        $this->assertSame('monitor', data_get($failedAudit->metadata, 'role'));
        $this->assertSame('monitor@cspams.local', data_get($failedAudit->metadata, 'identifier'));
        $this->assertSame('invalid_credentials', data_get($failedAudit->metadata, 'reason'));
        $this->assertNotNull($failedAudit->ip_address);
        $this->assertNotNull($failedAudit->user_agent);

        /** @var AuditLog $successAudit */
        $successAudit = AuditLog::query()
            ->where('action', 'auth.login.success')
            ->latest('id')
            ->firstOrFail();
        $this->assertSame($monitor->id, $successAudit->user_id);
        $this->assertSame('success', data_get($successAudit->metadata, 'outcome'));
        $this->assertSame('monitor', data_get($successAudit->metadata, 'role'));
        $this->assertSame('monitor@cspams.local', data_get($successAudit->metadata, 'identifier'));
    }

    public function test_login_lockout_is_audited(): void
    {
        $this->seed();

        $login = sprintf('lockout-%d@cspams.local', random_int(1000, 999999));

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $response = $this->postJson('/api/auth/login', [
                'role' => 'monitor',
                'login' => $login,
                'password' => 'wrong-password',
            ]);

            $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $lockedOut = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => $login,
            'password' => 'wrong-password',
        ]);

        $lockedOut->assertStatus(Response::HTTP_TOO_MANY_REQUESTS);

        /** @var AuditLog $lockoutAudit */
        $lockoutAudit = AuditLog::query()
            ->where('action', 'auth.login.locked_out')
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('lockout', data_get($lockoutAudit->metadata, 'outcome'));
        $this->assertSame('monitor', data_get($lockoutAudit->metadata, 'role'));
        $this->assertSame($login, data_get($lockoutAudit->metadata, 'identifier'));
        $this->assertSame('identity', data_get($lockoutAudit->metadata, 'throttle_scope'));
        $this->assertNotNull($lockoutAudit->ip_address);
        $this->assertNotNull($lockoutAudit->user_agent);
    }
}
