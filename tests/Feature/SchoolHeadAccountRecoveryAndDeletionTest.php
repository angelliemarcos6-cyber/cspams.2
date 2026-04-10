<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\School;
use App\Models\User;
use App\Notifications\SchoolHeadAccountSetupNotification;
use App\Support\Domain\AccountStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class SchoolHeadAccountRecoveryAndDeletionTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_pending_setup_setup_link_reissue_returns_explicit_recovery_action(): void
    {
        $this->seed();
        Notification::fake();

        [$monitorToken, $schoolHead, $school] = $this->monitorAndSchoolHeadFor('schoolhead2@cspams.local');

        $response = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/setup-link",
            ['reason' => 'Reissuing the initial setup link.'],
        );

        $response->assertOk()
            ->assertJsonPath('data.recoveryAction', 'reissue_setup_link')
            ->assertJsonPath('data.account.accountStatus', AccountStatus::PENDING_SETUP->value);

        Notification::assertSentTo($schoolHead, SchoolHeadAccountSetupNotification::class);
    }

    public function test_pending_verification_setup_link_requests_route_to_activation_flow(): void
    {
        $this->seed();

        [$monitorToken, $schoolHead, $school] = $this->monitorAndSchoolHeadFor('schoolhead2@cspams.local');
        $schoolHead->forceFill([
            'account_status' => AccountStatus::PENDING_VERIFICATION->value,
            'must_reset_password' => false,
            'password_changed_at' => now(),
            'email_verified_at' => now(),
        ])->save();

        $response = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/setup-link",
            ['reason' => 'Trying the wrong recovery flow.'],
        );

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('recoveryAction', 'activate_account')
            ->assertJsonPath('message', 'This account is waiting for Division Monitor activation. Use the Activate Account action instead.');
    }

    public function test_active_setup_link_requests_route_to_password_reset_flow(): void
    {
        $this->seed();

        [$monitorToken, $schoolHead, $school] = $this->monitorAndSchoolHeadFor('schoolhead1@cspams.local');
        $this->assertSame(AccountStatus::ACTIVE, $schoolHead->accountStatus());

        $response = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/setup-link",
            ['reason' => 'Operator selected setup-link by mistake.'],
        );

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('recoveryAction', 'password_reset')
            ->assertJsonPath('message', 'This account is already active. Use a password reset link instead of a setup link.');
    }

    public function test_archived_accounts_require_explicit_recovery_endpoint_before_setup_reissue(): void
    {
        $this->seed();
        Notification::fake();

        [$monitorToken, $schoolHead, $school] = $this->monitorAndSchoolHeadFor('schoolhead1@cspams.local');
        $schoolHead->forceFill([
            'account_status' => AccountStatus::ARCHIVED->value,
        ])->save();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
        ]);

        $login->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath('message', 'Your account is archived and can no longer sign in.');

        $blocked = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/setup-link",
            ['reason' => 'Admin recovery not explicitly requested.'],
        );

        $blocked->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('recoveryAction', 'archived_admin_recovery_required')
            ->assertJsonPath('message', 'Archived accounts require an explicit admin recovery action before setup can be reissued.');

        $recoveryCodeIssue = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/verification-code",
            [
                'targetStatus' => 'setup_recovery',
            ],
        );

        $recoveryCodeIssue->assertOk();
        $recoveryChallengeId = (string) $recoveryCodeIssue->json('data.challengeId');

        $recovered = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/setup-link/recover",
            [
                'reason' => 'Explicitly recovering the archived account.',
                'verificationChallengeId' => $recoveryChallengeId,
                'verificationCode' => '123456',
            ],
        );

        $recovered->assertOk()
            ->assertJsonPath('data.recoveryAction', 'admin_recovery_setup_link')
            ->assertJsonPath('data.account.accountStatus', AccountStatus::PENDING_SETUP->value);

        $schoolHead->refresh();
        $this->assertSame(AccountStatus::PENDING_SETUP, $schoolHead->accountStatus());

        Notification::assertSentTo($schoolHead, SchoolHeadAccountSetupNotification::class);
    }

    public function test_delete_is_blocked_when_monitor_access_still_exists_without_force_cleanup(): void
    {
        $this->seed();

        [$monitorToken, $schoolHead, $school] = $this->monitorAndSchoolHeadFor('schoolhead1@cspams.local');
        $schoolHead->assignRole('monitor');

        $challengeId = $this->issueDeleteVerificationCode($monitorToken, $school);

        $response = $this->withToken($monitorToken)->deleteJson(
            "/api/dashboard/records/{$school->id}/school-head-account",
            [
                'reason' => 'Attempting deletion without cleanup.',
                'verificationChallengeId' => $challengeId,
                'verificationCode' => '123456',
            ],
        );

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('cleanupAvailable', true);

        $schoolHead->refresh();
        $this->assertSame($school->id, $schoolHead->school_id);
        $this->assertFalse($schoolHead->accountStatus() === AccountStatus::ARCHIVED);
    }

    public function test_force_cleanup_delete_removes_roles_and_records_audit_log(): void
    {
        $this->seed();

        [$monitorToken, $schoolHead, $school] = $this->monitorAndSchoolHeadFor('schoolhead1@cspams.local');
        $schoolHead->assignRole('monitor');

        $challengeId = $this->issueDeleteVerificationCode($monitorToken, $school);

        $response = $this->withToken($monitorToken)->deleteJson(
            "/api/dashboard/records/{$school->id}/school-head-account",
            [
                'reason' => 'Explicit cleanup before archival.',
                'verificationChallengeId' => $challengeId,
                'verificationCode' => '123456',
                'forceCleanupMonitorAccess' => true,
            ],
        );

        $response->assertOk()
            ->assertJsonPath('data.deletedCount', 1);

        $schoolHead->refresh();
        $this->assertSame(AccountStatus::ARCHIVED, $schoolHead->accountStatus());
        $this->assertNull($schoolHead->school_id);
        $this->assertFalse($schoolHead->hasRole('monitor'));
        $this->assertFalse($schoolHead->hasRole('school_head'));

        /** @var AuditLog $auditLog */
        $auditLog = AuditLog::query()
            ->where('action', 'account.removed')
            ->latest('id')
            ->firstOrFail();

        $this->assertTrue((bool) data_get($auditLog->metadata, 'force_cleanup_monitor_access'));
        $this->assertTrue((bool) data_get($auditLog->metadata, 'monitor_access_cleaned'));
    }

    /**
     * @return array{0: string, 1: User, 2: School}
     */
    private function monitorAndSchoolHeadFor(string $email): array
    {
        config()->set('auth_mfa.monitor.test_code', '123456');

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'cspamsmonitor@gmail.com',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);
        $monitorLogin->assertOk();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', $email)->firstOrFail();
        /** @var School $school */
        $school = School::query()->findOrFail($schoolHead->school_id);

        return [
            (string) $monitorLogin->json('token'),
            $schoolHead,
            $school,
        ];
    }

    private function issueDeleteVerificationCode(string $monitorToken, School $school): string
    {
        $issueCode = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/verification-code",
            ['targetStatus' => 'deleted'],
        );

        $issueCode->assertOk();

        return (string) $issueCode->json('data.challengeId');
    }
}
