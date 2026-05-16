<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\IndicatorSubmission;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class MonitorSchoolRecordSummaryTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_monitor_school_summary_prefers_latest_monitor_relevant_submission_over_newer_draft(): void
    {
        $this->seed();

        /** @var User $monitor */
        $monitor = User::query()->where('email', 'cspamsmonitor@gmail.com')->firstOrFail();
        /** @var AcademicYear $academicYear */
        $academicYear = AcademicYear::query()->where('is_current', true)->firstOrFail();

        $school = School::query()->create([
            'school_code' => '955501',
            'name' => 'Monitor Summary Test School',
            'level' => 'High School',
            'district' => 'District Test',
            'address' => 'District Test, Region Test',
            'region' => 'Region Test',
            'type' => 'private',
            'status' => 'active',
            'reported_student_count' => 0,
            'reported_teacher_count' => 0,
            'submitted_by' => $monitor->id,
            'submitted_at' => now()->subDay(),
        ]);

        IndicatorSubmission::query()->create([
            'school_id' => $school->id,
            'academic_year_id' => $academicYear->id,
            'reporting_period' => 'ANNUAL',
            'version' => 1,
            'status' => 'returned',
            'created_by' => $monitor->id,
            'submitted_by' => $monitor->id,
            'submitted_at' => now()->subDays(3),
            'reviewed_by' => $monitor->id,
            'reviewed_at' => now()->subDays(2),
            'updated_at' => now()->subDays(2),
            'created_at' => now()->subDays(4),
        ]);

        IndicatorSubmission::query()->create([
            'school_id' => $school->id,
            'academic_year_id' => $academicYear->id,
            'reporting_period' => 'ANNUAL',
            'version' => 2,
            'status' => 'draft',
            'created_by' => $monitor->id,
            'updated_at' => now()->subHour(),
            'created_at' => now()->subHours(2),
        ]);

        $response = $this->actingAs($monitor, 'sanctum')->getJson('/api/dashboard/records');

        $response->assertOk();

        $record = collect($response->json('data'))
            ->firstWhere('schoolId', '955501');

        $this->assertIsArray($record);
        $this->assertSame('returned', data_get($record, 'indicatorLatest.status'));
    }
}
