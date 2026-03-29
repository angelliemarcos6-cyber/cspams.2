<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\Domain\AccountStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class AuthAccountStatusPolicyTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    #[DataProvider('blockedStatusesProvider')]
    public function test_monitor_login_is_blocked_for_non_active_account_states(string $status): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();
        $monitor->forceFill(['account_status' => $status])->save();

        $response = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);

        $response->assertStatus(Response::HTTP_FORBIDDEN);

        /** @var AuditLog $audit */
        $audit = AuditLog::query()
            ->where('action', 'auth.login.failed')
            ->where('user_id', $monitor->id)
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('account_not_active', data_get($audit->metadata, 'reason'));
        $this->assertSame($status, data_get($audit->metadata, 'account_status'));
    }

    #[DataProvider('blockedStatusesProvider')]
    public function test_school_head_login_is_blocked_for_non_active_account_states(string $status): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->forceFill(['account_status' => $status])->save();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);

        $response = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
        ]);

        $response->assertStatus(Response::HTTP_FORBIDDEN);

        /** @var AuditLog $audit */
        $audit = AuditLog::query()
            ->where('action', 'auth.login.failed')
            ->where('user_id', $schoolHead->id)
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('account_not_active', data_get($audit->metadata, 'reason'));
        $this->assertSame($status, data_get($audit->metadata, 'account_status'));
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function blockedStatusesProvider(): array
    {
        return [
            'pending_setup' => [AccountStatus::PENDING_SETUP->value],
            'pending_verification' => [AccountStatus::PENDING_VERIFICATION->value],
            'suspended' => [AccountStatus::SUSPENDED->value],
            'locked' => [AccountStatus::LOCKED->value],
            'archived' => [AccountStatus::ARCHIVED->value],
        ];
    }
}

