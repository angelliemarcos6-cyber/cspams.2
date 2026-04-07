<?php

namespace App\Filament\Widgets;

use App\Models\StudentStatusLog;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\StudentStatus;
use Carbon\Carbon;
use Filament\Widgets\ChartWidget;
use Illuminate\Support\Facades\DB;

class StatusTransitionTrendChart extends ChartWidget
{
    protected static ?string $heading = 'Status Transition Trend (Last 6 Months)';

    protected static ?string $maxHeight = '280px';

    protected static ?string $pollingInterval = '60s';

    protected function getType(): string
    {
        return 'line';
    }

    /**
     * @return array<string, mixed>
     */
    protected function getData(): array
    {
        $start = now()->startOfMonth()->subMonths(5);
        $end = now()->endOfMonth();

        $query = StudentStatusLog::query()
            ->whereBetween('changed_at', [$start, $end])
            ->whereIn('to_status', [
                StudentStatus::AT_RISK->value,
                StudentStatus::DROPPED_OUT->value,
            ]);

        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            $query->whereHas('student', function ($studentQuery): void {
                $studentQuery->where('school_id', auth()->user()?->school_id);
            });
        }

        $driver = DB::getDriverName();
        $monthExpr = $driver === 'sqlite'
            ? "STRFTIME('%Y-%m', changed_at)"
            : "TO_CHAR(changed_at, 'YYYY-MM')";

        $rows = $query
            ->select([
                'to_status',
                DB::raw("{$monthExpr} as month_key"),
                DB::raw('COUNT(*) as cnt'),
            ])
            ->groupBy('to_status', DB::raw($monthExpr))
            ->get();

        $grouped = $rows->groupBy('to_status');

        $labels = [];
        $atRiskSeries = [];
        $droppedOutSeries = [];

        for ($cursor = $start->copy(); $cursor->lte($end); $cursor->addMonth()) {
            $monthKey = $cursor->format('Y-m');
            $labels[] = $cursor->format('M Y');

            $atRiskSeries[] = (int) ($grouped->get(StudentStatus::AT_RISK->value)?->firstWhere('month_key', $monthKey)?->cnt ?? 0);
            $droppedOutSeries[] = (int) ($grouped->get(StudentStatus::DROPPED_OUT->value)?->firstWhere('month_key', $monthKey)?->cnt ?? 0);
        }

        return [
            'datasets' => [
                [
                    'label' => 'At-Risk Transitions',
                    'data' => $atRiskSeries,
                    'borderColor' => '#f59e0b',
                    'backgroundColor' => 'rgba(245, 158, 11, 0.2)',
                    'fill' => false,
                    'tension' => 0.25,
                ],
                [
                    'label' => 'Dropped Out Transitions',
                    'data' => $droppedOutSeries,
                    'borderColor' => '#dc2626',
                    'backgroundColor' => 'rgba(220, 38, 38, 0.2)',
                    'fill' => false,
                    'tension' => 0.25,
                ],
            ],
            'labels' => $labels,
        ];
    }
}
