<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\Auth\SchoolHeadAccountSetupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class AuthPasswordResetPolicyTest extends TestCase
{
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
            ->assertJsonPath('user.mustResetPassword', false)
            ->assertJsonPath('user.accountStatus', 'active');

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $newPassword,
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.mustResetPassword', false);
    }
}
