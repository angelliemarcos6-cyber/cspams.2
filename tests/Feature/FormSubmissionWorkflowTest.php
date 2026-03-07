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

        $schoolHeadToken = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

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

        $tokenOne = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHeadOne));

        $generated = $this->withToken($tokenOne)->postJson('/api/forms/sf5/generate', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
        ]);

        $generated->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.formType', 'sf5')
            ->assertJsonPath('data.status', 'draft');

        $submissionId = (string) $generated->json('data.id');

        $tokenTwo = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHeadTwo));

        $forbidden = $this->withToken($tokenTwo)->postJson("/api/forms/sf5/{$submissionId}/submit");

        $forbidden->assertStatus(Response::HTTP_FORBIDDEN);
    }

    public function test_returned_sf1_requires_notes_and_resubmission_clears_validation_metadata(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');

        $schoolHeadToken = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $generated = $this->withToken($schoolHeadToken)->postJson('/api/forms/sf1/generate', [
            'academic_year_id' => $academicYearId,
        ]);
        $generated->assertStatus(Response::HTTP_CREATED);
        $submissionId = (string) $generated->json('data.id');

        $this->withToken($schoolHeadToken)
            ->postJson("/api/forms/sf1/{$submissionId}/submit")
            ->assertOk();

        $monitorToken = $this->loginToken('monitor', 'monitor@cspams.local');

        $missingNotes = $this->withToken($monitorToken)->postJson("/api/forms/sf1/{$submissionId}/validate", [
            'decision' => 'returned',
        ]);
        $missingNotes->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonValidationErrors(['notes']);

        $returned = $this->withToken($monitorToken)->postJson("/api/forms/sf1/{$submissionId}/validate", [
            'decision' => 'returned',
            'notes' => 'Please correct learner totals.',
        ]);
        $returned->assertOk()
            ->assertJsonPath('data.status', 'returned')
            ->assertJsonPath('data.validationNotes', 'Please correct learner totals.')
            ->assertJsonPath('data.validatedAt', fn (?string $value): bool => $value !== null);

        $resubmitted = $this->withToken($schoolHeadToken)->postJson("/api/forms/sf1/{$submissionId}/submit");
        $resubmitted->assertOk()
            ->assertJsonPath('data.status', 'submitted')
            ->assertJsonPath('data.validationNotes', null)
            ->assertJsonPath('data.validatedAt', null);
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

    private function schoolHeadLogin(User $user): string
    {
        $user->loadMissing('school');

        return (string) $user->school?->school_code;
    }
}
