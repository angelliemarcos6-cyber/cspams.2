<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\User;
use App\Models\AccountSetupToken;
use App\Notifications\SchoolHeadPasswordResetNotification;
use App\Support\Auth\SchoolHeadAccountSetupService;
use App\Support\Domain\AccountStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class SchoolHeadAccountManagementTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_monitor_can_create_school_head_with_temporary_password_and_required_first_login_reset(): void
    {
        $this->seed();
        Notification::fake();

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        $response = $this->withToken($monitorToken)->postJson('/api/dashboard/records', [
            'schoolId' => '911111',
            'schoolName' => 'Test Setup Link School',
            'level' => 'Elementary',
            'type' => 'public',
            'district' => 'District Test',
            'region' => 'Region Test',
            'address' => 'District Test, Region Test',
            'studentCount' => 0,
            'teacherCount' => 0,
            'status' => 'active',
            'schoolHeadAccount' => [
                'name' => 'Setup Link Head',
                'email' => 'setup.head@cspams.local',
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('meta.schoolHeadAccount.accountStatus', AccountStatus::ACTIVE->value)
            ->assertJsonPath('meta.schoolHeadAccount.mustResetPassword', true)
            ->assertJsonPath('meta.schoolHeadAccount.email', 'setup.head@cspams.local');

        /** @var array<string, mixed> $provisioning */
        $provisioning = (array) $response->json('meta.schoolHeadAccount');
        $this->assertArrayHasKey('temporaryPassword', $provisioning);
        $this->assertIsString($provisioning['temporaryPassword']);
        $this->assertMatchesRegularExpression('/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{8}$/', (string) $provisioning['temporaryPassword']);

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'setup.head@cspams.local')->firstOrFail();
        $this->assertSame(AccountStatus::ACTIVE->value, $schoolHead->accountStatus()->value);
        $this->assertTrue((bool) $schoolHead->must_reset_password);
        $this->assertNotNull($schoolHead->password_changed_at);
        $this->assertNotNull($schoolHead->email_verified_at);
        $this->assertNotNull($schoolHead->verified_by_user_id);
        $this->assertNotNull($schoolHead->verified_at);
        $this->assertTrue(Hash::check((string) $provisioning['temporaryPassword'], (string) $schoolHead->password));
        $this->assertNotSame((string) $provisioning['temporaryPassword'], (string) $schoolHead->password);

        Notification::assertNothingSent();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => 'setup.head@cspams.local',
            'password' => (string) $provisioning['temporaryPassword'],
        ]);

        $login->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath('requiresPasswordReset', true)
            ->assertJsonPath('message', 'Password reset is required before dashboard access.');

        $resetRequired = $this->postJson('/api/auth/reset-required-password', [
            'role' => 'school_head',
            'login' => 'setup.head@cspams.local',
            'current_password' => (string) $provisioning['temporaryPassword'],
            'new_password' => 'NewSchool@2026!123',
            'new_password_confirmation' => 'NewSchool@2026!123',
        ]);

        $resetRequired->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.email', 'setup.head@cspams.local')
            ->assertJsonPath('user.mustResetPassword', false);

        $schoolHead->refresh();
        $this->assertFalse((bool) $schoolHead->must_reset_password);

        $loginWithNewPassword = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => 'setup.head@cspams.local',
            'password' => 'NewSchool@2026!123',
        ]);

        $loginWithNewPassword->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.email', 'setup.head@cspams.local')
            ->assertJsonPath('user.mustResetPassword', false);

        $records = $this->withToken($monitorToken)->getJson('/api/dashboard/records');
        $records->assertOk();

        $createdRecord = collect($records->json('data'))
            ->firstWhere('schoolId', '911111');

        $this->assertIsArray($createdRecord);
        $this->assertArrayNotHasKey('temporaryPassword', (array) ($createdRecord['schoolHeadAccount'] ?? []));
    }

    public function test_school_head_setup_completion_requires_monitor_activation_before_login(): void
    {
        $this->seed();

        $newPassword = 'PendingVerify@2026!';

        /** @var User $schoolHead */
        $schoolHead = User::query()
            ->where('email', 'schoolhead.103811@cspams.local')
            ->firstOrFail();
        /** @var School $school */
        $school = School::query()->findOrFail($schoolHead->school_id);

        /** @var SchoolHeadAccountSetupService $setupService */
        $setupService = app(SchoolHeadAccountSetupService::class);
        $issuedSetup = $setupService->issue($schoolHead);

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
        $this->assertSame(AccountStatus::PENDING_VERIFICATION->value, $schoolHead->accountStatus()->value);
        $this->assertNull($schoolHead->verified_by_user_id);
        $this->assertNull($schoolHead->verified_at);

        $blockedLogin = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => '103811',
            'password' => $newPassword,
        ]);

        $blockedLogin->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath('requiresMonitorApproval', true)
            ->assertJsonPath('accountStatus', AccountStatus::PENDING_VERIFICATION->value);

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        $activate = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/activate",
            ['reason' => 'Verified after reviewing School Head onboarding details.'],
        );

        $activate->assertOk()
            ->assertJsonPath('data.account.accountStatus', AccountStatus::ACTIVE->value)
            ->assertJsonPath('data.account.verifiedByName', 'Division Monitor');

        $schoolHead->refresh();
        $this->assertSame(AccountStatus::ACTIVE->value, $schoolHead->accountStatus()->value);
        $this->assertNotNull($schoolHead->verified_by_user_id);
        $this->assertNotNull($schoolHead->verified_at);

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => '103811',
            'password' => $newPassword,
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'school_head');
    }

    public function test_monitor_can_update_school_head_status_and_issue_password_reset_link(): void
    {
        $this->seed();
        Notification::fake();
        config()->set('auth_mfa.monitor.test_code', '123456');

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var School $school */
        $school = School::query()->findOrFail($schoolHead->school_id);

        $codeIssue = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/verification-code",
            [
                'targetStatus' => AccountStatus::SUSPENDED->value,
            ],
        );

        $codeIssue->assertOk()->assertJsonStructure(['data' => ['challengeId', 'expiresAt']]);
        $challengeId = (string) $codeIssue->json('data.challengeId');
        $this->assertNotSame('', $challengeId);

        $suspend = $this->withToken($monitorToken)->patchJson(
            "/api/dashboard/records/{$school->id}/school-head-account",
            [
                'accountStatus' => AccountStatus::SUSPENDED->value,
                'flagged' => true,
                'reason' => 'Repeated incomplete submissions from this account.',
                'verificationChallengeId' => $challengeId,
                'verificationCode' => '123456',
            ],
        );

        $suspend->assertOk()
            ->assertJsonPath('data.account.accountStatus', AccountStatus::SUSPENDED->value)
            ->assertJsonPath('data.account.flagged', true);

        $schoolHead->refresh();
        $this->assertSame(AccountStatus::SUSPENDED->value, $schoolHead->accountStatus()->value);
        $this->assertNotNull($schoolHead->flagged_at);
        $this->assertSame('Repeated incomplete submissions from this account.', $schoolHead->flagged_reason);

        $activate = $this->withToken($monitorToken)->patchJson(
            "/api/dashboard/records/{$school->id}/school-head-account",
            [
                'accountStatus' => AccountStatus::ACTIVE->value,
                'flagged' => false,
                'reason' => 'Issue resolved after monitor verification.',
            ],
        );

        $activate->assertOk()
            ->assertJsonPath('data.account.accountStatus', AccountStatus::ACTIVE->value)
            ->assertJsonPath('data.account.flagged', false);

        $flagDelete = $this->withToken($monitorToken)->patchJson(
            "/api/dashboard/records/{$school->id}/school-head-account",
            [
                'deleteRecordFlagged' => true,
                'reason' => 'Duplicate account record flagged for deletion.',
            ],
        );

        $flagDelete->assertOk()
            ->assertJsonPath('data.account.deleteRecordFlagged', true)
            ->assertJsonPath('data.account.deleteRecordReason', 'Duplicate account record flagged for deletion.');

        $schoolHead->refresh();
        $this->assertNotNull($schoolHead->delete_record_flagged_at);
        $this->assertSame('Duplicate account record flagged for deletion.', $schoolHead->delete_record_flag_reason);

        $unflagDelete = $this->withToken($monitorToken)->patchJson(
            "/api/dashboard/records/{$school->id}/school-head-account",
            [
                'deleteRecordFlagged' => false,
                'reason' => 'Deletion flag cleared after account validation.',
            ],
        );

        $unflagDelete->assertOk()
            ->assertJsonPath('data.account.deleteRecordFlagged', false);

        $schoolHead->refresh();
        $this->assertNull($schoolHead->delete_record_flagged_at);
        $this->assertNull($schoolHead->delete_record_flag_reason);

        $resetCodeIssue = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/verification-code",
            [
                'targetStatus' => 'password_reset',
            ],
        );

        $resetCodeIssue->assertOk()->assertJsonStructure(['data' => ['challengeId', 'expiresAt']]);
        $resetChallengeId = (string) $resetCodeIssue->json('data.challengeId');
        $this->assertNotSame('', $resetChallengeId);

        $resetLink = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/password-reset-link",
            [
                'reason' => 'Password reset requested by the school head.',
                'verificationChallengeId' => $resetChallengeId,
                'verificationCode' => '123456',
            ],
        );

        $resetLink->assertStatus(Response::HTTP_OK)
            ->assertJsonPath('data.account.accountStatus', AccountStatus::ACTIVE->value)
            ->assertJsonPath('data.account.mustResetPassword', true);

        /** @var array<string, mixed> $resetPayload */
        $resetPayload = (array) $resetLink->json('data');
        $this->assertArrayNotHasKey('resetLink', $resetPayload);

        Notification::assertSentTo($schoolHead, SchoolHeadPasswordResetNotification::class);
        $sent = Notification::sent($schoolHead, SchoolHeadPasswordResetNotification::class);
        /** @var SchoolHeadPasswordResetNotification|null $notification */
        $notification = $sent->last();
        $resetUrl = (string) ($notification?->toMail($schoolHead)->actionUrl ?? '');
        $this->assertNotSame('', $resetUrl);

        $schoolHead->refresh();
        $this->assertSame(AccountStatus::ACTIVE->value, $schoolHead->accountStatus()->value);
        $this->assertTrue((bool) $schoolHead->must_reset_password);
    }

    public function test_reissuing_setup_link_returns_service_unavailable_when_account_setup_token_storage_is_missing(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var School $school */
        $school = School::query()->findOrFail($schoolHead->school_id);

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        Schema::dropIfExists('account_setup_tokens');

        $response = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/setup-link",
            [
                'reason' => 'Re-onboarding requested by monitor.',
            ],
        );

        $response->assertStatus(Response::HTTP_SERVICE_UNAVAILABLE)
            ->assertJsonPath('message', 'Account setup token storage is unavailable. Run database migrations first.');
    }

    public function test_creating_school_head_account_still_works_when_account_setup_token_storage_is_missing(): void
    {
        $this->seed();

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        Schema::dropIfExists('account_setup_tokens');

        $response = $this->withToken($monitorToken)->postJson('/api/dashboard/records', [
            'schoolId' => '922222',
            'schoolName' => 'No Token Storage School',
            'level' => 'Elementary',
            'type' => 'public',
            'district' => 'District Test',
            'region' => 'Region Test',
            'address' => 'District Test, Region Test',
            'studentCount' => 0,
            'teacherCount' => 0,
            'status' => 'active',
            'schoolHeadAccount' => [
                'name' => 'No Token Head',
                'email' => 'no.token.head@cspams.local',
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('meta.schoolHeadAccount.accountStatus', AccountStatus::ACTIVE->value)
            ->assertJsonPath('meta.schoolHeadAccount.mustResetPassword', true)
            ->assertJsonPath('meta.schoolHeadAccount.email', 'no.token.head@cspams.local');

        /** @var array<string, mixed> $provisioning */
        $provisioning = (array) $response->json('meta.schoolHeadAccount');
        $this->assertMatchesRegularExpression('/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{8}$/', (string) $provisioning['temporaryPassword']);

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'no.token.head@cspams.local')->firstOrFail();
        $this->assertSame(AccountStatus::ACTIVE->value, $schoolHead->accountStatus()->value);
        $this->assertTrue((bool) $schoolHead->must_reset_password);
    }

    public function test_school_head_email_change_requires_verification_and_does_not_reissue_setup_link_for_locked_accounts(): void
    {
        $this->seed();
        Notification::fake();
        config()->set('auth_mfa.monitor.test_code', '123456');

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var School $school */
        $school = School::query()->findOrFail($schoolHead->school_id);

        $missingVerification = $this->withToken($monitorToken)->putJson(
            "/api/dashboard/records/{$school->id}/school-head-account/profile",
            [
                'name' => $schoolHead->name,
                'email' => 'changed.schoolhead@cspams.local',
                'reason' => 'School Head requested to update email.',
            ],
        );

        $missingVerification->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonValidationErrors(['verificationChallengeId', 'verificationCode']);

        $verificationCodeIssue = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/verification-code",
            [
                'targetStatus' => 'email_change',
            ],
        );

        $verificationCodeIssue->assertOk()->assertJsonStructure(['data' => ['challengeId', 'expiresAt']]);
        $challengeId = (string) $verificationCodeIssue->json('data.challengeId');
        $this->assertNotSame('', $challengeId);

        $emailChange = $this->withToken($monitorToken)->putJson(
            "/api/dashboard/records/{$school->id}/school-head-account/profile",
            [
                'name' => $schoolHead->name,
                'email' => 'changed.schoolhead@cspams.local',
                'reason' => 'School Head requested to update email.',
                'verificationChallengeId' => $challengeId,
                'verificationCode' => '123456',
            ],
        );

        $emailChange->assertOk()
            ->assertJsonPath('data.account.accountStatus', AccountStatus::PENDING_SETUP->value);

        /** @var array<string, mixed> $emailChangePayload */
        $emailChangePayload = (array) $emailChange->json('data');
        $this->assertArrayNotHasKey('setupLink', $emailChangePayload);
        $this->assertContains((string) ($emailChangePayload['delivery'] ?? ''), ['sent', 'logged']);
        $this->assertIsString($emailChangePayload['expiresAt'] ?? null);
        $this->assertNotSame('', (string) ($emailChangePayload['expiresAt'] ?? ''));

        $schoolHead->refresh();
        $this->assertSame('changed.schoolhead@cspams.local', $schoolHead->email);
        $this->assertSame(AccountStatus::PENDING_SETUP->value, $schoolHead->accountStatus()->value);
        $this->assertSame(1, AccountSetupToken::query()->where('user_id', $schoolHead->id)->count());
        $this->assertDatabaseHas('account_setup_tokens', [
            'user_id' => $schoolHead->id,
            'used_at' => null,
        ]);

        $schoolHead->forceFill(['account_status' => AccountStatus::LOCKED->value])->save();

        $lockedVerificationIssue = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/verification-code",
            [
                'targetStatus' => 'email_change',
            ],
        );

        $lockedVerificationIssue->assertOk()->assertJsonStructure(['data' => ['challengeId', 'expiresAt']]);
        $lockedChallengeId = (string) $lockedVerificationIssue->json('data.challengeId');
        $this->assertNotSame('', $lockedChallengeId);

        $lockedEmailChange = $this->withToken($monitorToken)->putJson(
            "/api/dashboard/records/{$school->id}/school-head-account/profile",
            [
                'name' => $schoolHead->name,
                'email' => 'locked.schoolhead@cspams.local',
                'reason' => 'School Head requested to update email.',
                'verificationChallengeId' => $lockedChallengeId,
                'verificationCode' => '123456',
            ],
        );

        $lockedEmailChange->assertOk()
            ->assertJsonPath('data.account.accountStatus', AccountStatus::LOCKED->value)
            ->assertJsonPath('data.delivery', null)
            ->assertJsonPath('data.expiresAt', null)
            ->assertJsonMissing(['setupLink' => null]);

        $schoolHead->refresh();
        $this->assertSame('locked.schoolhead@cspams.local', $schoolHead->email);
        $this->assertSame(AccountStatus::LOCKED->value, $schoolHead->accountStatus()->value);
        $this->assertSame(1, AccountSetupToken::query()->where('user_id', $schoolHead->id)->count());
    }

    public function test_locked_school_head_email_change_forces_password_reset_and_blocks_old_credentials_after_reactivation(): void
    {
        $this->seed();
        Notification::fake();
        config()->set('auth_mfa.monitor.test_code', '123456');

        /** @var User $schoolHead */
        $schoolHead = User::query()
            ->with('school')
            ->where('email', 'schoolhead1@cspams.local')
            ->firstOrFail();

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);
        $oldPassword = $this->demoPasswordForLogin('school_head', $schoolCode);

        /** @var School $school */
        $school = School::query()->findOrFail($schoolHead->school_id);

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        $lockCodeIssue = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/verification-code",
            [
                'targetStatus' => AccountStatus::LOCKED->value,
            ],
        );

        $lockCodeIssue->assertOk()->assertJsonStructure(['data' => ['challengeId', 'expiresAt']]);
        $lockChallengeId = (string) $lockCodeIssue->json('data.challengeId');
        $this->assertNotSame('', $lockChallengeId);

        $lockAccount = $this->withToken($monitorToken)->patchJson(
            "/api/dashboard/records/{$school->id}/school-head-account",
            [
                'accountStatus' => AccountStatus::LOCKED->value,
                'reason' => 'Account locked for email ownership transfer.',
                'verificationChallengeId' => $lockChallengeId,
                'verificationCode' => '123456',
            ],
        );

        $lockAccount->assertOk()
            ->assertJsonPath('data.account.accountStatus', AccountStatus::LOCKED->value);

        $emailCodeIssue = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/verification-code",
            [
                'targetStatus' => 'email_change',
            ],
        );

        $emailCodeIssue->assertOk()->assertJsonStructure(['data' => ['challengeId', 'expiresAt']]);
        $emailChallengeId = (string) $emailCodeIssue->json('data.challengeId');
        $this->assertNotSame('', $emailChallengeId);

        $emailChange = $this->withToken($monitorToken)->putJson(
            "/api/dashboard/records/{$school->id}/school-head-account/profile",
            [
                'name' => $schoolHead->name,
                'email' => 'transferred.schoolhead@cspams.local',
                'reason' => 'Transfer account ownership to a new School Head.',
                'verificationChallengeId' => $emailChallengeId,
                'verificationCode' => '123456',
            ],
        );

        $emailChange->assertOk()
            ->assertJsonPath('data.account.accountStatus', AccountStatus::LOCKED->value)
            ->assertJsonPath('data.account.mustResetPassword', true)
            ->assertJsonMissing(['setupLink' => null]);

        $schoolHead->refresh();
        $this->assertSame('transferred.schoolhead@cspams.local', $schoolHead->email);
        $this->assertTrue((bool) $schoolHead->must_reset_password);
        $this->assertNull($schoolHead->password_changed_at);

        $reactivateAttempt = $this->withToken($monitorToken)->patchJson(
            "/api/dashboard/records/{$school->id}/school-head-account",
            [
                'accountStatus' => AccountStatus::ACTIVE->value,
                'reason' => 'Reactivated after email transfer; password reset required.',
            ],
        );

        $reactivateAttempt->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'Password reset is required before activation. Issue a password reset link first.');

        $resetCodeIssue = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/verification-code",
            [
                'targetStatus' => 'password_reset',
            ],
        );

        $resetCodeIssue->assertOk()->assertJsonStructure(['data' => ['challengeId', 'expiresAt']]);
        $resetChallengeId = (string) $resetCodeIssue->json('data.challengeId');
        $this->assertNotSame('', $resetChallengeId);

        $resetLink = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/password-reset-link",
            [
                'reason' => 'Transfer requires password reset.',
                'verificationChallengeId' => $resetChallengeId,
                'verificationCode' => '123456',
            ],
        );

        $resetLink->assertOk()
            ->assertJsonMissing(['resetLink' => null]);

        Notification::assertSentTo($schoolHead, SchoolHeadPasswordResetNotification::class);
        $sent = Notification::sent($schoolHead, SchoolHeadPasswordResetNotification::class);
        /** @var SchoolHeadPasswordResetNotification|null $notification */
        $notification = $sent->last();
        $resetUrl = (string) ($notification?->toMail($schoolHead)->actionUrl ?? '');
        $this->assertNotSame('', $resetUrl);

        $urlParts = parse_url($resetUrl);
        $this->assertIsArray($urlParts);

        $query = [];
        $fragment = (string) ($urlParts['fragment'] ?? '');
        $fragmentQuery = '';
        if (str_contains($fragment, '?')) {
            [, $fragmentQuery] = explode('?', $fragment, 2);
        }
        parse_str($fragmentQuery, $query);

        $token = (string) ($query['token'] ?? '');
        $email = (string) ($query['email'] ?? '');
        $role = (string) ($query['role'] ?? '');

        $this->assertNotSame('', $token);
        $this->assertSame('transferred.schoolhead@cspams.local', $email);
        $this->assertSame('school_head', $role);

        $newPassword = 'NewPassword123!';

        $resetPassword = $this->postJson('/api/auth/reset-password', [
            'role' => $role,
            'email' => $email,
            'token' => $token,
            'password' => $newPassword,
            'password_confirmation' => $newPassword,
        ]);

        $resetPassword->assertOk()
            ->assertJsonPath('message', 'Password reset successfully. Please sign in with your new password.');

        $activate = $this->withToken($monitorToken)->patchJson(
            "/api/dashboard/records/{$school->id}/school-head-account",
            [
                'accountStatus' => AccountStatus::ACTIVE->value,
                'reason' => 'Activated after password reset completion.',
            ],
        );

        $activate->assertOk()
            ->assertJsonPath('data.account.accountStatus', AccountStatus::ACTIVE->value);

        $loginOld = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $oldPassword,
        ]);

        $loginOld->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'Invalid School Head email/school code or password.');

        $loginNew = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $newPassword,
        ]);

        $loginNew->assertOk();
        $this->assertNotSame('', (string) $loginNew->json('token'));
    }

    public function test_removed_school_head_account_releases_email_for_recreation(): void
    {
        $this->seed();
        Notification::fake();
        config()->set('auth_mfa.monitor.test_code', '123456');

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var School $school */
        $school = School::query()->findOrFail($schoolHead->school_id);

        $issueCode = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/verification-code",
            [
                'targetStatus' => 'deleted',
            ],
        );

        $issueCode->assertOk()->assertJsonStructure(['data' => ['challengeId', 'expiresAt']]);
        $challengeId = (string) $issueCode->json('data.challengeId');
        $this->assertNotSame('', $challengeId);

        $remove = $this->withToken($monitorToken)->deleteJson(
            "/api/dashboard/records/{$school->id}/school-head-account",
            [
                'reason' => 'Replacing archived School Head account.',
                'verificationChallengeId' => $challengeId,
                'verificationCode' => '123456',
            ],
        );

        $remove->assertOk()
            ->assertJsonPath('data.deletedCount', 1);

        $schoolHead->refresh();
        $this->assertSame(AccountStatus::ARCHIVED->value, $schoolHead->accountStatus()->value);
        $this->assertNull($schoolHead->school_id);
        $this->assertNotSame('schoolhead1@cspams.local', $schoolHead->email);
        $this->assertTrue(str_starts_with($schoolHead->email, 'archived+'));
        $this->assertTrue(str_ends_with($schoolHead->email, '@example.invalid'));

        $recreate = $this->withToken($monitorToken)->putJson(
            "/api/dashboard/records/{$school->id}/school-head-account/profile",
            [
                'name' => 'Recreated School Head',
                'email' => 'schoolhead1@cspams.local',
            ],
        );

        $recreate->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.account.email', 'schoolhead1@cspams.local')
            ->assertJsonPath('data.account.accountStatus', AccountStatus::PENDING_SETUP->value);
    }

    public function test_account_type_column_rejects_null_values(): void
    {
        $this->seed();

        if (! Schema::hasColumn('users', 'account_type')) {
            $this->markTestSkipped('Users account_type column is not available.');
        }

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();

        $this->expectException(\Illuminate\Database\QueryException::class);
        $schoolHead->forceFill(['account_type' => null])->save();
    }
}

