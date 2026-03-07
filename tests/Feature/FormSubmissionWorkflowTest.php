<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class FormSubmissionWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_sf1_generation_submission_validation_and_history_workflow(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');

        $schoolHeadToken = $this->loginToken('school_head', $schoolHead->email);

        $generated = $this->withToken($schoolHeadToken)->postJson('/api/forms/sf1/generate', [
            'academic_year_id' => $academicYearId,
        ]);

        $generated->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.formType', 'sf1')
            ->assertJsonPath('data.status', 'draft');

        $submissionId = (string) $generated->json('data.id');

        $submitted = $this->withToken($schoolHeadToken)->postJson("/api/forms/sf1/{$submissionId}/submit");

        $submitted->assertOk()
            ->assertJsonPath('data.status', 'submitted');

        $monitorToken = $this->loginToken('monitor', 'monitor@cspams.local');

        $validated = $this->withToken($monitorToken)->postJson("/api/forms/sf1/{$submissionId}/validate", [
            'decision' => 'validated',
            'notes' => 'Reviewed and validated by SMM&E.',
        ]);

        $validated->assertOk()
            ->assertJsonPath('data.status', 'validated');

        $history = $this->withToken($monitorToken)->getJson("/api/forms/sf1/{$submissionId}/history");

        $history->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.action', 'validated')
            ->assertJsonPath('data.1.action', 'submitted')
            ->assertJsonPath('data.2.action', 'generated');
    }

    public function test_school_head_cannot_submit_another_schools_sf5_submission(): void
    {
        $this->seed();

        /** @var User $schoolHeadOne */
        $schoolHeadOne = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var User $schoolHeadTwo */
        $schoolHeadTwo = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');

        $tokenOne = $this->loginToken('school_head', $schoolHeadOne->email);

        $generated = $this->withToken($tokenOne)->postJson('/api/forms/sf5/generate', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
        ]);

        $generated->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.formType', 'sf5')
            ->assertJsonPath('data.status', 'draft');

        $submissionId = (string) $generated->json('data.id');

        $tokenTwo = $this->loginToken('school_head', $schoolHeadTwo->email);

        $forbidden = $this->withToken($tokenTwo)->postJson("/api/forms/sf5/{$submissionId}/submit");

        $forbidden->assertStatus(Response::HTTP_FORBIDDEN);
    }

    private function loginToken(string $role, string $login): string
    {
        $loginResponse = $this->postJson('/api/auth/login', [
            'role' => $role,
            'login' => $login,
            'password' => 'password123',
        ]);

        $loginResponse->assertOk();

        return (string) $loginResponse->json('token');
    }
}
