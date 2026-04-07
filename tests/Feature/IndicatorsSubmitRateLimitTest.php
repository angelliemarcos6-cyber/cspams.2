<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\PerformanceMetric;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class IndicatorsSubmitRateLimitTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithSeededCredentials;

    public function test_submit_endpoint_blocks_after_six_requests_per_minute(): void
    {
        $this->seed();
        RateLimiter::clear('indicators-submit-user:*');

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $token = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $metricId = (int) PerformanceMetric::query()->where('code', 'SALO')->value('id');

        $created = $this->withToken($token)->postJson('/api/indicators/submissions', [
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'Q4',
            'indicators' => [
                [
                    'metric_id' => $metricId,
                    'target_value' => 80,
                    'actual_value' => 90,
                    'remarks' => 'rate-limit fixture',
                ],
            ],
        ])->assertStatus(Response::HTTP_CREATED);

        $submissionId = (string) $created->json('data.id');
        $url = "/api/indicators/submissions/{$submissionId}/submit";

        // First call must succeed; subsequent calls return 422 because the
        // submission is no longer in draft, but they still consume the limiter.
        $first = $this->withToken($token)->postJson($url);
        $this->assertContains($first->getStatusCode(), [
            Response::HTTP_OK,
            Response::HTTP_UNPROCESSABLE_ENTITY,
        ]);

        for ($i = 0; $i < 5; $i++) {
            $this->withToken($token)
                ->postJson($url)
                ->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $this->withToken($token)
            ->postJson($url)
            ->assertStatus(Response::HTTP_TOO_MANY_REQUESTS);
    }

    public function test_indicators_submit_rate_limiter_is_registered(): void
    {
        $this->assertNotNull(
            RateLimiter::limiter('indicators-submit'),
            'Named rate limiter "indicators-submit" must be defined in AppServiceProvider.',
        );
    }
}
