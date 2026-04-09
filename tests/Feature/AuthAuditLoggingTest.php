<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\Domain\AccountStatus;
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
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();

        $failedLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => 'wrong-password',
        ]);

        $failedLogin->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);

        $successfulLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
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
        $this->assertSame('cspamsmonitor@gmail.com', data_get($failedAudit->metadata, 'identifier'));
        $this->assertSame('invalid_credentials', data_get($failedAudit->metadata, 'reason'));
        $this->assertSame('auth.login.failed', data_get($failedAudit->metadata, 'event'));
        $this->assertSame('login', data_get($failedAudit->metadata, 'event_group'));
        $this->assertNotNull(data_get($failedAudit->metadata, 'ip_address'));
        $this->assertNotNull(data_get($failedAudit->metadata, 'user_agent'));
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
        $this->assertSame('cspamsmonitor@gmail.com', data_get($successAudit->metadata, 'identifier'));
        $this->assertSame('auth.login.success', data_get($successAudit->metadata, 'event'));
        $this->assertSame('login', data_get($successAudit->metadata, 'event_group'));
        $this->assertSame('token', data_get($successAudit->metadata, 'auth_mode'));
        $this->assertNotNull(data_get($successAudit->metadata, 'ip_address'));
        $this->assertNotNull(data_get($successAudit->metadata, 'user_agent'));
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
        $this->assertSame('auth.login.locked_out', data_get($lockoutAudit->metadata, 'event'));
        $this->assertSame('login', data_get($lockoutAudit->metadata, 'event_group'));
        $this->assertNotNull(data_get($lockoutAudit->metadata, 'ip_address'));
        $this->assertNotNull(data_get($lockoutAudit->metadata, 'user_agent'));
        $this->assertNotNull($lockoutAudit->ip_address);
        $this->assertNotNull($lockoutAudit->user_agent);
    }

    public function test_mfa_challenge_failure_and_success_are_audited_with_context(): void
    {
        $this->seed();
        config()->set('auth_mfa.monitor.enabled', true);
        config()->set('auth_mfa.monitor.test_code', '123456');

        $loginResponse = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);

        $loginResponse->assertStatus(Response::HTTP_ACCEPTED)
            ->assertJsonPath('requiresMfa', true);

        $challengeId = (string) $loginResponse->json('mfa.challengeId');
        $this->assertNotSame('', $challengeId);

        $this->postJson('/api/auth/verify-mfa', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'challenge_id' => $challengeId,
            'code' => '000000',
        ])->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);

        $this->postJson('/api/auth/verify-mfa', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'challenge_id' => $challengeId,
            'code' => '123456',
        ])->assertOk();

        /** @var AuditLog $challengeAudit */
        $challengeAudit = AuditLog::query()
            ->where('action', 'auth.login.mfa_challenge_issued')
            ->latest('id')
            ->firstOrFail();
        $this->assertSame('challenge', data_get($challengeAudit->metadata, 'outcome'));
        $this->assertSame('mfa', data_get($challengeAudit->metadata, 'event_group'));
        $this->assertSame('monitor', data_get($challengeAudit->metadata, 'role'));
        $this->assertSame('cspamsmonitor@gmail.com', data_get($challengeAudit->metadata, 'identifier'));
        $this->assertNotNull(data_get($challengeAudit->metadata, 'ip_address'));
        $this->assertNotNull(data_get($challengeAudit->metadata, 'user_agent'));

        /** @var AuditLog $failureAudit */
        $failureAudit = AuditLog::query()
            ->where('action', 'auth.mfa_verify.failed')
            ->latest('id')
            ->firstOrFail();
        $this->assertSame('failure', data_get($failureAudit->metadata, 'outcome'));
        $this->assertSame('mfa', data_get($failureAudit->metadata, 'event_group'));
        $this->assertSame('invalid_code', data_get($failureAudit->metadata, 'reason'));
        $this->assertSame('monitor', data_get($failureAudit->metadata, 'role'));
        $this->assertSame('cspamsmonitor@gmail.com', data_get($failureAudit->metadata, 'identifier'));
        $this->assertNotNull(data_get($failureAudit->metadata, 'ip_address'));
        $this->assertNotNull(data_get($failureAudit->metadata, 'user_agent'));

        /** @var AuditLog $successAudit */
        $successAudit = AuditLog::query()
            ->where('action', 'auth.mfa_verify.success')
            ->latest('id')
            ->firstOrFail();
        $this->assertSame('success', data_get($successAudit->metadata, 'outcome'));
        $this->assertSame('mfa', data_get($successAudit->metadata, 'event_group'));
        $this->assertSame('monitor', data_get($successAudit->metadata, 'role'));
        $this->assertSame('cspamsmonitor@gmail.com', data_get($successAudit->metadata, 'identifier'));
        $this->assertSame('token', data_get($successAudit->metadata, 'auth_mode'));
        $this->assertSame('email_code', data_get($successAudit->metadata, 'mfa_method'));
        $this->assertNotNull(data_get($successAudit->metadata, 'ip_address'));
        $this->assertNotNull(data_get($successAudit->metadata, 'user_agent'));
    }

    public function test_inactive_account_access_block_is_audited_with_auth_mode_context(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();
        $monitor->forceFill([
            'account_status' => AccountStatus::SUSPENDED->value,
        ])->save();

        $token = $monitor->createToken('inactive-audit-token')->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/auth/me');
        $response->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'This account is not active.')
            ->assertJsonPath('accountStatus', AccountStatus::SUSPENDED->value);

        /** @var AuditLog $audit */
        $audit = AuditLog::query()
            ->where('action', 'auth.account_access.blocked')
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('failure', data_get($audit->metadata, 'outcome'));
        $this->assertSame('token', data_get($audit->metadata, 'auth_mode'));
        $this->assertSame(AccountStatus::SUSPENDED->value, data_get($audit->metadata, 'account_status'));
    }
}

