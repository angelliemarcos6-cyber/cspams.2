<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\PerformanceMetric;
use App\Models\User;
use App\Notifications\IndicatorReviewOutcomeNotification;
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
        $this->seed();

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

    public function test_auto_calculated_kpi_replaces_manual_payload_values(): void
    {
        $this->seed();

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
                    'remarks' => 'Manual placeholder that should be overridden.',
                ],
            ],
        ]);

        $created->assertStatus(Response::HTTP_CREATED)
            ->assertJsonPath('data.summary.totalIndicators', 1);

        /** @var array<string, mixed>|null $nerRow */
        $nerRow = collect($created->json('data.indicators', []))
            ->first(static fn (mixed $row): bool => is_array($row) && (($row['metric']['code'] ?? null) === 'NER'));

        $this->assertIsArray($nerRow);
        $this->assertNotSame(999.0, (float) ($nerRow['targetValue'] ?? 0));
        $this->assertIsArray($nerRow['targetTypedValue']['values'] ?? null);
        $this->assertIsArray($nerRow['actualTypedValue']['values'] ?? null);
        $this->assertCount(5, $nerRow['targetTypedValue']['values']);
        $this->assertCount(5, $nerRow['actualTypedValue']['values']);
    }

    public function test_school_head_indicator_workflow_and_monitor_review(): void
    {
        $this->seed();

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

        $monitorToken = $this->loginToken('monitor', 'monitor@cspams.local');

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
        $this->seed();

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
        $this->seed();

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

        $monitorToken = $this->loginToken('monitor', 'monitor@cspams.local');

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
        $this->seed();

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
        $this->seed();

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
        $this->seed();

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
}
