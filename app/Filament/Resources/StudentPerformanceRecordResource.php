<?php

namespace App\Filament\Resources;

use App\Filament\Resources\StudentPerformanceRecordResource\Pages;
use App\Models\AcademicYear;
use App\Models\PerformanceMetric;
use App\Models\School;
use App\Models\Student;
use App\Models\StudentPerformanceRecord;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\ReportingPeriod;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Eloquent\Model;

class StudentPerformanceRecordResource extends Resource
{
    protected static ?string $model = StudentPerformanceRecord::class;

    protected static ?string $navigationIcon = 'heroicon-o-chart-pie';

    protected static ?string $navigationGroup = 'Performance';

    protected static ?int $navigationSort = 1;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\Select::make('school_id')
                    ->label('School')
                    ->options(fn (): array => School::query()->orderBy('name')->pluck('name', 'id')->all())
                    ->visible(fn (): bool => static::isMonitor())
                    ->dehydrated(false)
                    ->live(),

                Forms\Components\Select::make('student_id')
                    ->label('Learner')
                    ->options(function (Forms\Get $get): array {
                        $schoolId = $get('school_id');

                        $query = Student::query()->orderBy('last_name')->orderBy('first_name');

                        if (static::isSchoolHead()) {
                            $query->where('school_id', auth()->user()?->school_id);
                        }

                        if (static::isMonitor() && $schoolId) {
                            $query->where('school_id', $schoolId);
                        }

                        return $query
                            ->limit(300)
                            ->get()
                            ->mapWithKeys(fn (Student $student): array => [
                                $student->id => $student->lrn . ' - ' . $student->full_name,
                            ])
                            ->all();
                    })
                    ->searchable()
                    ->required(),

                Forms\Components\Select::make('performance_metric_id')
                    ->label('Metric')
                    ->options(fn (): array => PerformanceMetric::query()->where('is_active', true)->orderBy('name')->pluck('name', 'id')->all())
                    ->required(),

                Forms\Components\Select::make('academic_year_id')
                    ->label('Academic Year')
                    ->options(fn (): array => AcademicYear::query()->orderByDesc('name')->pluck('name', 'id')->all())
                    ->default(fn (): ?int => AcademicYear::query()->where('is_current', true)->value('id'))
                    ->required(),

                Forms\Components\Select::make('period')
                    ->options(ReportingPeriod::options())
                    ->default(ReportingPeriod::Q1->value)
                    ->required(),

                Forms\Components\TextInput::make('value')
                    ->numeric()
                    ->required()
                    ->minValue(0)
                    ->maxValue(999999.99),

                Forms\Components\Textarea::make('remarks')
                    ->rows(3),

