<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\Auth\SchoolHeadAccountSetupService;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\AccountStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class SchoolHeadAccountAuthHardeningTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_account_setup_tokens_table_exists_after_migrations(): void
    {
        $this->assertTrue(Schema::hasTable('account_setup_tokens'));
    }

    public function test_complete_account_setup_succeeds_when_role_exists_but_account_type_is_stale(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        $schoolHead->forceFill([
            'account_type' => UserRoleResolver::MONITOR,
        ])->save();

        /** @var SchoolHeadAccountSetupService $setupService */
        $setupService = app(SchoolHeadAccountSetupService::class);
        $issuedSetup = $setupService->issue($schoolHead);

        $response = $this->postJson('/api/auth/setup-account', [
            'token' => $issuedSetup['plainToken'],
            'password' => 'DriftRepair@2026!',
            'password_confirmation' => 'DriftRepair@2026!',
        ]);

        $response->assertOk()
            ->assertJsonPath(
                'message',
                'Account setup completed. Your Division Monitor must verify and activate your account before sign-in.',
            );

        $schoolHead->refresh();
        $this->assertSame(UserRoleResolver::SCHOOL_HEAD, $schoolHead->account_type);
        $this->assertSame(AccountStatus::PENDING_VERIFICATION, $schoolHead->accountStatus());
    }

    public function test_complete_account_setup_repairs_missing_school_head_role_when_account_type_is_stale(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        $schoolHead->syncRoles([]);
        $schoolHead->forceFill([
            'account_type' => UserRoleResolver::SCHOOL_HEAD,
        ])->save();

        /** @var SchoolHeadAccountSetupService $setupService */
        $setupService = app(SchoolHeadAccountSetupService::class);
        $issuedSetup = $setupService->issue($schoolHead);

        $response = $this->postJson('/api/auth/setup-account', [
            'token' => $issuedSetup['plainToken'],
            'password' => 'RoleRepair@2026!',
            'password_confirmation' => 'RoleRepair@2026!',
        ]);

        $response->assertOk();

        $schoolHead->refresh();
        $this->assertTrue($schoolHead->hasRole(UserRoleResolver::SCHOOL_HEAD));
        $this->assertSame(UserRoleResolver::SCHOOL_HEAD, $schoolHead->account_type);
        $this->assertSame(AccountStatus::PENDING_VERIFICATION, $schoolHead->accountStatus());
    }

    public function test_complete_account_setup_still_fails_when_school_head_markers_are_invalid(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        $schoolHead->syncRoles([]);
        $schoolHead->forceFill([
            'account_type' => UserRoleResolver::MONITOR,
        ])->save();

        /** @var SchoolHeadAccountSetupService $setupService */
        $setupService = app(SchoolHeadAccountSetupService::class);
        $issuedSetup = $setupService->issue($schoolHead);

        $response = $this->postJson('/api/auth/setup-account', [
            'token' => $issuedSetup['plainToken'],
            'password' => 'InvalidMarkers@2026!',
            'password_confirmation' => 'InvalidMarkers@2026!',
        ]);

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'This setup link is no longer valid for account activation.');
    }

    public function test_school_head_login_accepts_exact_six_digit_school_code(): void
    {
        $this->seed();

        $response = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => '900001',
            'password' => $this->demoPasswordForLogin('school_head', '900001'),
        ]);

        $response->assertOk()
            ->assertJsonPath('user.role', 'school_head');
    }

    public function test_school_head_login_accepts_school_code_with_spaces(): void
    {
        $this->seed();

        $response = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => '  900001  ',
            'password' => $this->demoPasswordForLogin('school_head', '900001'),
        ]);

        $response->assertOk()
            ->assertJsonPath('user.role', 'school_head');
    }

    public function test_school_head_login_accepts_safe_separator_formatting_noise(): void
    {
        $this->seed();

        $response = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => '900-001',
            'password' => $this->demoPasswordForLogin('school_head', '900001'),
        ]);

        $response->assertOk()
            ->assertJsonPath('user.role', 'school_head');
    }

    public function test_school_head_login_rejects_invalid_school_code_lengths(): void
    {
        $this->seed();

        $tooShort = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => '90001',
            'password' => 'irrelevant',
        ]);

        $tooShort->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'School code must be exactly 6 digits.');

        $tooLong = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => '9000001',
            'password' => 'irrelevant',
        ]);

        $tooLong->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'School code must be exactly 6 digits.');
    }

    public function test_school_head_login_rejects_alphanumeric_formatting_noise(): void
    {
        $this->seed();

        $response = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => '900A01',
            'password' => 'irrelevant',
        ]);

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'School code must contain only digits.');
    }
}
