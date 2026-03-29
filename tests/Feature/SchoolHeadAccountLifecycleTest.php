<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\User;
use App\Support\Auth\SchoolHeadAccountSetupService;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\AccountStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class SchoolHeadAccountLifecycleTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_school_head_setup_completion_moves_account_to_pending_verification(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();

        /** @var School $school */
        $school = School::query()->where('school_code', '900002')->firstOrFail();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();

        $this->assertSame(AccountStatus::PENDING_SETUP, $schoolHead->accountStatus());

        /** @var SchoolHeadAccountSetupService $service */
        $service = app(SchoolHeadAccountSetupService::class);
        $issued = $service->issue($schoolHead, $monitor, '127.0.0.1', 'PHPUnit');

        $response = $this->postJson('/api/auth/setup-account', [
            'token' => $issued['plainToken'],
            'password' => 'NewStrongPass@123',
            'password_confirmation' => 'NewStrongPass@123',
        ]);

        $response->assertOk();
        $response->assertJsonFragment([
            'message' => 'Account setup completed. Your Division Monitor must verify and activate your account before sign-in.',
        ]);

        $schoolHead->refresh();
        $this->assertSame(AccountStatus::PENDING_VERIFICATION, $schoolHead->accountStatus());
        $this->assertNotNull($schoolHead->email_verified_at);
        $this->assertNotNull($schoolHead->password_changed_at);
        $this->assertFalse((bool) $schoolHead->must_reset_password);
        $this->assertNull($schoolHead->verified_by_user_id);
        $this->assertNull($schoolHead->verified_at);
    }

    public function test_pending_verification_school_head_cannot_login(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        $schoolHead->forceFill([
            'account_status' => AccountStatus::PENDING_VERIFICATION->value,
        ])->save();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;

        $response = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
        ]);

        $response->assertStatus(Response::HTTP_FORBIDDEN);
        $response->assertJsonFragment([
            'requiresMonitorApproval' => true,
            'accountStatus' => AccountStatus::PENDING_VERIFICATION->value,
        ]);
    }

    public function test_monitor_can_activate_pending_verification_account(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        $schoolHead->forceFill([
            'account_status' => AccountStatus::PENDING_VERIFICATION->value,
            'must_reset_password' => false,
            'password_changed_at' => now(),
            'email_verified_at' => now(),
            'verified_by_user_id' => null,
            'verified_at' => null,
            'verification_notes' => null,
        ])->save();

        $response = $this->actingAs($monitor, 'sanctum')->postJson(
            '/api/dashboard/records/' . $schoolHead->school_id . '/school-head-account/activate',
            ['reason' => 'Approved after monitor review.'],
        );

        $response->assertOk();
        $response->assertJsonPath('data.account.accountStatus', AccountStatus::ACTIVE->value);

        $schoolHead->refresh();
        $this->assertSame(AccountStatus::ACTIVE, $schoolHead->accountStatus());
        $this->assertSame($monitor->id, $schoolHead->verified_by_user_id);
        $this->assertNotNull($schoolHead->verified_at);
        $this->assertSame('Approved after monitor review.', $schoolHead->verification_notes);
    }

    public function test_activated_school_head_can_login(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->loadMissing('school');

        // schoolhead1 is seeded as active (900001 quick demo account)
        $this->assertSame(AccountStatus::ACTIVE, $schoolHead->accountStatus());

        $schoolCode = (string) $schoolHead->school?->school_code;

        $response = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
        ]);

        $response->assertOk();
    }

    public function test_password_reset_is_blocked_for_pending_verification_account(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        $schoolHead->forceFill([
            'account_status' => AccountStatus::PENDING_VERIFICATION->value,
        ])->save();

        // IssueSchoolHeadPasswordResetLinkRequest requires verificationChallengeId and
        // verificationCode to pass validation. Provide format-valid dummies so that
        // FormRequest validation passes and the controller's status guard fires first.
        $response = $this->actingAs($monitor, 'sanctum')->postJson(
            '/api/dashboard/records/' . $schoolHead->school_id . '/school-head-account/password-reset-link',
            [
                'reason' => 'Test reset attempt.',
                'verificationChallengeId' => '00000000-0000-0000-0000-000000000000',
                'verificationCode' => '000000',
            ],
        );

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);
        $response->assertJsonFragment([
            'message' => 'This account is waiting for Division Monitor activation. Activate the account or reissue setup instead of sending a password reset link.',
        ]);
    }

    public function test_password_reset_is_blocked_for_non_active_accounts(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->forceFill([
            'account_status' => AccountStatus::SUSPENDED->value,
        ])->save();

        $response = $this->actingAs($monitor, 'sanctum')->postJson(
            '/api/dashboard/records/' . $schoolHead->school_id . '/school-head-account/password-reset-link',
            [
                'reason' => 'Test reset attempt on suspended account.',
                'verificationChallengeId' => '00000000-0000-0000-0000-000000000000',
                'verificationCode' => '000000',
            ],
        );

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);
        $response->assertJsonFragment([
            'message' => 'Password reset links can only be issued for active School Head accounts.',
        ]);
    }

    public function test_generic_status_update_cannot_activate_pending_verification_account(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        $schoolHead->forceFill([
            'account_status' => AccountStatus::PENDING_VERIFICATION->value,
            'must_reset_password' => false,
            'password_changed_at' => now(),
            'email_verified_at' => now(),
        ])->save();

        // The controller blocks pending_verification → active via the generic route.
        // Activation must go through /school-head-account/activate instead.
        $response = $this->actingAs($monitor, 'sanctum')->patchJson(
            '/api/dashboard/records/' . $schoolHead->school_id . '/school-head-account',
            [
                'accountStatus' => AccountStatus::ACTIVE->value,
                'reason' => 'Trying to activate via generic route.',
            ],
        );

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);
        $response->assertJsonFragment(['message' => 'Use the Activate Account action after reviewing this setup.']);

        $schoolHead->refresh();
        $this->assertSame(AccountStatus::PENDING_VERIFICATION, $schoolHead->accountStatus());
    }

    public function test_generic_patch_can_reactivate_suspended_account(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->forceFill([
            'account_status' => AccountStatus::SUSPENDED->value,
            'must_reset_password' => false,
            'password_changed_at' => now(),
            'email_verified_at' => now(),
            'verified_by_user_id' => $monitor->id,
            'verified_at' => now(),
        ])->save();

        // Reactivating suspended/locked/archived accounts goes through the generic PATCH route.
        // This is intentional — there is no dedicated reactivation endpoint.
        $response = $this->actingAs($monitor, 'sanctum')->patchJson(
            '/api/dashboard/records/' . $schoolHead->school_id . '/school-head-account',
            [
                'accountStatus' => AccountStatus::ACTIVE->value,
                'reason' => 'Reactivating suspended account after review.',
            ],
        );

        $response->assertOk();
        $response->assertJsonPath('data.account.accountStatus', AccountStatus::ACTIVE->value);

        $schoolHead->refresh();
        $this->assertSame(AccountStatus::ACTIVE, $schoolHead->accountStatus());
    }
}