                Forms\Components\Hidden::make('encoded_by')
                    ->default(fn (): ?int => auth()->id())
                    ->dehydrated(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('student.lrn')
                    ->label('LRN')
                    ->searchable()
                    ->sortable(),

                Tables\Columns\TextColumn::make('student.last_name')
                    ->label('Learner')
                    ->formatStateUsing(fn (string $state, StudentPerformanceRecord $record): string => $record->student?->full_name ?? '-')
                    ->sortable(),

                Tables\Columns\TextColumn::make('student.school.name')
                    ->label('School')
                    ->visible(fn (): bool => static::isMonitor())
                    ->sortable(),

                Tables\Columns\TextColumn::make('metric.name')
                    ->label('Metric')
                    ->sortable(),

                Tables\Columns\TextColumn::make('academicYear.name')
                    ->label('Academic Year')
                    ->sortable(),

                Tables\Columns\TextColumn::make('period')
                    ->badge()
                    ->formatStateUsing(function (mixed $state): string {
                        $period = self::periodValue($state);

                        return $period ? (ReportingPeriod::options()[$period] ?? $period) : '-';
                    })
                    ->sortable(),

                Tables\Columns\TextColumn::make('value')
                    ->numeric(decimalPlaces: 2)
                    ->sortable(),

                Tables\Columns\TextColumn::make('submitted_at')
                    ->dateTime('M d, Y h:i A')
                    ->label('Submitted')
                    ->sortable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('academic_year_id')
                    ->relationship('academicYear', 'name')
                    ->label('Academic Year'),

                Tables\Filters\SelectFilter::make('period')
                    ->options(ReportingPeriod::options()),

                Tables\Filters\SelectFilter::make('school_id')
                    ->label('School')
                    ->options(fn (): array => School::query()->orderBy('name')->pluck('name', 'id')->all())
                    ->query(function (Builder $query, array $data): Builder {
                        $schoolId = $data['value'] ?? null;

                        return $query->when($schoolId, function (Builder $innerQuery, $value): Builder {
                            return $innerQuery->whereHas('student', function (Builder $studentQuery) use ($value): void {
                                $studentQuery->where('school_id', $value);
                            });
                        });
                    })
                    ->visible(fn (): bool => static::isMonitor()),
            ])
            ->actions([
                Tables\Actions\EditAction::make(),
                Tables\Actions\DeleteAction::make(),
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    Tables\Actions\DeleteBulkAction::make(),
                    Tables\Actions\BulkAction::make('export_selected_csv')
                        ->label('Export Selected CSV')
                        ->icon('heroicon-o-arrow-down-tray')
                        ->deselectRecordsAfterCompletion()
                        ->action(function (EloquentCollection $records) {
                            $records->loadMissing(['student.school', 'metric', 'academicYear', 'encoder']);

                            return response()->streamDownload(function () use ($records): void {
                                $handle = fopen('php://output', 'w');

                                fputcsv($handle, [
                                    'Student LRN',
                                    'Student Name',
                                    'School',
                                    'Metric',
                                    'Academic Year',
                                    'Period',
                                    'Value',
                                    'Remarks',
                                    'Encoded By',
                                    'Submitted At',
                                ]);

                                foreach ($records as $record) {
                                    fputcsv($handle, [
                                        $record->student?->lrn,
                                        $record->student?->full_name,
                                        $record->student?->school?->name,
                                        $record->metric?->name,
                                        $record->academicYear?->name,
                                        self::periodValue($record->period),
                                        $record->value,
                                        $record->remarks,
                                        $record->encoder?->name,
                                        optional($record->submitted_at)?->format('Y-m-d H:i:s'),
                                    ]);
                                }

                                fclose($handle);
                            }, 'performance-records-export-' . now()->format('Ymd-His') . '.csv', [
                                'Content-Type' => 'text/csv',
                            ]);
                        }),
                ]),
            ]);
    }

    public static function getEloquentQuery(): Builder
    {
        $query = parent::getEloquentQuery()->with(['student.school', 'metric', 'academicYear']);

        if (static::isSchoolHead()) {
            $query->whereHas('student', function (Builder $studentQuery): void {
                $studentQuery->where('school_id', auth()->user()?->school_id);
            });
        }

        return $query;
    }

    public static function canViewAny(): bool
    {
        return static::isMonitor() || static::isSchoolHead();
    }

    public static function canCreate(): bool
    {
        return static::isMonitor() || static::isSchoolHead();
    }

    public static function canEdit(Model $record): bool
    {
        if (static::isMonitor()) {
            return true;
        }

        return static::isSchoolHead() && (int) $record->student?->school_id === (int) auth()->user()?->school_id;
    }

    public static function canDelete(Model $record): bool
    {
        return static::isMonitor();
    }

    public static function canDeleteAny(): bool
    {
        return static::isMonitor();
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListStudentPerformanceRecords::route('/'),
            'create' => Pages\CreateStudentPerformanceRecord::route('/create'),
            'edit' => Pages\EditStudentPerformanceRecord::route('/{record}/edit'),
        ];
    }

    protected static function isMonitor(): bool
    {
        return UserRoleResolver::has(auth()->user(), UserRoleResolver::MONITOR);
    }

    protected static function isSchoolHead(): bool
    {
        return UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD);
    }

    private static function periodValue(mixed $period): ?string
    {
        if ($period instanceof ReportingPeriod) {
            return $period->value;
        }

        return is_string($period) && $period !== '' ? $period : null;
    }
}
