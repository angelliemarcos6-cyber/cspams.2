<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class StudentCrudAuthorizationTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithSeededCredentials;

    public function test_student_crud_is_restricted_to_assigned_school_head(): void
    {
        $this->seed();

        /** @var User $schoolHeadOne */
        $schoolHeadOne = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var User $schoolHeadTwo */
        $schoolHeadTwo = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();

        $tokenOne = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHeadOne));
        $tokenTwo = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHeadTwo));
        $monitorToken = $this->loginToken('monitor', 'monitor@cspams.local');

        $payload = [
            'lrn' => '9900000' . (string) random_int(1000, 9999),
            'firstName' => 'Jamie',
            'middleName' => null,
            'lastName' => 'Rivera',
            'sex' => 'female',
            'birthDate' => '2011-06-10',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - A',
            'teacher' => 'Teacher One',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ];

        $created = $this->withToken($tokenOne)->postJson('/api/dashboard/students', $payload);
        $created->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.lrn', $payload['lrn']);

        $studentId = (string) $created->json('data.id');

        $monitorCreate = $this->withToken($monitorToken)->postJson('/api/dashboard/students', [
            ...$payload,
            'lrn' => '9900000' . (string) random_int(1000, 9999),
        ]);
        $monitorCreate->assertStatus(Response::HTTP_FORBIDDEN);

        $otherHeadUpdate = $this->withToken($tokenTwo)->putJson("/api/dashboard/students/{$studentId}", [
            ...$payload,
            'status' => 'at_risk',
        ]);
        $otherHeadUpdate->assertStatus(Response::HTTP_FORBIDDEN);

        $ownerUpdate = $this->withToken($tokenOne)->putJson("/api/dashboard/students/{$studentId}", [
            ...$payload,
            'status' => 'at_risk',
            'riskLevel' => 'high',
            'teacher' => 'Teacher Updated',
        ]);
        $ownerUpdate->assertOk()
            ->assertJsonPath('data.status', 'at_risk')
            ->assertJsonPath('data.riskLevel', 'high')
            ->assertJsonPath('data.teacher', 'Teacher Updated');

        $batchPayload = [
            ...$payload,
            'lrn' => '9900000' . (string) random_int(1000, 9999),
            'firstName' => 'Taylor',
            'lastName' => 'Mendoza',
        ];
        $batchCreated = $this->withToken($tokenOne)->postJson('/api/dashboard/students', $batchPayload);
        $batchCreated->assertStatus(Response::HTTP_CREATED);
        $batchStudentId = (string) $batchCreated->json('data.id');

        $otherHeadBatchDelete = $this->withToken($tokenTwo)->deleteJson('/api/dashboard/students', [
            'ids' => [$batchStudentId],
        ]);
        $otherHeadBatchDelete->assertStatus(Response::HTTP_FORBIDDEN);

        $ownerBatchDelete = $this->withToken($tokenOne)->deleteJson('/api/dashboard/students', [
            'ids' => [$batchStudentId],
        ]);
        $ownerBatchDelete->assertOk()
            ->assertJsonPath('data.deletedIds.0', $batchStudentId)
            ->assertJsonPath('meta.deletedCount', 1);

        $otherHeadDelete = $this->withToken($tokenTwo)->deleteJson("/api/dashboard/students/{$studentId}");
        $otherHeadDelete->assertStatus(Response::HTTP_FORBIDDEN);

        $ownerDelete = $this->withToken($tokenOne)->deleteJson("/api/dashboard/students/{$studentId}");
        $ownerDelete->assertOk()
            ->assertJsonPath('data.id', $studentId)
            ->assertJsonPath('data.deleted', true)
            ->assertJsonPath('data.deletedCount', 1);

        $recreateAfterDelete = $this->withToken($tokenOne)->postJson('/api/dashboard/students', $payload);
        $recreateAfterDelete->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.lrn', $payload['lrn']);
    }

    public function test_student_count_sync_stays_isolated_per_school(): void
    {
        $this->seed();

        /** @var User $schoolHeadOne */
        $schoolHeadOne = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var User $schoolHeadTwo */
        $schoolHeadTwo = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        /** @var School $schoolOne */
        $schoolOne = School::query()->findOrFail((int) $schoolHeadOne->school_id);
        /** @var School $schoolTwo */
        $schoolTwo = School::query()->findOrFail((int) $schoolHeadTwo->school_id);

        $initialOne = Student::query()->where('school_id', $schoolOne->id)->count();
        $initialTwo = Student::query()->where('school_id', $schoolTwo->id)->count();

        $schoolOne->update(['reported_student_count' => $initialOne]);
        $schoolTwo->update(['reported_student_count' => $initialTwo]);

        $tokenOne = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHeadOne));

        $payload = [
            'lrn' => '9911000' . (string) random_int(1000, 9999),
            'firstName' => 'Isolated',
            'middleName' => null,
            'lastName' => 'Learner',
            'sex' => 'female',
            'birthDate' => '2012-05-10',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - A',
            'teacher' => 'Teacher One',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ];

        $created = $this->withToken($tokenOne)->postJson('/api/dashboard/students', $payload);
        $created->assertStatus(Response::HTTP_CREATED);
        $studentId = (string) $created->json('data.id');

        $schoolOne->refresh();
        $schoolTwo->refresh();
        $this->assertSame($initialOne + 1, (int) $schoolOne->reported_student_count);
        $this->assertSame($initialTwo, (int) $schoolTwo->reported_student_count);

        $deleted = $this->withToken($tokenOne)->deleteJson("/api/dashboard/students/{$studentId}");
        $deleted->assertOk();

        $schoolOne->refresh();
        $schoolTwo->refresh();
        $this->assertSame($initialOne, (int) $schoolOne->reported_student_count);
        $this->assertSame($initialTwo, (int) $schoolTwo->reported_student_count);
    }

    public function test_batch_delete_reports_missing_ids_without_false_success(): void
    {
        $this->seed();

        /** @var User $schoolHeadOne */
        $schoolHeadOne = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $tokenOne = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHeadOne));

        $payload = [
            'lrn' => '9912000' . (string) random_int(1000, 9999),
            'firstName' => 'Missing',
            'middleName' => null,
            'lastName' => 'Delete',
            'sex' => 'male',
            'birthDate' => '2012-05-10',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - A',
            'teacher' => 'Teacher One',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ];

        $created = $this->withToken($tokenOne)->postJson('/api/dashboard/students', $payload);
        $created->assertStatus(Response::HTTP_CREATED);
        $studentId = (string) $created->json('data.id');

        $this->withToken($tokenOne)->deleteJson("/api/dashboard/students/{$studentId}")
            ->assertOk();

        $batchDelete = $this->withToken($tokenOne)->deleteJson('/api/dashboard/students', [
            'ids' => [$studentId],
        ]);

        $batchDelete->assertOk()
            ->assertJsonPath('data.deletedIds', [])
            ->assertJsonPath('data.missingIds.0', $studentId)
            ->assertJsonPath('data.requestedCount', 1)
            ->assertJsonPath('meta.deletedCount', 0);
    }

    public function test_lrn_uniqueness_is_scoped_per_school(): void
    {
        $this->seed();

        /** @var User $schoolHeadOne */
        $schoolHeadOne = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var User $schoolHeadTwo */
        $schoolHeadTwo = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();

        $tokenOne = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHeadOne));
        $tokenTwo = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHeadTwo));

        $sharedLrn = '9922000' . (string) random_int(1000, 9999);
        $basePayload = [
            'lrn' => $sharedLrn,
            'firstName' => 'Scoped',
            'middleName' => null,
            'lastName' => 'Learner',
            'sex' => 'female',
            'birthDate' => '2012-05-10',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - A',
            'teacher' => 'Teacher One',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ];

        $createSchoolOne = $this->withToken($tokenOne)->postJson('/api/dashboard/students', $basePayload);
        $createSchoolOne->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.lrn', $sharedLrn);

        $createSchoolTwo = $this->withToken($tokenTwo)->postJson('/api/dashboard/students', [
            ...$basePayload,
            'teacher' => 'Teacher Two',
        ]);
        $createSchoolTwo->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.lrn', $sharedLrn);

        $duplicateInSameSchool = $this->withToken($tokenOne)->postJson('/api/dashboard/students', [
            ...$basePayload,
            'firstName' => 'Duplicate',
        ]);
        $duplicateInSameSchool->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonValidationErrors(['lrn']);
    }

    public function test_update_reuses_lrn_from_soft_deleted_legacy_row(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $token = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $legacyLrn = '9933000' . (string) random_int(1000, 9999);
        $activeLrn = '9944000' . (string) random_int(1000, 9999);

        $legacyCreate = $this->withToken($token)->postJson('/api/dashboard/students', [
            'lrn' => $legacyLrn,
            'firstName' => 'Legacy',
            'middleName' => null,
            'lastName' => 'Student',
            'sex' => 'male',
            'birthDate' => '2012-05-10',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - A',
            'teacher' => 'Teacher One',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ]);
        $legacyCreate->assertStatus(Response::HTTP_CREATED);
        $legacyStudentId = (string) $legacyCreate->json('data.id');

        Student::query()->whereKey($legacyStudentId)->delete();

        $activeCreate = $this->withToken($token)->postJson('/api/dashboard/students', [
            'lrn' => $activeLrn,
            'firstName' => 'Active',
            'middleName' => null,
            'lastName' => 'Student',
            'sex' => 'female',
            'birthDate' => '2012-05-10',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - A',
            'teacher' => 'Teacher One',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ]);
        $activeCreate->assertStatus(Response::HTTP_CREATED);
        $activeStudentId = (string) $activeCreate->json('data.id');

        $update = $this->withToken($token)->putJson("/api/dashboard/students/{$activeStudentId}", [
            'lrn' => $legacyLrn,
            'firstName' => 'Active',
            'middleName' => null,
            'lastName' => 'Student',
            'sex' => 'female',
            'birthDate' => '2012-05-10',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - A',
            'teacher' => 'Teacher One',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ]);

        $update->assertOk()
            ->assertJsonPath('data.lrn', $legacyLrn);
    }

    public function test_create_reuses_lrn_from_soft_deleted_legacy_row(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $token = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $legacyLrn = '9966000' . (string) random_int(1000, 9999);

        $legacyCreate = $this->withToken($token)->postJson('/api/dashboard/students', [
            'lrn' => $legacyLrn,
            'firstName' => 'Legacy',
            'middleName' => null,
            'lastName' => 'Learner',
            'sex' => 'male',
            'birthDate' => '2012-05-10',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - A',
            'teacher' => 'Teacher One',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ]);
        $legacyCreate->assertStatus(Response::HTTP_CREATED);

        $legacyStudentId = (string) $legacyCreate->json('data.id');
        Student::query()->whereKey($legacyStudentId)->delete();

        $recreate = $this->withToken($token)->postJson('/api/dashboard/students', [
            'lrn' => $legacyLrn,
            'firstName' => 'Fresh',
            'middleName' => null,
            'lastName' => 'Learner',
            'sex' => 'female',
            'birthDate' => '2012-05-10',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - B',
            'teacher' => 'Teacher Two',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ]);

        $recreate->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.lrn', $legacyLrn)
            ->assertJsonPath('data.firstName', 'Fresh');
    }

    public function test_unassigned_school_head_cannot_mutate_student_records(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->forceFill(['school_id' => null])->save();
        $token = $schoolHead->createToken('unassigned-school-head-test')->plainTextToken;

        $payload = [
            'lrn' => '9955000' . (string) random_int(1000, 9999),
            'firstName' => 'Unassigned',
            'middleName' => null,
            'lastName' => 'Head',
            'sex' => 'female',
            'birthDate' => '2012-05-10',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - A',
            'teacher' => 'Teacher One',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ];

        $create = $this->withToken($token)->postJson('/api/dashboard/students', $payload);
        $create->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'Your account is not linked to any school.');

        /** @var Student $existingStudent */
        $existingStudent = Student::query()->firstOrFail();

        $delete = $this->withToken($token)->deleteJson("/api/dashboard/students/{$existingStudent->id}");
        $delete->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'Your account is not linked to any school.');

        $batchDelete = $this->withToken($token)->deleteJson('/api/dashboard/students', [
            'ids' => [(string) $existingStudent->id],
        ]);
        $batchDelete->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'Your account is not linked to any school.');
    }

    private function loginToken(string $role, string $login): string
    {
        $response = $this->postJson('/api/auth/login', [
            'role' => $role,
            'login' => $login,
            'password' => $this->demoPasswordForLogin($role, $login),
        ]);

        $response->assertOk();

        return (string) $response->json('token');
    }

    private function schoolHeadLogin(User $user): string
    {
        $user->loadMissing('school');

        return (string) $user->school?->school_code;
    }
}
