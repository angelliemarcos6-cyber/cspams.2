<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\IndicatorSubmission;
use App\Models\School;
use App\Support\Indicators\RollingIndicatorYearWindow;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RollingAcademicYearRetentionTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_fifo_retention_keeps_only_latest_five_school_years_and_prunes_oldest_records(): void
    {
        CarbonImmutable::setTestNow('2031-08-15 10:00:00');

        foreach ([
            '2025-2026',
            '2026-2027',
            '2027-2028',
            '2028-2029',
            '2029-2030',
            '2030-2031',
        ] as $schoolYearName) {
            [$startYear, $endYear] = array_map('intval', explode('-', $schoolYearName));

            AcademicYear::query()->create([
                'name' => $schoolYearName,
                'start_date' => sprintf('%04d-06-01', $startYear),
                'end_date' => sprintf('%04d-03-31', $endYear),
                'is_current' => $schoolYearName === '2030-2031',
            ]);
        }

        $school = School::query()->create([
            'school_code' => 'RET-001',
            'name' => 'Retention Test School',
            'district' => 'District 1',
            'region' => 'Region II',
            'type' => 'public',
            'status' => 'active',
        ]);

        $oldestYearId = (int) AcademicYear::query()
            ->where('name', '2025-2026')
            ->value('id');

        $submission = IndicatorSubmission::query()->create([
            'school_id' => $school->id,
            'academic_year_id' => $oldestYearId,
            'status' => 'draft',
            'version' => 1,
        ]);

        $result = app(RollingIndicatorYearWindow::class)->sync();

        $this->assertSame(
            [
                '2027-2028',
                '2028-2029',
                '2029-2030',
                '2030-2031',
                '2031-2032',
            ],
            AcademicYear::query()->orderBy('start_date')->pluck('name')->all(),
        );
        $this->assertSame('2031-2032', AcademicYear::query()->where('is_current', true)->value('name'));
        $this->assertGreaterThanOrEqual(1, (int) ($result['academicYearsUpserted'] ?? 0));
        $this->assertSame(2, (int) ($result['academicYearsDeleted'] ?? 0));

        $this->assertDatabaseMissing('academic_years', ['name' => '2025-2026']);
        $this->assertDatabaseMissing('academic_years', ['name' => '2026-2027']);
        $this->assertDatabaseMissing('indicator_submissions', ['id' => $submission->id]);
    }
}

