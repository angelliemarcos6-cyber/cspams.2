<?php

namespace App\Filament\Pages;

use App\Filament\Widgets\AtRiskWatchlistTable;
use App\Filament\Widgets\CspamsKpiOverview;
use App\Filament\Widgets\LifecycleStatusChart;
use App\Filament\Widgets\SchoolSubmissionTable;
use App\Filament\Widgets\StatusTransitionTrendChart;
use App\Support\Auth\UserRoleResolver;
use Filament\Pages\Dashboard;

class MonitorDashboard extends Dashboard
{
    protected static ?string $navigationIcon = 'heroicon-o-chart-pie';

    protected static ?string $navigationLabel = 'CSPAMS Dashboard';

    protected static ?int $navigationSort = 1;

    public static function canAccess(): bool
    {
        return auth()->check() && (
            UserRoleResolver::isDivisionLevel(auth()->user()) ||
            UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)
        );
    }

    /**
     * @return array<class-string>
     */
    public function getWidgets(): array
    {
        return [
            CspamsKpiOverview::class,
            LifecycleStatusChart::class,
            StatusTransitionTrendChart::class,
            SchoolSubmissionTable::class,
            AtRiskWatchlistTable::class,
        ];
    }
}