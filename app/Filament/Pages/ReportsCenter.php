<?php

namespace App\Filament\Pages;

use App\Models\AcademicYear;
use App\Models\School;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\ReportingPeriod;
use App\Support\Reports\PerformanceSummaryReportService;
use App\Support\Reports\ReportFilters;
use App\Support\Reports\SchoolSummaryReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Filament\Forms\Components\Select;
use Filament\Forms\Concerns\InteractsWithForms;
use Filament\Forms\Contracts\HasForms;
use Filament\Forms\Form;
use Filament\Pages\Page;
use Carbon\Carbon;
use Illuminate\Validation\ValidationException;

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

    /**
     * @var array<int, array<string, int|float|string>>|null
     */
    private ?array $schoolSummaryCache = null;

    /**
     * @var array<int, array<string, int|float|string>>|null
     */
    private ?array $performanceSummaryCache = null;

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

    public function updatedData(): void
    {
        $this->resetComputedReportCaches();
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
                    $this->formatCsvDatetime($row['latest_submission'] ?? null),
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

    public function downloadSchoolSummaryExcel()
    {
        $rows = $this->schoolSummaryRows();

        return response()->streamDownload(function () use ($rows): void {
            echo view('exports.school-summary-excel', [
                'rows' => $rows,
                'generatedAt' => now()->format('Y-m-d H:i:s'),
            ])->render();
        }, 'school-summary-report-' . now()->format('Ymd-His') . '.xls', [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
        ]);
    }

    public function downloadPerformanceSummaryExcel()
    {
        $rows = $this->performanceSummaryRows();

        return response()->streamDownload(function () use ($rows): void {
            echo view('exports.performance-summary-excel', [
                'rows' => $rows,
                'generatedAt' => now()->format('Y-m-d H:i:s'),
            ])->render();
        }, 'performance-summary-report-' . now()->format('Ymd-His') . '.xls', [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
        ]);
    }

    public function downloadSchoolSummaryPdf()
    {
        $rows = $this->schoolSummaryRows();

        $pdf = Pdf::loadView('exports.school-summary-pdf', [
            'rows' => $rows,
            'generatedAt' => now()->format('Y-m-d H:i:s'),
            'filters' => $this->reportFilters(),
        ])->setPaper('a4', 'landscape');

        return response()->streamDownload(static function () use ($pdf): void {
            echo $pdf->output();
        }, 'school-summary-report-' . now()->format('Ymd-His') . '.pdf');
    }

    public function downloadPerformanceSummaryPdf()
    {
        $rows = $this->performanceSummaryRows();

        $pdf = Pdf::loadView('exports.performance-summary-pdf', [
            'rows' => $rows,
            'generatedAt' => now()->format('Y-m-d H:i:s'),
            'filters' => $this->reportFilters(),
        ])->setPaper('a4', 'landscape');

        return response()->streamDownload(static function () use ($pdf): void {
            echo $pdf->output();
        }, 'performance-summary-report-' . now()->format('Ymd-His') . '.pdf');
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
        if ($this->schoolSummaryCache !== null) {
            return $this->schoolSummaryCache;
        }

        $service = app(SchoolSummaryReportService::class);
        $this->schoolSummaryCache = $service->generate($this->reportFilters());

        return $this->schoolSummaryCache;
    }

    /**
     * @return array<int, array<string, int|float|string>>
     */
    private function performanceSummaryRows(): array
    {
        if ($this->performanceSummaryCache !== null) {
            return $this->performanceSummaryCache;
        }

        $service = app(PerformanceSummaryReportService::class);
        $this->performanceSummaryCache = $service->generate($this->reportFilters());

        return $this->performanceSummaryCache;
    }

    private function resetComputedReportCaches(): void
    {
        $this->schoolSummaryCache = null;
        $this->performanceSummaryCache = null;
    }

    private function reportFilters(): ReportFilters
    {
        $forcedSchoolId = UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)
            ? auth()->user()?->school_id
            : null;

        $filters = ReportFilters::fromState($this->data ?? [], $forcedSchoolId);
        $this->assertValidFilters($filters);

        return $filters;
    }

    private function assertValidFilters(ReportFilters $filters): void
    {
        if (! $filters->academicYearId || ! AcademicYear::query()->whereKey($filters->academicYearId)->exists()) {
            throw ValidationException::withMessages([
                'data.academic_year_id' => 'Please select a valid academic year.',
            ]);
        }

        if ($filters->period !== null && ReportingPeriod::tryFrom($filters->period) === null) {
            throw ValidationException::withMessages([
                'data.period' => 'Selected period is not valid.',
            ]);
        }

        if ($filters->schoolId !== null && ! School::query()->whereKey($filters->schoolId)->exists()) {
            throw ValidationException::withMessages([
                'data.school_id' => 'Selected school is not valid.',
            ]);
        }
    }

    private function formatCsvDatetime(mixed $value): string
    {
        if (! is_string($value) || $value === '-' || $value === '') {
            return '-';
        }

        try {
            return Carbon::parse($value)->format('Y-m-d H:i:s');
        } catch (\Throwable) {
            return $value;
        }
    }
}
