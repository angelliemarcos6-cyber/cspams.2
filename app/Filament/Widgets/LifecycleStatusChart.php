<?php

namespace App\Filament\Widgets;

use App\Models\Student;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\StudentStatus;
use Filament\Widgets\ChartWidget;

class LifecycleStatusChart extends ChartWidget
{
    protected static ?string $heading = 'Learner Lifecycle Distribution';

    protected ?string $pollingInterval = '30s';

    protected static ?string $maxHeight = '280px';

    protected function getType(): string
    {
        return 'pie';
    }

    /**
     * @return array<string, mixed>
     */
    protected function getData(): array
    {
        $query = Student::query();

        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            $query->where('school_id', auth()->user()?->school_id);
        }

        $labels = [];
        $values = [];

        foreach (StudentStatus::options() as $status => $label) {
            $labels[] = $label;
            $values[] = (clone $query)->where('status', $status)->count();
        }

        return [
            'datasets' => [
                [
                    'label' => 'Learners',
                    'data' => $values,
                ],
            ],
            'labels' => $labels,
        ];
    }
}
