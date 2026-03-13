<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\Student;
use App\Models\StudentStatusLog;
use App\Models\Teacher;
use App\Models\User;
use App\Notifications\SchoolSubmissionReminderNotification;
use App\Support\Domain\StudentStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class ApiSyncTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithSeededCredentials;

    public function test_school_head_login_requires_school_code(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();

        $emailLogin = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolHead->email,
            'password' => $this->demoPasswordForLogin('school_head', $schoolHead->email),
        ]);

        $emailLogin->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonValidationErrors(['login']);

        $codeLogin = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $this->schoolHeadLogin($schoolHead),
            'password' => $this->demoPasswordForLogin('school_head', $this->schoolHeadLogin($schoolHead)),
        ]);

        $codeLogin->assertOk()
            ->assertJsonPath('user.role', 'school_head');
    }

    public function test_monitor_login_requires_email_identifier(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'monitor@cspams.local')->firstOrFail();

        $nameLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => $monitor->name,
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        ]);

        $nameLogin->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonValidationErrors(['login']);

        $emailLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        ]);

        $emailLogin->assertOk()
            ->assertJsonPath('user.role', 'monitor');
    }

    public function test_monitor_login_and_conditional_sync_work(): void
    {
        $this->seed();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
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
            'login' => $this->schoolHeadLogin($schoolHead),
            'password' => $this->demoPasswordForLogin('school_head', $this->schoolHeadLogin($schoolHead)),
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
        $schoolHead->loadMissing('school');
        $originalSchoolName = (string) $schoolHead->school?->name;

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $this->schoolHeadLogin($schoolHead),
            'password' => $this->demoPasswordForLogin('school_head', $this->schoolHeadLogin($schoolHead)),
        ]);

        $login->assertOk();
        $token = (string) $login->json('token');

        $updated = $this->withToken($token)->putJson('/api/dashboard/records/' . $schoolHead->school_id, [
            'studentCount' => 1250,
            'teacherCount' => 60,
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
            ->assertJsonPath('data.schoolName', $originalSchoolName);
    }

    public function test_school_head_cannot_override_school_identity_fields_via_record_update(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->loadMissing('school');
        $school = $schoolHead->school;
        $this->assertNotNull($school);

        $originalName = (string) $school?->name;
        $originalRegion = (string) $school?->region;
        $originalDistrict = (string) $school?->district;
        $originalType = (string) $school?->type;
        $expectedStudentCount = Student::query()
            ->where('school_id', $schoolHead->school_id)
            ->count();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $this->schoolHeadLogin($schoolHead),
            'password' => $this->demoPasswordForLogin('school_head', $this->schoolHeadLogin($schoolHead)),
        ]);
        $login->assertOk();
        $token = (string) $login->json('token');

        $updated = $this->withToken($token)->putJson('/api/dashboard/records/' . $schoolHead->school_id, [
            'schoolName' => 'Unauthorized Rename Attempt',
            'region' => 'Region III',
            'district' => 'District X',
            'type' => 'private',
            'studentCount' => 1500,
            'teacherCount' => 65,
            'status' => 'active',
        ]);

        $updated->assertOk()
            ->assertJsonPath('data.schoolName', $originalName)
            ->assertJsonPath('data.region', $originalRegion)
            ->assertJsonPath('data.studentCount', $expectedStudentCount)
            ->assertJsonPath('data.teacherCount', 65);

        $school?->refresh();
        $this->assertSame($originalName, $school?->name);
        $this->assertSame($originalRegion, $school?->region);
        $this->assertSame($originalDistrict, $school?->district);
        $this->assertSame($originalType, $school?->type);
        $this->assertSame($expectedStudentCount, (int) $school?->reported_student_count);
        $this->assertSame(65, (int) $school?->reported_teacher_count);
    }

    public function test_monitor_sync_etag_changes_when_student_data_changes(): void
    {
        $this->seed();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
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

    public function test_monitor_can_send_school_reminder_to_school_head_account(): void
    {
        $this->seed();
        Notification::fake();

        $monitorLogin = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        ]);
        $monitorLogin->assertOk();
        $monitorToken = (string) $monitorLogin->json('token');

        /** @var School $school */
        $school = School::query()->where('school_code', '900001')->firstOrFail();
        /** @var User $schoolHead */
        $schoolHead = User::query()->where('school_id', $school->id)->firstOrFail();

        $response = $this->withToken($monitorToken)->postJson("/api/dashboard/records/{$school->id}/send-reminder", [
            'notes' => 'Please submit your latest school package this week.',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.schoolId', '900001')
            ->assertJsonPath('data.schoolName', 'Santiago City National High School')
            ->assertJsonPath('data.recipientCount', 1)
            ->assertJsonStructure([
                'data' => [
                    'recipientEmails',
                    'remindedAt',
                ],
            ]);

        Notification::assertSentTo(
            [$schoolHead],
            SchoolSubmissionReminderNotification::class,
            static function (SchoolSubmissionReminderNotification $notification, array $channels): bool {
                return in_array('mail', $channels, true) && in_array('database', $channels, true);
            },
        );
    }

    public function test_school_head_cannot_send_school_reminder(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $this->schoolHeadLogin($schoolHead),
            'password' => $this->demoPasswordForLogin('school_head', $this->schoolHeadLogin($schoolHead)),
        ]);
        $login->assertOk();
        $schoolHeadToken = (string) $login->json('token');

        $forbidden = $this->withToken($schoolHeadToken)->postJson('/api/dashboard/records/' . $schoolHead->school_id . '/send-reminder');
        $forbidden->assertStatus(Response::HTTP_FORBIDDEN);
    }

    public function test_monitor_student_sync_supports_conditional_etag(): void
    {
        $this->seed();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        ]);

        $login->assertOk();
        $token = (string) $login->json('token');

        $students = $this->withToken($token)->getJson('/api/dashboard/students?page=1&per_page=25');
        $students->assertOk()
            ->assertHeader('X-Sync-Scope', 'division')
            ->assertJsonPath('meta.scope', 'division')
            ->assertJsonPath('meta.currentPage', 1)
            ->assertJsonPath('meta.perPage', 25);

        $etag = trim((string) $students->headers->get('X-Sync-Etag'), '"');
        $this->assertNotSame('', $etag);

        $notModified = $this->withToken($token)
            ->withHeaders(['If-None-Match' => $etag])
            ->getJson('/api/dashboard/students?page=1&per_page=25');

        $notModified->assertStatus(Response::HTTP_NOT_MODIFIED)
            ->assertHeader('X-Sync-Scope', 'division');

        /** @var Student $student */
        $student = Student::query()->firstOrFail();
        $student->forceFill([
            'status' => StudentStatus::AT_RISK->value,
            'last_status_at' => now(),
        ])->save();

        $resynced = $this->withToken($token)
            ->withHeaders(['If-None-Match' => $etag])
            ->getJson('/api/dashboard/students?page=1&per_page=25');

        $resynced->assertOk()
            ->assertHeader('X-Sync-Scope', 'division');

        $newEtag = trim((string) $resynced->headers->get('X-Sync-Etag'), '"');
        $this->assertNotSame('', $newEtag);
        $this->assertNotSame($etag, $newEtag);
    }

    public function test_monitor_student_history_sync_supports_conditional_etag(): void
    {
        $this->seed();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        ]);

        $login->assertOk();
        $token = (string) $login->json('token');

        /** @var Student $student */
        $student = Student::query()->firstOrFail();

        $history = $this->withToken($token)->getJson("/api/dashboard/students/{$student->id}/history?page=1&per_page=10");
        $history->assertOk()
            ->assertHeader('X-Sync-Scope', 'division')
            ->assertJsonPath('meta.scope', 'division')
            ->assertJsonPath('meta.studentId', (string) $student->id)
            ->assertJsonPath('meta.currentPage', 1)
            ->assertJsonPath('meta.perPage', 10);

        $etag = trim((string) $history->headers->get('X-Sync-Etag'), '"');
        $this->assertNotSame('', $etag);

        $notModified = $this->withToken($token)
            ->withHeaders(['If-None-Match' => $etag])
            ->getJson("/api/dashboard/students/{$student->id}/history?page=1&per_page=10");

        $notModified->assertStatus(Response::HTTP_NOT_MODIFIED)
            ->assertHeader('X-Sync-Scope', 'division');

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'monitor@cspams.local')->firstOrFail();
        $fromStatus = $student->status instanceof StudentStatus ? $student->status->value : (string) $student->status;
        $toStatus = $fromStatus === StudentStatus::AT_RISK->value
            ? StudentStatus::ENROLLED->value
            : StudentStatus::AT_RISK->value;

        StudentStatusLog::query()->create([
            'student_id' => $student->id,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'changed_by' => $monitor->id,
            'notes' => 'ETag sync probe history entry.',
            'changed_at' => now(),
        ]);

        $resynced = $this->withToken($token)
            ->withHeaders(['If-None-Match' => $etag])
            ->getJson("/api/dashboard/students/{$student->id}/history?page=1&per_page=10");

        $resynced->assertOk()
            ->assertHeader('X-Sync-Scope', 'division');

        $newEtag = trim((string) $resynced->headers->get('X-Sync-Etag'), '"');
        $this->assertNotSame('', $newEtag);
        $this->assertNotSame($etag, $newEtag);
    }

    public function test_school_head_student_history_is_scope_limited(): void
    {
        $this->seed();

        /** @var User $schoolHeadOne */
        $schoolHeadOne = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var User $schoolHeadTwo */
        $schoolHeadTwo = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();

        $tokenOne = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $this->schoolHeadLogin($schoolHeadOne),
            'password' => $this->demoPasswordForLogin('school_head', $this->schoolHeadLogin($schoolHeadOne)),
        ])->assertOk()->json('token');
        $tokenTwo = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $this->schoolHeadLogin($schoolHeadTwo),
            'password' => $this->demoPasswordForLogin('school_head', $this->schoolHeadLogin($schoolHeadTwo)),
        ])->assertOk()->json('token');

        $created = $this->withToken((string) $tokenOne)->postJson('/api/dashboard/students', [
            'lrn' => '9910000' . (string) random_int(1000, 9999),
            'firstName' => 'History',
            'middleName' => null,
            'lastName' => 'Scope',
            'sex' => 'female',
            'birthDate' => '2012-04-12',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - A',
            'teacher' => 'Teacher One',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ]);
        $created->assertStatus(Response::HTTP_CREATED);
        $studentId = (string) $created->json('data.id');

        $allowed = $this->withToken((string) $tokenOne)->getJson("/api/dashboard/students/{$studentId}/history");
        $allowed->assertOk()
            ->assertHeader('X-Sync-Scope', 'school')
            ->assertJsonPath('meta.scope', 'school')
            ->assertJsonPath('meta.studentId', $studentId);

        $forbidden = $this->withToken((string) $tokenTwo)->getJson("/api/dashboard/students/{$studentId}/history");
        $forbidden->assertStatus(Response::HTTP_FORBIDDEN);
    }

    public function test_monitor_teacher_sync_supports_conditional_etag(): void
    {
        $this->seed();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        ]);

        $login->assertOk();
        $token = (string) $login->json('token');

        $teachers = $this->withToken($token)->getJson('/api/dashboard/teachers?page=1&per_page=25');
        $teachers->assertOk()
            ->assertHeader('X-Sync-Scope', 'division')
            ->assertJsonPath('meta.scope', 'division')
            ->assertJsonPath('meta.currentPage', 1)
            ->assertJsonPath('meta.perPage', 25);

        $etag = trim((string) $teachers->headers->get('X-Sync-Etag'), '"');
        $this->assertNotSame('', $etag);

        $notModified = $this->withToken($token)
            ->withHeaders(['If-None-Match' => $etag])
            ->getJson('/api/dashboard/teachers?page=1&per_page=25');

        $notModified->assertStatus(Response::HTTP_NOT_MODIFIED)
            ->assertHeader('X-Sync-Scope', 'division');

        /** @var Teacher $teacher */
        $teacher = Teacher::query()->first();
        if (! $teacher) {
            /** @var School $school */
            $school = School::query()->firstOrFail();
            $teacher = Teacher::query()->create([
                'school_id' => $school->id,
                'name' => 'Seeded Teacher',
                'sex' => 'female',
            ]);
        }

        $teacher->forceFill(['name' => $teacher->name . ' Updated'])->save();

        $resynced = $this->withToken($token)
            ->withHeaders(['If-None-Match' => $etag])
            ->getJson('/api/dashboard/teachers?page=1&per_page=25');

        $resynced->assertOk()
            ->assertHeader('X-Sync-Scope', 'division');

        $newEtag = trim((string) $resynced->headers->get('X-Sync-Etag'), '"');
        $this->assertNotSame('', $newEtag);
        $this->assertNotSame($etag, $newEtag);
    }

    private function schoolHeadLogin(User $user): string
    {
        $user->loadMissing('school');

        return (string) $user->school?->school_code;
    }
}
