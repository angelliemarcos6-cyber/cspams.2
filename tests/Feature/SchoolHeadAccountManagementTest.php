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
            ->assertJsonPath('meta.schoolHeadAccount.email', 'setup.head@cspams.local')
            ->assertJsonPath('meta.schoolHeadAccount.onboardingFlow', 'temporary_password')
            ->assertJsonPath('meta.schoolHeadAccount.lifecycleState', 'temporary_password_active')
            ->assertJsonPath('meta.schoolHeadAccount.recommendedAction', 'none')
            ->assertJsonPath('meta.schoolHeadAccount.temporaryPasswordExpired', false);

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
        $this->assertNotNull($schoolHead->temporary_password_issued_at);
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
        $this->assertNull($schoolHead->temporary_password_issued_at);

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
        $this->assertSame('active_ready', data_get($createdRecord, 'schoolHeadAccount.lifecycleState'));
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

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        $records = $this->withToken($monitorToken)->getJson('/api/dashboard/records');
        $records->assertOk();
        $record = collect((array) $records->json('data'))
            ->firstWhere('schoolId', (string) $school->school_code);
        $this->assertIsArray($record);
        $this->assertSame('setup_link', data_get($record, 'schoolHeadAccount.onboardingFlow'));
        $this->assertSame('pending_verification', data_get($record, 'schoolHeadAccount.lifecycleState'));
        $this->assertSame('activate_account', data_get($record, 'schoolHeadAccount.recommendedAction'));

        $blockedLogin = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => '103811',
            'password' => $newPassword,
        ]);

        $blockedLogin->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath('requiresMonitorApproval', true)
            ->assertJsonPath('accountStatus', AccountStatus::PENDING_VERIFICATION->value);

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
            ->assertJsonPath('data.account.mustResetPassword', true)
            ->assertJsonPath('data.account.onboardingFlow', 'standard')
            ->assertJsonPath('data.account.lifecycleState', 'password_reset_required')
            ->assertJsonPath('data.account.recommendedAction', 'send_password_reset_link')
            ->assertJsonPath('data.account.temporaryPasswordIssuedAt', null)
            ->assertJsonPath('data.account.temporaryPasswordExpiresAt', null)
            ->assertJsonPath('data.account.temporaryPasswordExpired', false);

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
        $this->assertNotNull($schoolHead->temporary_password_issued_at);
    }

    public function test_monitor_can_regenerate_temporary_password_for_active_school_head_account(): void
    {
        $this->seed();
        config()->set('auth_mfa.monitor.test_code', '123456');

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var School $school */
        $school = School::query()->findOrFail($schoolHead->school_id);
        $schoolCode = (string) $school->school_code;
        $oldPassword = $this->demoPasswordForLogin('school_head', $schoolCode);
        $oldPasswordHash = (string) $schoolHead->password;
        $expiredIssuedAt = now()->subDays(10);
        $schoolHead->forceFill([
            'temporary_password_issued_at' => $expiredIssuedAt,
        ])->save();

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        $issueCode = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/verification-code",
            [
                'targetStatus' => 'temporary_password',
            ],
        );

        $issueCode->assertOk()->assertJsonStructure(['data' => ['challengeId', 'expiresAt']]);
        $challengeId = (string) $issueCode->json('data.challengeId');

        $regenerate = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/temporary-password",
            [
                'reason' => 'School Head did not receive the original bootstrap password.',
                'verificationChallengeId' => $challengeId,
                'verificationCode' => '123456',
            ],
        );

        $regenerate->assertOk()
            ->assertJsonPath('data.account.accountStatus', AccountStatus::ACTIVE->value)
            ->assertJsonPath('data.account.mustResetPassword', true)
            ->assertJsonPath('data.account.onboardingFlow', 'temporary_password')
            ->assertJsonPath('data.account.lifecycleState', 'temporary_password_active')
            ->assertJsonPath('data.account.temporaryPasswordExpired', false);

        /** @var array<string, mixed> $receipt */
        $receipt = (array) $regenerate->json('data');
        $this->assertMatchesRegularExpression('/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{8}$/', (string) $receipt['temporaryPassword']);

        $schoolHead->refresh();
        $this->assertTrue((bool) $schoolHead->must_reset_password);
        $this->assertTrue(Hash::check((string) $receipt['temporaryPassword'], (string) $schoolHead->password));
        $this->assertNotSame($oldPasswordHash, (string) $schoolHead->password);
        $this->assertNotNull($schoolHead->temporary_password_issued_at);
        $this->assertTrue($schoolHead->temporary_password_issued_at->greaterThan($expiredIssuedAt));

        $records = $this->withToken($monitorToken)->getJson('/api/dashboard/records');
        $records->assertOk();
        $record = collect((array) $records->json('data'))->firstWhere('id', (string) $school->id);
        $this->assertIsArray($record);
        $this->assertArrayNotHasKey('temporaryPassword', (array) ($record['schoolHeadAccount'] ?? []));

        $oldLogin = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolHead->email,
            'password' => $oldPassword,
        ]);

        $oldLogin->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'Invalid School Head email/school code or password.');

        $tempLogin = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolHead->email,
            'password' => (string) $receipt['temporaryPassword'],
        ]);

        $tempLogin->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath('requiresPasswordReset', true);

        $resetRequired = $this->postJson('/api/auth/reset-required-password', [
            'role' => 'school_head',
            'login' => $schoolHead->email,
            'current_password' => (string) $receipt['temporaryPassword'],
            'new_password' => 'UpdatedSchool@2026!123',
            'new_password_confirmation' => 'UpdatedSchool@2026!123',
        ]);

        $resetRequired->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.mustResetPassword', false);

        $schoolHead->refresh();
        $this->assertFalse((bool) $schoolHead->must_reset_password);
        $this->assertNull($schoolHead->temporary_password_issued_at);

        $newLogin = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolHead->email,
            'password' => 'UpdatedSchool@2026!123',
        ]);

        $newLogin->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.email', $schoolHead->email);
    }

    public function test_monitor_cannot_regenerate_temporary_password_for_non_active_school_head_accounts(): void
    {
        $this->seed();

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

        $cases = [
            AccountStatus::PENDING_SETUP->value => 'Accounts pending setup should continue using setup links until setup is completed.',
            AccountStatus::PENDING_VERIFICATION->value => 'Activate the account before issuing a new temporary password.',
            AccountStatus::LOCKED->value => 'Temporary passwords can only be regenerated for active School Head accounts.',
            AccountStatus::SUSPENDED->value => 'Temporary passwords can only be regenerated for active School Head accounts.',
            AccountStatus::ARCHIVED->value => 'Temporary passwords can only be regenerated for active School Head accounts.',
        ];

        foreach ($cases as $status => $message) {
            $schoolHead->forceFill([
                'account_status' => $status,
                'must_reset_password' => false,
                'temporary_password_issued_at' => null,
            ])->save();

            $response = $this->withToken($monitorToken)->postJson(
                "/api/dashboard/records/{$school->id}/school-head-account/temporary-password",
                [
                    'reason' => 'Need a replacement bootstrap credential.',
                    'verificationChallengeId' => '11111111-1111-1111-1111-111111111111',
                    'verificationCode' => '123456',
                ],
            );

            $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
                ->assertJsonPath('message', $message);
        }
    }

    public function test_expired_temporary_password_is_rejected_until_monitor_regenerates_a_new_one(): void
    {
        $this->seed();

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        $response = $this->withToken($monitorToken)->postJson('/api/dashboard/records', [
            'schoolId' => '933333',
            'schoolName' => 'Expired Temp Password School',
            'level' => 'Elementary',
            'type' => 'public',
            'district' => 'District Test',
            'region' => 'Region Test',
            'address' => 'District Test, Region Test',
            'studentCount' => 0,
            'teacherCount' => 0,
            'status' => 'active',
            'schoolHeadAccount' => [
                'name' => 'Expired Temp Head',
                'email' => 'expired.temp.head@cspams.local',
            ],
        ]);

        /** @var array<string, mixed> $provisioning */
        $provisioning = (array) $response->json('meta.schoolHeadAccount');

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'expired.temp.head@cspams.local')->firstOrFail();
        $schoolHead->forceFill([
            'temporary_password_issued_at' => now()->subHours(73),
        ])->save();

        $expiredLogin = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => 'expired.temp.head@cspams.local',
            'password' => (string) $provisioning['temporaryPassword'],
        ]);

        $expiredLogin->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath(
                'message',
                'Temporary password has expired. Ask your Division Monitor to issue a new temporary password.',
            )
            ->assertJsonMissing(['requiresPasswordReset' => true]);

        $records = $this->withToken($monitorToken)->getJson('/api/dashboard/records');
        $records->assertOk();
        $record = collect((array) $records->json('data'))->firstWhere('schoolId', '933333');
        $this->assertIsArray($record);
        $this->assertSame('temporary_password_expired', data_get($record, 'schoolHeadAccount.lifecycleState'));
        $this->assertSame('regenerate_temporary_password', data_get($record, 'schoolHeadAccount.recommendedAction'));
        $this->assertTrue((bool) data_get($record, 'schoolHeadAccount.temporaryPasswordExpired'));

        $expiredResetAttempt = $this->postJson('/api/auth/reset-required-password', [
            'role' => 'school_head',
            'login' => 'expired.temp.head@cspams.local',
            'current_password' => (string) $provisioning['temporaryPassword'],
            'new_password' => 'ExpiredBlocked@2026!123',
            'new_password_confirmation' => 'ExpiredBlocked@2026!123',
        ]);

        $expiredResetAttempt->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath(
                'message',
                'Temporary password has expired. Ask your Division Monitor to issue a new temporary password.',
            );
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
            ->assertJsonPath('data.account.accountStatus', AccountStatus::PENDING_SETUP->value)
            ->assertJsonPath('data.account.onboardingFlow', 'setup_link')
            ->assertJsonPath('data.account.lifecycleState', 'pending_setup')
            ->assertJsonPath('data.account.recommendedAction', 'send_setup_link');

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

