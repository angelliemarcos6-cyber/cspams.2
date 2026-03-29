<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\Auth\SchoolHeadAccountSetupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class AuthPasswordResetPolicyTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_school_head_account_must_complete_setup_link_before_login(): void
    {
        $this->seed();

        $schoolCode = '103811';
        $newPassword = 'NewSchool@2026!123';

        /** @var User $schoolHead */
        $schoolHead = User::query()
            ->whereHas('school', static fn ($query) => $query->where('school_code', $schoolCode))
            ->firstOrFail();
        $schoolHead->forceFill([
            'password' => Hash::make('TempSetup@123'),
            'must_reset_password' => true,
            'password_changed_at' => null,
            'account_status' => 'pending_setup',
        ])->save();

        /** @var SchoolHeadAccountSetupService $setupService */
        $setupService = app(SchoolHeadAccountSetupService::class);
        $issuedSetup = $setupService->issue($schoolHead);

        $blockedLogin = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => 'TempSetup@123',
        ]);

        $blockedLogin->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath('requiresAccountSetup', true);

        $setup = $this->postJson('/api/auth/setup-account', [
            'token' => $issuedSetup['plainToken'],
            'password' => $newPassword,
            'password_confirmation' => $newPassword,
        ]);

        $setup->assertOk()
            ->assertJsonPath(
                'message',
                'Account setup completed. Your Division Monitor must verify and activate your account before sign-in.',
            );

        $schoolHead->refresh();
        $this->assertSame('pending_verification', $schoolHead->accountStatus()->value);
        $this->assertFalse((bool) $schoolHead->must_reset_password);

        $blockedPendingApproval = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $newPassword,
        ]);

        $blockedPendingApproval->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath('requiresMonitorApproval', true);

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();

        $monitorToken = (string) $monitorLogin->json('token');

        $activate = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$schoolHead->school_id}/school-head-account/activate",
            ['reason' => 'Setup reviewed and approved by monitor.'],
        );

        $activate->assertOk()
            ->assertJsonPath('data.account.accountStatus', 'active');

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $newPassword,
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.mustResetPassword', false);
    }

    public function test_setup_account_returns_service_unavailable_when_setup_token_storage_is_missing(): void
    {
        $this->seed();

        Schema::dropIfExists('account_setup_tokens');

        $response = $this->postJson('/api/auth/setup-account', [
            'token' => '1.invalid-token',
            'password' => 'NewSchool@2026!123',
            'password_confirmation' => 'NewSchool@2026!123',
        ]);

        $response->assertStatus(Response::HTTP_SERVICE_UNAVAILABLE)
            ->assertJsonPath('message', 'Account setup token storage is unavailable. Run database migrations first.');
    }
}
