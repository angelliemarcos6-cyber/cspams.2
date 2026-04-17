<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\PerformanceMetric;
use App\Models\School;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\User;
use App\Notifications\IndicatorReviewOutcomeNotification;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class IndicatorSubmissionWorkflowTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithSeededCredentials;

    public function test_metrics_endpoint_includes_salo_indicator(): void
    {
        $this->seedIndicatorFixtures();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $token = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $metrics = $this->withToken($token)->getJson('/api/indicators/metrics');

        $metrics->assertOk()
            ->assertJsonPath('data', function (array $rows): bool {
                foreach ($rows as $row) {
                    if (($row['code'] ?? null) === 'SALO') {
                        return ($row['name'] ?? null) === "School's Achievements and Learning Outcomes";
                    }
                }

                return false;
            });
    }

    public function test_auto_calculated_kpi_preserves_manual_payload_values_when_provided(): void
    {
        $this->seedIndicatorFixtures();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $schoolHeadToken = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));
        $nerMetricId = (int) PerformanceMetric::query()->where('code', 'NER')->value('id');

        $created = $this->withToken($schoolHeadToken)->postJson('/api/indicators/submissions', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
            'indicators' => [
                [
                    'metric_id' => $nerMetricId,
                    'target_value' => 999,
                    'actual_value' => 1,
                    'remarks' => 'Manual KPI values encoded by school head.',
                ],
            ],
        ]);

        $created->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.summary.totalIndicators', 1);

        /** @var array<string, mixed>|null $nerRow */
        $nerRow = collect($created->json('data.indicators', []))
            ->first(static fn (mixed $row): bool => is_array($row) && (($row['metric']['code'] ?? null) === 'NER'));

        $this->assertIsArray($nerRow);
        $this->assertSame(999.0, (float) ($nerRow['targetValue'] ?? 0));
        $this->assertSame(1.0, (float) ($nerRow['actualValue'] ?? 0));
    }

    public function test_school_achievement_counts_auto_sync_from_reports_and_teacher_records(): void
    {
        $this->seedIndicatorFixtures();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolId = (int) $schoolHead->school_id;
        $this->assertGreaterThan(0, $schoolId);

        School::query()->whereKey($schoolId)->update([
            'reported_student_count' => 1234,
            'reported_teacher_count' => 57,
        ]);

        Teacher::query()->where('school_id', $schoolId)->forceDelete();
        Teacher::query()->create(['school_id' => $schoolId, 'name' => 'Teacher Male 1', 'sex' => 'male']);
        Teacher::query()->create(['school_id' => $schoolId, 'name' => 'Teacher Male 2', 'sex' => 'male']);
        Teacher::query()->create(['school_id' => $schoolId, 'name' => 'Teacher Male 3', 'sex' => 'male']);
        Teacher::query()->create(['school_id' => $schoolId, 'name' => 'Teacher Female 1', 'sex' => 'female']);
        Teacher::query()->create(['school_id' => $schoolId, 'name' => 'Teacher Female 2', 'sex' => 'female']);

        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $currentSchoolYear = (string) AcademicYear::query()->whereKey($academicYearId)->value('name');
        $expectedStudentTotal = Student::query()
            ->where('school_id', $schoolId)
            ->where('academic_year_id', $academicYearId)
            ->count();
        $schoolHeadToken = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $metricIds = PerformanceMetric::query()
            ->whereIn('code', ['IMETA_ENROLL_TOTAL', 'TEACHERS_TOTAL', 'TEACHERS_MALE', 'TEACHERS_FEMALE'])
            ->pluck('id', 'code');

        $response = $this->withToken($schoolHeadToken)->postJson('/api/indicators/submissions', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'ANNUAL',
            'indicators' => [
                ['metric_id' => (int) $metricIds->get('IMETA_ENROLL_TOTAL'), 'target_value' => 1, 'actual_value' => 1],
                ['metric_id' => (int) $metricIds->get('TEACHERS_TOTAL'), 'target_value' => 2, 'actual_value' => 2],
                ['metric_id' => (int) $metricIds->get('TEACHERS_MALE'), 'target_value' => 3, 'actual_value' => 3],
                ['metric_id' => (int) $metricIds->get('TEACHERS_FEMALE'), 'target_value' => 4, 'actual_value' => 4],
            ],
        ]);

        $response->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.summary.totalIndicators', 4);

        $rowsByCode = collect($response->json('data.indicators', []))
            ->keyBy(static fn (array $row): string => (string) data_get($row, 'metric.code', ''));

        $this->assertSame(
            (float) $expectedStudentTotal,
            (float) data_get($rowsByCode->get('IMETA_ENROLL_TOTAL'), "actualTypedValue.values.{$currentSchoolYear}"),
        );
        $this->assertSame(
            57.0,
            (float) data_get($rowsByCode->get('TEACHERS_TOTAL'), "actualTypedValue.values.{$currentSchoolYear}"),
        );
        $this->assertSame(
            3.0,
            (float) data_get($rowsByCode->get('TEACHERS_MALE'), "actualTypedValue.values.{$currentSchoolYear}"),
        );
        $this->assertSame(
            2.0,
            (float) data_get($rowsByCode->get('TEACHERS_FEMALE'), "actualTypedValue.values.{$currentSchoolYear}"),
        );
    }

    public function test_school_head_indicator_workflow_and_monitor_review(): void
    {
        $this->seedIndicatorFixtures();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $metrics = PerformanceMetric::query()
            ->whereIn('code', ['SALO', 'PCR_K', 'WASH_RATIO'])
            ->orderByRaw("CASE code WHEN 'SALO' THEN 1 WHEN 'PCR_K' THEN 2 WHEN 'WASH_RATIO' THEN 3 ELSE 4 END")
            ->get();
        $this->assertCount(3, $metrics);

        $schoolHeadToken = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $created = $this->withToken($schoolHeadToken)->postJson('/api/indicators/submissions', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
            'notes' => 'Quarterly indicator package for monitor review.',
            'indicators' => [
                [
                    'metric_id' => $metrics[0]->id,
                    'target_value' => 80,
                    'actual_value' => 83.5,
                    'remarks' => 'Met through remediation sessions.',
                ],
                [
                    'metric_id' => $metrics[1]->id,
                    'target_value' => 90,
                    'actual_value' => 85,
                    'remarks' => 'Needs intervention.',
                ],
                [
                    'metric_id' => $metrics[2]->id,
                    'target_value' => 75,
                    'actual_value' => 75,
                    'remarks' => 'On target.',
                ],
            ],
        ]);

        $created->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.formType', 'indicator')
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.reportingPeriod', 'Q1')
            ->assertJsonPath('data.summary.totalIndicators', 3)
            ->assertJsonPath('data.summary.metIndicators', 2)
            ->assertJsonPath('data.summary.belowTargetIndicators', 1)
            ->assertJsonCount(3, 'data.indicators');

        $submissionId = (string) $created->json('data.id');

        $submitted = $this->withToken($schoolHeadToken)->postJson("/api/indicators/submissions/{$submissionId}/submit");
        $submitted->assertOk()
            ->assertJsonPath('data.status', 'submitted');

        $monitorToken = $this->loginToken('monitor', 'cspamsmonitor@gmail.com');

        $reviewed = $this->withToken($monitorToken)->postJson("/api/indicators/submissions/{$submissionId}/review", [
            'decision' => 'validated',
            'notes' => 'Indicators validated by division monitor.',
        ]);

        $reviewed->assertOk()
            ->assertJsonPath('data.status', 'validated');

        $this->assertDatabaseHas('notifications', [
            'type' => IndicatorReviewOutcomeNotification::class,
            'notifiable_type' => User::class,
            'notifiable_id' => $schoolHead->id,
        ]);

        $history = $this->withToken($monitorToken)->getJson("/api/indicators/submissions/{$submissionId}/history");
        $history->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.action', 'validated')
            ->assertJsonPath('data.1.action', 'submitted')
            ->assertJsonPath('data.2.action', 'generated');
    }

    public function test_school_head_cannot_submit_other_schools_indicator_package(): void
    {
        $this->seedIndicatorFixtures();

        /** @var User $schoolHeadOne */
        $schoolHeadOne = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var User $schoolHeadTwo */
        $schoolHeadTwo = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $metricId = (int) PerformanceMetric::query()->where('is_active', true)->value('id');

        $tokenOne = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHeadOne));
        $created = $this->withToken($tokenOne)->postJson('/api/indicators/submissions', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
            'indicators' => [
                [
                    'metric_id' => $metricId,
                    'target_value' => 88,
                    'actual_value' => 90,
                ],
            ],
        ]);

        $created->assertStatus(Response::HTTP_CREATED);
        $submissionId = (string) $created->json('data.id');

        $tokenTwo = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHeadTwo));
        $forbidden = $this->withToken($tokenTwo)->postJson("/api/indicators/submissions/{$submissionId}/submit");
        $forbidden->assertStatus(Response::HTTP_FORBIDDEN);
    }

    public function test_returned_indicator_review_requires_notes_and_resubmission_clears_review_metadata(): void
    {
        $this->seedIndicatorFixtures();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $metricId = (int) PerformanceMetric::query()->where('is_active', true)->value('id');

        $schoolHeadToken = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $created = $this->withToken($schoolHeadToken)->postJson('/api/indicators/submissions', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
            'indicators' => [
                [
                    'metric_id' => $metricId,
                    'target_value' => 88,
                    'actual_value' => 85,
                ],
            ],
        ]);
        $created->assertStatus(Response::HTTP_CREATED);
        $submissionId = (string) $created->json('data.id');

        $this->withToken($schoolHeadToken)
            ->postJson("/api/indicators/submissions/{$submissionId}/submit")
            ->assertOk();

        $monitorToken = $this->loginToken('monitor', 'cspamsmonitor@gmail.com');

        $missingNotes = $this->withToken($monitorToken)->postJson("/api/indicators/submissions/{$submissionId}/review", [
            'decision' => 'returned',
        ]);
        $missingNotes->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonValidationErrors(['notes']);

        $returned = $this->withToken($monitorToken)->postJson("/api/indicators/submissions/{$submissionId}/review", [
            'decision' => 'returned',
            'notes' => 'Please update Q1 values and remarks.',
        ]);
        $returned->assertOk()
            ->assertJsonPath('data.status', 'returned')
            ->assertJsonPath('data.reviewNotes', 'Please update Q1 values and remarks.')
            ->assertJsonPath('data.reviewedAt', fn (?string $value): bool => $value !== null);

        $resubmitted = $this->withToken($schoolHeadToken)->postJson("/api/indicators/submissions/{$submissionId}/submit");
        $resubmitted->assertOk()
            ->assertJsonPath('data.status', 'submitted')
            ->assertJsonPath('data.reviewNotes', null)
            ->assertJsonPath('data.reviewedAt', null);
    }

    public function test_school_head_can_submit_annual_compliance_matrix_values(): void
    {
        $this->seedIndicatorFixtures();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $schoolHeadToken = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $headNameMetricId = (int) PerformanceMetric::query()->where('code', 'IMETA_HEAD_NAME')->value('id');
        $sbmMetricId = (int) PerformanceMetric::query()->where('code', 'IMETA_SBM_LEVEL')->value('id');
        $internetMetricId = (int) PerformanceMetric::query()->where('code', 'INTERNET_ACCESS')->value('id');
        $incomeMetricId = (int) PerformanceMetric::query()->where('code', 'CANTEEN_INCOME')->value('id');
        $matrixYear = '2026-2027';

        $response = $this->withToken($schoolHeadToken)->postJson('/api/indicators/submissions', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'ANNUAL',
            'notes' => 'Annual I-META compliance update.',
            'indicators' => [
                [
                    'metric_id' => $headNameMetricId,
                    'target' => [
                        'values' => [
                            $matrixYear => 'Ma. Teresa Dela Cruz',
                        ],
                    ],
                    'actual' => [
                        'values' => [
                            $matrixYear => 'Ma. Teresa Dela Cruz',
                        ],
                    ],
                ],
                [
                    'metric_id' => $sbmMetricId,
                    'target' => [
                        'values' => [
                            $matrixYear => 'Level 2',
                        ],
                    ],
                    'actual' => [
                        'values' => [
                            $matrixYear => 'Level 2',
                        ],
                    ],
                ],
                [
                    'metric_id' => $internetMetricId,
                    'target' => [
                        'values' => [
                            $matrixYear => true,
                        ],
                    ],
                    'actual' => [
                        'values' => [
                            $matrixYear => true,
                        ],
                    ],
                ],
                [
                    'metric_id' => $incomeMetricId,
                    'target' => [
                        'values' => [
                            $matrixYear => 100000,
                        ],
                    ],
                    'actual' => [
                        'values' => [
                            $matrixYear => 125000,
                        ],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.reportingPeriod', 'ANNUAL')
            ->assertJsonPath('data.summary.totalIndicators', 4)
            ->assertJsonPath('data.summary.metIndicators', 4)
            ->assertJsonPath('data.summary.belowTargetIndicators', 0)
            ->assertJsonPath('data.indicators.0.targetDisplay', fn (?string $value): bool => is_string($value) && $value !== '');
    }

    public function test_school_head_can_update_existing_draft_submission(): void
    {
        $this->seedIndicatorFixtures();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $metricId = (int) PerformanceMetric::query()->where('is_active', true)->value('id');
        $token = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $created = $this->withToken($token)->postJson('/api/indicators/submissions', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
            'notes' => 'Original draft note.',
            'indicators' => [
                [
                    'metric_id' => $metricId,
                    'target_value' => 80,
                    'actual_value' => 81,
                ],
            ],
        ]);

        $created->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.status', 'draft');

        $submissionId = (string) $created->json('data.id');

        $updated = $this->withToken($token)->putJson("/api/indicators/submissions/{$submissionId}", [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
            'notes' => 'Updated draft note.',
            'indicators' => [
                [
                    'metric_id' => $metricId,
                    'target_value' => 90,
                    'actual_value' => 92,
                ],
            ],
        ]);

        $updated->assertOk()
            ->assertJsonPath('data.id', $submissionId)
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.notes', 'Updated draft note.')
            ->assertJsonPath('data.indicators.0.targetValue', 90)
            ->assertJsonPath('data.indicators.0.actualValue', 92);

        $history = $this->withToken($token)->getJson("/api/indicators/submissions/{$submissionId}/history");
        $history->assertOk()
            ->assertJsonPath('data.0.action', 'updated');
    }

    public function test_submitted_indicator_submission_cannot_be_updated(): void
    {
        $this->seedIndicatorFixtures();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $metricId = (int) PerformanceMetric::query()->where('is_active', true)->value('id');
        $token = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $created = $this->withToken($token)->postJson('/api/indicators/submissions', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
            'indicators' => [
                [
                    'metric_id' => $metricId,
                    'target_value' => 80,
                    'actual_value' => 81,
                ],
            ],
        ]);

        $created->assertStatus(Response::HTTP_CREATED);
        $submissionId = (string) $created->json('data.id');

        $this->withToken($token)
            ->postJson("/api/indicators/submissions/{$submissionId}/submit")
            ->assertOk();

        $forbiddenUpdate = $this->withToken($token)->putJson("/api/indicators/submissions/{$submissionId}", [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q1',
            'notes' => 'Should fail.',
            'indicators' => [
                [
                    'metric_id' => $metricId,
                    'target_value' => 90,
                    'actual_value' => 91,
                ],
            ],
        ]);

        $forbiddenUpdate->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('errors.submission.0', 'Only draft or returned indicator submissions can be updated.');
    }

    private function loginToken(string $role, string $login): string
    {
        $loginResponse = $this->postJson('/api/auth/login', [
            'role' => $role,
            'login' => $login,
            'password' => $this->demoPasswordForLogin($role, $login),
        ]);

        $loginResponse->assertOk();

        return (string) $loginResponse->json('token');
    }

    private function schoolHeadLogin(User $user): string
    {
        $user->loadMissing('school');

        return (string) $user->school?->school_code;
    }

    private function seedIndicatorFixtures(): void
    {
        $this->seed([
            RolesAndPermissionsSeeder::class,
            DemoDataSeeder::class,
        ]);
    }
}

