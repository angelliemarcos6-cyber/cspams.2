<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\User;
use App\Support\Domain\AccountStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class SchoolHeadAccountManagementTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_monitor_can_create_school_head_with_pending_setup_and_one_time_link(): void
    {
        $this->seed();

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
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
            ->assertJsonPath('meta.schoolHeadAccount.accountStatus', AccountStatus::PENDING_SETUP->value);

        $setupLink = (string) $response->json('meta.schoolHeadAccount.setupLink');
        $this->assertNotSame('', $setupLink);

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'setup.head@cspams.local')->firstOrFail();
        $this->assertSame(AccountStatus::PENDING_SETUP->value, $schoolHead->accountStatus()->value);
        $this->assertTrue((bool) $schoolHead->must_reset_password);

        $this->assertDatabaseHas('account_setup_tokens', [
            'user_id' => $schoolHead->id,
            'used_at' => null,
        ]);
    }

    public function test_monitor_can_update_school_head_status_and_reissue_setup_link(): void
    {
        $this->seed();
        config()->set('auth_mfa.monitor.test_code', '123456');

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
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

        $setupLink = $this->withToken($monitorToken)->postJson(
            "/api/dashboard/records/{$school->id}/school-head-account/setup-link",
            [
                'reason' => 'Re-onboarding requested by the school head.',
            ],
        );

        $setupLink->assertStatus(Response::HTTP_OK)
            ->assertJsonPath('data.account.accountStatus', AccountStatus::PENDING_SETUP->value);

        $this->assertNotSame('', (string) $setupLink->json('data.setupLink'));

        $schoolHead->refresh();
        $this->assertSame(AccountStatus::PENDING_SETUP->value, $schoolHead->accountStatus()->value);
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
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
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

    public function test_creating_school_head_account_returns_service_unavailable_when_account_setup_token_storage_is_missing(): void
    {
        $this->seed();

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
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

        $response->assertStatus(Response::HTTP_SERVICE_UNAVAILABLE)
            ->assertJsonPath('message', 'Account setup token storage is unavailable. Run database migrations first.');
    }
}
