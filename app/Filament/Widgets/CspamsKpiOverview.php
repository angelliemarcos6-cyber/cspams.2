<?php

namespace App\Filament\Widgets;

use App\Models\School;
use App\Models\Student;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\StudentStatus;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

class CspamsKpiOverview extends StatsOverviewWidget
{
    protected ?string $pollingInterval = '30s';

    /**
     * @return array<Stat>
     */
    protected function getStats(): array
    {
        $schoolId = UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)
            ? auth()->user()?->school_id
            : null;

        $schoolsQuery = School::query();
        $studentsQuery = Student::query();

        if ($schoolId) {
            $schoolsQuery->whereKey($schoolId);
            $studentsQuery->where('school_id', $schoolId);
        }

        $totalSchools = $schoolsQuery->count();
        $totalLearners = (clone $studentsQuery)->count();
        $atRisk = (clone $studentsQuery)->where('status', StudentStatus::AT_RISK->value)->count();
        $droppedOut = (clone $studentsQuery)->where('status', StudentStatus::DROPPED_OUT->value)->count();

        $dropoutRate = $totalLearners > 0
            ? round(($droppedOut / $totalLearners) * 100, 2)
            : 0;

        return [
            Stat::make('Total Schools', number_format($totalSchools))
                ->description('Schools currently in CSPAMS'),

            Stat::make('Total Learners', number_format($totalLearners))
                ->description('Tracked learners in current records'),

            Stat::make('At-Risk Learners', number_format($atRisk))
                ->description('Learners requiring intervention')
                ->color($atRisk > 0 ? 'warning' : 'success'),

            Stat::make('Dropout Rate', number_format($dropoutRate, 2) . '%')
                ->description('Current flagged dropout ratio')
                ->color($dropoutRate > 5 ? 'danger' : 'success'),
        ];
    }
}
