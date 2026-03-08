<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class RoleWorkflowE2ETest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithSeededCredentials;

    public function test_school_head_to_monitor_end_to_end_workflow(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');

        $schoolHeadToken = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $studentPayload = [
            'lrn' => '9910000' . (string) random_int(1000, 9999),
            'firstName' => 'Casey',
            'middleName' => null,
            'lastName' => 'Ramos',
            'sex' => 'male',
            'birthDate' => '2012-01-21',
            'status' => 'enrolled',
            'riskLevel' => 'low',
            'section' => 'Grade 7 - A',
            'teacher' => 'Teacher Alpha',
            'currentLevel' => 'Grade 7',
            'trackedFromLevel' => 'Kindergarten',
        ];

        $this->withToken($schoolHeadToken)
            ->postJson('/api/dashboard/students', $studentPayload)
            ->assertStatus(Response::HTTP_CREATED);

        $sf1Generated = $this->withToken($schoolHeadToken)->postJson('/api/forms/sf1/generate', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
        ]);
        $sf1Generated->assertStatus(Response::HTTP_CREATED);
        $sf1SubmissionId = (string) $sf1Generated->json('data.id');

        $this->withToken($schoolHeadToken)
            ->postJson("/api/forms/sf1/{$sf1SubmissionId}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'submitted');

        $metricResponse = $this->withToken($schoolHeadToken)->getJson('/api/indicators/metrics');
        $metricResponse->assertOk();
        $metricId = (int) $metricResponse->json('data.0.id');
        $this->assertGreaterThan(0, $metricId);

        $indicatorCreated = $this->withToken($schoolHeadToken)->postJson('/api/indicators/submissions', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
            'notes' => 'End-to-end compliance package.',
            'indicators' => [
                [
                    'metric_id' => $metricId,
                    'target_value' => 80,
                    'actual_value' => 88,
                    'remarks' => 'Within target.',
                ],
            ],
        ]);
        $indicatorCreated->assertStatus(Response::HTTP_CREATED);
        $indicatorSubmissionId = (string) $indicatorCreated->json('data.id');

        $this->withToken($schoolHeadToken)
            ->postJson("/api/indicators/submissions/{$indicatorSubmissionId}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'submitted');

        $monitorToken = $this->loginToken('monitor', 'monitor@cspams.local');

        $monitorSf1Queue = $this->withToken($monitorToken)->getJson('/api/forms/sf1?status=submitted&per_page=1');
        $monitorSf1Queue->assertOk()
            ->assertJsonPath('meta.per_page', 1);

        $this->withToken($monitorToken)->postJson("/api/forms/sf1/{$sf1SubmissionId}/validate", [
            'decision' => 'validated',
            'notes' => 'Validated during end-to-end workflow test.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'validated');

        $monitorIndicatorQueue = $this->withToken($monitorToken)->getJson('/api/indicators/submissions?status=submitted&per_page=1');
        $monitorIndicatorQueue->assertOk()
            ->assertJsonPath('meta.per_page', 1);

        $this->withToken($monitorToken)->postJson("/api/indicators/submissions/{$indicatorSubmissionId}/review", [
            'decision' => 'validated',
            'notes' => 'Validated during end-to-end workflow test.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'validated');

        $schoolHeadSf1Validated = $this->withToken($schoolHeadToken)->getJson('/api/forms/sf1?status=validated');
        $schoolHeadSf1Validated->assertOk();
        $validatedSf1Ids = collect($schoolHeadSf1Validated->json('data', []))->pluck('id')->all();
        $this->assertContains($sf1SubmissionId, $validatedSf1Ids);

        $schoolHeadIndicator = $this->withToken($schoolHeadToken)->getJson("/api/indicators/submissions/{$indicatorSubmissionId}");
        $schoolHeadIndicator->assertOk()
            ->assertJsonPath('data.status', 'validated');
    }

    public function test_submission_list_per_page_is_capped_for_scaling(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $schoolHeadToken = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $this->withToken($schoolHeadToken)->postJson('/api/forms/sf1/generate', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
        ])->assertStatus(Response::HTTP_CREATED);

        $formsCapped = $this->withToken($schoolHeadToken)->getJson('/api/forms/sf1?per_page=500');
        $formsCapped->assertOk()
            ->assertJsonPath('meta.per_page', 100);

        $metricResponse = $this->withToken($schoolHeadToken)->getJson('/api/indicators/metrics');
        $metricResponse->assertOk();
        $metricId = (int) $metricResponse->json('data.0.id');

        $this->withToken($schoolHeadToken)->postJson('/api/indicators/submissions', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
            'indicators' => [
                [
                    'metric_id' => $metricId,
                    'target_value' => 70,
                    'actual_value' => 75,
                ],
            ],
        ])->assertStatus(Response::HTTP_CREATED);

        $indicatorsCapped = $this->withToken($schoolHeadToken)->getJson('/api/indicators/submissions?per_page=500');
        $indicatorsCapped->assertOk()
            ->assertJsonPath('meta.per_page', 100);
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
