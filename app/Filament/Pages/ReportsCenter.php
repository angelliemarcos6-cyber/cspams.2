<?php

namespace App\Filament\Pages;

use App\Models\AcademicYear;
use App\Models\School;
use App\Models\Student;
use App\Models\StudentPerformanceRecord;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\ReportingPeriod;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;
use Filament\Forms\Components\Select;
use Filament\Forms\Concerns\InteractsWithForms;
use Filament\Forms\Contracts\HasForms;
use Filament\Forms\Form;
use Filament\Pages\Page;

class ReportsCenter extends Page implements HasForms
{
    use InteractsWithForms;

    protected static ?string $navigationIcon = 'heroicon-o-document-chart-bar';

    protected static ?string $navigationGroup = 'Reports';

    protected static ?string $navigationLabel = 'Reports Center';

    protected static ?int $navigationSort = 1;

    protected static string $view = 'filament.pages.reports-center';

    /**
     * @var array<string, mixed>
     */
    public ?array $data = [];

    public function mount(): void
    {
        $this->form->fill([
            'academic_year_id' => AcademicYear::query()->where('is_current', true)->value('id')
                ?? AcademicYear::query()->orderByDesc('start_date')->value('id'),
            'period' => null,
            'school_id' => UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)
                ? auth()->user()?->school_id
                : null,
        ]);
    }

    public static function canAccess(): bool
    {
        return auth()->check() && (
            UserRoleResolver::has(auth()->user(), UserRoleResolver::MONITOR)
            || UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)
        );
    }

    public function form(Form $form): Form
    {
        return $form
            ->schema([
                Select::make('academic_year_id')
                    ->label('Academic Year')
                    ->options(fn (): array => AcademicYear::query()->orderByDesc('name')->pluck('name', 'id')->all())
                    ->required()
                    ->live(),

                Select::make('period')
                    ->label('Period')
                    ->options(['' => 'All Periods'] + ReportingPeriod::options())
                    ->default('')
                    ->live(),

                Select::make('school_id')
                    ->label('School')
                    ->options(fn (): array => ['' => 'All Schools'] + School::query()->orderBy('name')->pluck('name', 'id')->all())
                    ->visible(fn (): bool => UserRoleResolver::has(auth()->user(), UserRoleResolver::MONITOR))
                    ->live(),
            ])
            ->statePath('data')
            ->columns(3);
    }

    public function downloadSchoolSummaryCsv()
    {
        $rows = $this->schoolSummaryRows();

        return response()->streamDownload(function () use ($rows): void {
            $handle = fopen('php://output', 'w');

            fputcsv($handle, [
                'School',
                'District',
                'Total Learners',
                'At-Risk Learners',
                'Dropped Out',
                'High Risk',
                'Dropout Rate (%)',
                'Performance Submissions',
                'Latest Submission',
            ]);

            foreach ($rows as $row) {
                fputcsv($handle, [
                    $row['school'],
                    $row['district'],
                    $row['total_learners'],
                    $row['at_risk'],
                    $row['dropped_out'],
                    $row['high_risk'],
                    $row['dropout_rate'],
                    $row['performance_submissions'],
                    $row['latest_submission'],
                ]);
            }

            fclose($handle);
        }, 'school-summary-report-' . now()->format('Ymd-His') . '.csv', [
            'Content-Type' => 'text/csv',
        ]);
    }

    public function downloadPerformanceSummaryCsv()
    {
        $rows = $this->performanceSummaryRows();

        return response()->streamDownload(function () use ($rows): void {
            $handle = fopen('php://output', 'w');

            fputcsv($handle, [
                'School',
                'Metric',
                'Period',
                'Records',
                'Average Value',
                'Lowest Value',
                'Highest Value',
            ]);

            foreach ($rows as $row) {
                fputcsv($handle, [
                    $row['school'],
                    $row['metric'],
                    $row['period'],
                    $row['records'],
                    $row['average_value'],
                    $row['lowest_value'],
                    $row['highest_value'],
                ]);
            }

            fclose($handle);
        }, 'performance-summary-report-' . now()->format('Ymd-His') . '.csv', [
            'Content-Type' => 'text/csv',
        ]);
    }

    /**
     * @return array<int, array<string, int|float|string>>
     */
    public function schoolSummaryPreviewRows(): array
    {
        return array_slice($this->schoolSummaryRows(), 0, 8);
    }

    /**
     * @return array<int, array<string, int|float|string>>
     */
    public function performanceSummaryPreviewRows(): array
    {
        return array_slice($this->performanceSummaryRows(), 0, 8);
    }

    /**
     * @return array<int, array<string, int|float|string>>
     */
    private function schoolSummaryRows(): array
    {
        $academicYearId = (int) ($this->data['academic_year_id'] ?? 0);

        if (! $academicYearId) {
            return [];
        }

        $period = $this->selectedPeriod();
        $schoolId = $this->selectedSchoolId();

        $schools = School::query()
            ->select(['id', 'name', 'district'])
            ->when($schoolId, fn ($query, int $value) => $query->whereKey($value))
            ->orderBy('name')
            ->get();

        $rows = [];

        foreach ($schools as $school) {
            $studentsBase = Student::query()
                ->where('school_id', $school->id)
                ->where('academic_year_id', $academicYearId);

            $totalLearners = (clone $studentsBase)->count();
            $atRisk = (clone $studentsBase)->where('status', StudentStatus::AT_RISK->value)->count();
            $droppedOut = (clone $studentsBase)->where('status', StudentStatus::DROPPED_OUT->value)->count();
            $highRisk = (clone $studentsBase)->where('risk_level', StudentRiskLevel::HIGH->value)->count();

            $performanceBase = StudentPerformanceRecord::query()
                ->where('academic_year_id', $academicYearId)
                ->whereHas('student', function ($studentQuery) use ($school): void {
                    $studentQuery->where('school_id', $school->id);
                });

            if ($period) {
                $performanceBase->where('period', $period);
            }

            $performanceSubmissions = (clone $performanceBase)->count();
            $latestSubmission = (clone $performanceBase)->max('submitted_at');

            $rows[] = [
                'school' => $school->name,
                'district' => $school->district,
                'total_learners' => $totalLearners,
                'at_risk' => $atRisk,
                'dropped_out' => $droppedOut,
                'high_risk' => $highRisk,
                'dropout_rate' => $totalLearners > 0 ? round(($droppedOut / $totalLearners) * 100, 2) : 0,
                'performance_submissions' => $performanceSubmissions,
                'latest_submission' => $latestSubmission ? (string) $latestSubmission : '-',
            ];
        }

        return $rows;
    }

    /**
     * @return array<int, array<string, int|float|string>>
     */
    private function performanceSummaryRows(): array
    {
        $academicYearId = (int) ($this->data['academic_year_id'] ?? 0);

        if (! $academicYearId) {
            return [];
        }

        $period = $this->selectedPeriod();
        $schoolId = $this->selectedSchoolId();

        $records = StudentPerformanceRecord::query()
            ->with(['student.school:id,name', 'metric:id,name'])
            ->where('academic_year_id', $academicYearId)
            ->when($period, fn ($query, string $value) => $query->where('period', $value))
            ->when($schoolId, function ($query, int $value): void {
                $query->whereHas('student', function ($studentQuery) use ($value): void {
                    $studentQuery->where('school_id', $value);
                });
            })
            ->get();

        $grouped = $records->groupBy(function (StudentPerformanceRecord $record): string {
            $periodValue = is_string($record->period) ? $record->period : $record->period?->value;

            return implode('|', [
                $record->student?->school?->name ?? 'Unknown School',
                $record->metric?->name ?? 'Unknown Metric',
                $periodValue ?? '-',
            ]);
        });

        $rows = [];

        foreach ($grouped as $key => $items) {
            [$schoolName, $metricName, $periodValue] = explode('|', $key);
            $values = $items->pluck('value')->map(fn ($value): float => (float) $value);

            $rows[] = [
                'school' => $schoolName,
                'metric' => $metricName,
                'period' => ReportingPeriod::options()[$periodValue] ?? $periodValue,
                'records' => $items->count(),
                'average_value' => round($values->avg() ?? 0, 2),
                'lowest_value' => round($values->min() ?? 0, 2),
                'highest_value' => round($values->max() ?? 0, 2),
            ];
        }

        usort($rows, function (array $a, array $b): int {
            return [$a['school'], $a['metric'], $a['period']] <=> [$b['school'], $b['metric'], $b['period']];
        });

        return $rows;
    }

    private function selectedPeriod(): ?string
    {
        $period = $this->data['period'] ?? null;

        return is_string($period) && $period !== '' ? $period : null;
    }

    private function selectedSchoolId(): ?int
    {
        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            return auth()->user()?->school_id;
        }

        $schoolId = $this->data['school_id'] ?? null;

        return $schoolId ? (int) $schoolId : null;
    }
}
