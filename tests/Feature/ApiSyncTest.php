<?php

namespace Tests\Feature;

use App\Models\Student;
use App\Models\User;
use App\Support\Domain\StudentStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class ApiSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_monitor_login_and_conditional_sync_work(): void
    {
        $this->seed();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => 'password123',
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'monitor');

        $token = (string) $login->json('token');
        $this->assertNotSame('', $token);

        $records = $this->withToken($token)->getJson('/api/dashboard/records');

        $records->assertOk()
            ->assertJsonPath('meta.scope', 'division')
            ->assertHeader('X-Sync-Scope', 'division')
            ->assertJsonStructure([
                'meta' => [
                    'targetsMet' => [
                        'schoolsMonitored',
                        'retentionRatePercent',
                        'dropoutRatePercent',
                        'completionRatePercent',
                    ],
                    'alerts',
                ],
            ]);

        $this->assertGreaterThanOrEqual(3, count($records->json('data', [])));

        $etag = (string) $records->headers->get('X-Sync-Etag');
        $this->assertNotSame('', $etag);

        $notModified = $this->withToken($token)
            ->withHeaders(['If-None-Match' => trim($etag, '"')])
            ->getJson('/api/dashboard/records');

        $notModified->assertStatus(Response::HTTP_NOT_MODIFIED)
            ->assertHeader('X-Sync-Scope', 'division');
    }

    public function test_school_head_is_scope_limited_and_cannot_edit_other_schools(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var User $otherHead */
        $otherHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolHead->email,
            'password' => 'password123',
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'school_head');

        $token = (string) $login->json('token');

        $records = $this->withToken($token)->getJson('/api/dashboard/records');

        $records->assertOk()
            ->assertJsonPath('meta.scope', 'school')
            ->assertHeader('X-Sync-Scope', 'school')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', (string) $schoolHead->school_id);

        $forbidden = $this->withToken($token)->putJson('/api/dashboard/records/' . $otherHead->school_id, [
            'schoolName' => 'Unauthorized Update Attempt',
            'studentCount' => 1200,
            'teacherCount' => 55,
            'region' => 'Region II',
            'status' => 'active',
        ]);

        $forbidden->assertStatus(Response::HTTP_FORBIDDEN);
    }

    public function test_school_head_update_returns_sync_metadata_and_headers(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolHead->email,
            'password' => 'password123',
        ]);

        $login->assertOk();
        $token = (string) $login->json('token');

        $updated = $this->withToken($token)->putJson('/api/dashboard/records/' . $schoolHead->school_id, [
            'schoolName' => 'School Head 1 Synced',
            'studentCount' => 1250,
            'teacherCount' => 60,
            'region' => 'Region II',
            'status' => 'active',
        ]);

        $updated->assertOk()
            ->assertHeader('X-Sync-Scope', 'school')
            ->assertHeader('X-Sync-Scope-Key', 'school:' . $schoolHead->school_id)
            ->assertHeader('X-Sync-Record-Count', '1')
            ->assertHeader('X-Sync-Etag')
            ->assertHeader('X-Synced-At')
            ->assertJsonPath('meta.scope', 'school')
            ->assertJsonPath('meta.scopeKey', 'school:' . $schoolHead->school_id)
            ->assertJsonPath('meta.recordCount', 1)
            ->assertJsonPath('meta.targetsMet.schoolsMonitored', 1)
            ->assertJsonStructure([
                'meta' => [
                    'alerts' => [
                        ['id', 'level', 'title', 'message'],
                    ],
                ],
            ])
            ->assertJsonPath('data.id', (string) $schoolHead->school_id)
            ->assertJsonPath('data.schoolName', 'School Head 1 Synced');
    }

    public function test_monitor_sync_etag_changes_when_student_data_changes(): void
    {
        $this->seed();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => 'password123',
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'monitor');

        $token = (string) $login->json('token');

        $records = $this->withToken($token)->getJson('/api/dashboard/records');
        $records->assertOk()
            ->assertJsonPath('meta.scope', 'division');

        $startingDropouts = (int) $records->json('meta.targetsMet.dropoutLearners', 0);
        $initialEtag = trim((string) $records->headers->get('X-Sync-Etag'), '"');
        $this->assertNotSame('', $initialEtag);

        /** @var Student $student */
        $student = Student::query()
            ->where('status', '!=', StudentStatus::DROPPED_OUT->value)
            ->firstOrFail();

        $student->forceFill([
            'status' => StudentStatus::DROPPED_OUT->value,
            'last_status_at' => now(),
        ])->save();

        $resynced = $this->withToken($token)
            ->withHeaders(['If-None-Match' => $initialEtag])
            ->getJson('/api/dashboard/records');

        $resynced->assertOk()
            ->assertJsonPath('meta.scope', 'division');

        $newEtag = trim((string) $resynced->headers->get('X-Sync-Etag'), '"');
        $this->assertNotSame('', $newEtag);
        $this->assertNotSame($initialEtag, $newEtag);
        $this->assertGreaterThan($startingDropouts, (int) $resynced->json('meta.targetsMet.dropoutLearners', 0));
    }
}
