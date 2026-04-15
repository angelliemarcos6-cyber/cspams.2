<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\AuthSecurityAlertNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class AuthSecurityAlertingTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_login_lockout_dispatches_security_alert_to_monitor_accounts(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'monitor@cspams.local')->firstOrFail();
        $login = sprintf('alert-lockout-%d@cspams.local', random_int(1000, 999999));

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $response = $this->postJson('/api/auth/login', [
                'role' => 'monitor',
                'login' => $login,
                'password' => 'wrong-password',
            ]);

            $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => $login,
            'password' => 'wrong-password',
        ])->assertStatus(Response::HTTP_TOO_MANY_REQUESTS);

        $notification = $monitor->notifications()
            ->where('type', AuthSecurityAlertNotification::class)
            ->latest('id')
            ->get()
            ->first(static fn (mixed $item): bool => data_get($item, 'data.action') === 'auth.login.locked_out');

        $this->assertNotNull($notification);
        $this->assertSame('auth_security_alert', data_get($notification?->data, 'eventType'));
        $this->assertSame('high', data_get($notification?->data, 'severity'));
    }

    public function test_suspicious_login_dispatches_security_alert_to_impacted_user(): void
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

        $response = $this
            ->withServerVariables(['REMOTE_ADDR' => '203.0.113.20'])
            ->withHeader('User-Agent', 'Modern Browser/2.0')
            ->postJson('/api/auth/login', [
                'role' => 'school_head',
                'login' => $schoolCode,
                'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
            ]);

        $response->assertOk();

        $notification = $schoolHead->fresh()->notifications()
            ->where('type', AuthSecurityAlertNotification::class)
            ->latest('id')
            ->get()
            ->first(static fn (mixed $item): bool => data_get($item, 'data.action') === 'auth.login.suspicious_detected');

        $this->assertNotNull($notification);
        $this->assertSame('auth_security_alert', data_get($notification?->data, 'eventType'));
        $this->assertSame('critical', data_get($notification?->data, 'severity'));
        $this->assertSame('auth.login.suspicious_detected', data_get($notification?->data, 'action'));
    }

    public function test_mfa_lockout_dispatches_security_alert(): void
    {
        $this->seed();
        config()->set('auth_mfa.monitor.enabled', true);
        config()->set('auth_mfa.monitor.test_code', '123456');
        config()->set('auth_mfa.monitor.max_attempts', 2);

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'monitor@cspams.local')->firstOrFail();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        ]);

        $login->assertStatus(Response::HTTP_ACCEPTED)
            ->assertJsonPath('requiresMfa', true);

        $challengeId = (string) $login->json('mfa.challengeId');
        $this->assertNotSame('', $challengeId);

        $firstInvalid = $this->postJson('/api/auth/verify-mfa', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'challenge_id' => $challengeId,
            'code' => '000000',
        ]);
        $firstInvalid->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);

        $secondInvalid = $this->postJson('/api/auth/verify-mfa', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'challenge_id' => $challengeId,
            'code' => '111111',
        ]);
        $secondInvalid->assertStatus(Response::HTTP_TOO_MANY_REQUESTS);

        $notification = $monitor->fresh()->notifications()
            ->where('type', AuthSecurityAlertNotification::class)
            ->latest('id')
            ->get()
            ->first(static fn (mixed $item): bool => data_get($item, 'data.action') === 'auth.mfa_verify.locked_out');

        $this->assertNotNull($notification);
        $this->assertSame('auth_security_alert', data_get($notification?->data, 'eventType'));
        $this->assertSame('high', data_get($notification?->data, 'severity'));
        $this->assertSame('auth.mfa_verify.locked_out', data_get($notification?->data, 'action'));
    }
}
