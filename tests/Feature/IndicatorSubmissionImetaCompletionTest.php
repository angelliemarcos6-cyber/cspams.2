<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\IndicatorSubmission;
use App\Models\PerformanceMetric;
use App\Models\User;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IndicatorSubmissionImetaCompletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_single_indicator_row_is_not_complete_imeta_data(): void
    {
        $this->seed([RolesAndPermissionsSeeder::class, DemoDataSeeder::class]);

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $metricId = (int) PerformanceMetric::query()->where('code', 'SALO')->value('id');
        $this->assertGreaterThan(0, $metricId);

        $submission = IndicatorSubmission::query()->create([
            'school_id' => (int) $schoolHead->school_id,
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'ANNUAL',
            'version' => 1,
            'status' => 'draft',
            'created_by' => $schoolHead->id,
        ]);

        $submission->items()->create([
            'performance_metric_id' => $metricId,
            'target_value' => 75,
            'actual_value' => 80,
            'variance_value' => 5,
            'target_typed_value' => ['value' => 75],
            'actual_typed_value' => ['value' => 80],
            'target_display' => '75',
            'actual_display' => '80',
            'compliance_status' => 'met',
            'remarks' => null,
        ]);

        $this->assertFalse($submission->fresh()->hasImetaFormData());
    }

    public function test_required_imeta_codes_with_zero_values_are_considered_complete(): void
    {
        $this->seed([RolesAndPermissionsSeeder::class, DemoDataSeeder::class]);

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $academicYearId = (int) AcademicYear::query()->where('is_current', true)->value('id');
        $metricIds = PerformanceMetric::query()
            ->whereIn('code', ['SALO', 'PCR_K', 'WASH_RATIO'])
            ->pluck('id', 'code');

        $this->assertNotNull($metricIds->get('SALO'));
        $this->assertNotNull($metricIds->get('PCR_K'));
        $this->assertNotNull($metricIds->get('WASH_RATIO'));

        $submission = IndicatorSubmission::query()->create([
            'school_id' => (int) $schoolHead->school_id,
            'academic_year_id' => $academicYearId,
            'reporting_period' => 'ANNUAL',
            'version' => 1,
            'status' => 'draft',
            'created_by' => $schoolHead->id,
        ]);

        foreach (['SALO', 'PCR_K', 'WASH_RATIO'] as $code) {
            $submission->items()->create([
                'performance_metric_id' => (int) $metricIds->get($code),
                'target_value' => 0,
                'actual_value' => 0,
                'variance_value' => 0,
                'target_typed_value' => ['value' => 0],
                'actual_typed_value' => ['value' => 0],
                'target_display' => '0',
                'actual_display' => '0',
                'compliance_status' => 'met',
                'remarks' => null,
            ]);
        }

        $this->assertTrue($submission->fresh()->hasImetaFormData());
    }
}

