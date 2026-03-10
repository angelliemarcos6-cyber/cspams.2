<?php

namespace Tests\Unit;

use App\Support\Indicators\RollingIndicatorYearWindow;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

class RollingIndicatorYearWindowTest extends TestCase
{
    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    public function test_window_stays_anchored_to_2022_for_initial_five_year_span(): void
    {
        CarbonImmutable::setTestNow('2027-08-15 10:00:00');

        $window = (new RollingIndicatorYearWindow())->windowYears();

        $this->assertSame([
            '2023-2024',
            '2024-2025',
            '2025-2026',
            '2026-2027',
            '2027-2028',
        ], $window);
    }

    public function test_window_rolls_forward_only_when_sixth_school_year_is_reached(): void
    {
        CarbonImmutable::setTestNow('2031-08-15 10:00:00');

        $window = (new RollingIndicatorYearWindow())->windowYears();

        $this->assertSame([
            '2027-2028',
            '2028-2029',
            '2029-2030',
            '2030-2031',
            '2031-2032',
        ], $window);
    }
}
