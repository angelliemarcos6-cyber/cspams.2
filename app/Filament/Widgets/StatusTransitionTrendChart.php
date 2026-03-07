<?php

namespace App\Filament\Widgets;

use App\Models\StudentStatusLog;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\StudentStatus;
use Carbon\Carbon;
use Filament\Widgets\ChartWidget;

class StatusTransitionTrendChart extends ChartWidget
{
    protected static ?string $heading = 'Status Transition Trend (Last 6 Months)';

    protected static ?string $maxHeight = '280px';

    protected ?string $pollingInterval = '60s';

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
            ->whereBetween('changed_at', [$start, $end]);

        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            $query->whereHas('student', function ($studentQuery): void {
                $studentQuery->where('school_id', auth()->user()?->school_id);
            });
        }

        $logs = $query->get(['to_status', 'changed_at']);

        $labels = [];
        $atRiskSeries = [];
        $droppedOutSeries = [];

        for ($cursor = $start->copy(); $cursor->lte($end); $cursor->addMonth()) {
            $monthKey = $cursor->format('Y-m');
            $labels[] = $cursor->format('M Y');

            $atRiskSeries[] = $logs
                ->filter(fn (StudentStatusLog $log): bool => Carbon::parse($log->changed_at)->format('Y-m') === $monthKey)
                ->where('to_status', StudentStatus::AT_RISK->value)
                ->count();

            $droppedOutSeries[] = $logs
                ->filter(fn (StudentStatusLog $log): bool => Carbon::parse($log->changed_at)->format('Y-m') === $monthKey)
                ->where('to_status', StudentStatus::DROPPED_OUT->value)
                ->count();
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
