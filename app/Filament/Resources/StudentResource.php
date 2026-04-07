<?php

namespace App\Filament\Resources;

use App\Filament\Resources\StudentResource\Pages;
use App\Filament\Resources\StudentResource\RelationManagers\PerformanceRecordsRelationManager;
use App\Filament\Resources\StudentResource\RelationManagers\StatusLogsRelationManager;
use App\Models\AcademicYear;
use App\Models\School;
use App\Models\Section;
use App\Models\Student;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class StudentResource extends Resource
{
    protected static ?string $model = Student::class;

    protected static ?string $navigationIcon = 'heroicon-o-users';

    protected static ?string $navigationGroup = 'Learner Management';

    protected static ?int $navigationSort = 1;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\Select::make('school_id')
                    ->label('School')
                    ->searchable()
                    ->getSearchResultsUsing(function (string $search): array {
                        $op = static::caseInsensitiveLikeOperator();

                        return School::query()
                            ->where('name', $op, "%{$search}%")
                            ->orWhere('school_code', $op, "%{$search}%")
                            ->orderBy('name')
                            ->limit(50)
                            ->pluck('name', 'id')
                            ->all();
                    })
                    ->getOptionLabelUsing(fn ($value): ?string => School::query()->whereKey($value)->value('name'))
                    ->required(fn (): bool => static::isMonitor())
                    ->visible(fn (): bool => static::isMonitor())
                    ->live(),

                Forms\Components\Hidden::make('school_id')
                    ->default(fn (): ?int => auth()->user()?->school_id)
                    ->dehydrated(fn (): bool => static::isSchoolHead()),

                Forms\Components\Select::make('academic_year_id')
                    ->label('Academic Year')
                    ->searchable()
                    ->getSearchResultsUsing(function (string $search): array {
                        $op = static::caseInsensitiveLikeOperator();

                        return AcademicYear::query()
                            ->where('name', $op, "%{$search}%")
                            ->orderByDesc('name')
                            ->limit(50)
                            ->pluck('name', 'id')
                            ->all();
                    })
                    ->getOptionLabelUsing(fn ($value): ?string => AcademicYear::query()->whereKey($value)->value('name'))
                    ->default(fn (): ?int => AcademicYear::query()->where('is_current', true)->value('id'))
                    ->required()
                    ->live(),

                Forms\Components\Select::make('section_id')
                    ->label('Section')
                    ->options(function (Forms\Get $get): array {
                        $schoolId = $get('school_id') ?: auth()->user()?->school_id;
                        $yearId = $get('academic_year_id');

                        return Section::query()
                            ->when($schoolId, fn ($query) => $query->where('school_id', $schoolId))
                            ->when($yearId, fn ($query) => $query->where('academic_year_id', $yearId))
                            ->orderBy('grade_level')
                            ->orderBy('name')
                            ->get()
                            ->mapWithKeys(fn (Section $section): array => [$section->id => $section->grade_level . ' / ' . $section->name])
                            ->all();
                    })
                    ->searchable()
                    ->preload(),

                Forms\Components\TextInput::make('lrn')
                    ->label('Learner Reference Number (LRN)')
                    ->required()
                    ->rule('digits:12')
                    ->helperText('DepEd LRN format: exactly 12 digits.')
                    ->maxLength(20)
                    ->minLength(12)
                    ->unique(ignoreRecord: true),

                Forms\Components\TextInput::make('first_name')
                    ->required()
                    ->maxLength(100),

                Forms\Components\TextInput::make('middle_name')
                    ->maxLength(100),

                Forms\Components\TextInput::make('last_name')
                    ->required()
                    ->maxLength(100),

                Forms\Components\Select::make('sex')
                    ->options([
                        'male' => 'Male',
                        'female' => 'Female',
                    ]),

                Forms\Components\DatePicker::make('birth_date'),

                Forms\Components\Select::make('status')
                    ->options(StudentStatus::options())
                    ->default(StudentStatus::ENROLLED->value)
                    ->required(),

                Forms\Components\Select::make('risk_level')
                    ->label('Risk Level')
                    ->options(StudentRiskLevel::options())
                    ->default(StudentRiskLevel::NONE->value)
                    ->required(),

                Forms\Components\TextInput::make('tracked_from_level')
                    ->label('Tracked From')
                    ->placeholder('e.g. Kindergarten'),

                Forms\Components\TextInput::make('current_level')
                    ->label('Current Level')
                    ->placeholder('e.g. Grade 8'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('lrn')
                    ->label('LRN')
                    ->searchable()
                    ->sortable(),

                Tables\Columns\TextColumn::make('last_name')
                    ->label('Learner')
                    ->formatStateUsing(fn (string $state, Student $record): string => $record->full_name)
                    ->searchable(['first_name', 'middle_name', 'last_name'])
                    ->sortable(),

                Tables\Columns\TextColumn::make('school.name')
                    ->label('School')
                    ->visible(fn (): bool => static::isMonitor())
                    ->sortable(),

                Tables\Columns\TextColumn::make('section.name')
                    ->label('Section')
                    ->sortable(),

                Tables\Columns\TextColumn::make('status')
                    ->badge()
                    ->color(fn (string $state): string => StudentStatus::tryFrom($state)?->color() ?? 'gray')
                    ->sortable(),

                Tables\Columns\TextColumn::make('risk_level')
                    ->badge()
                    ->color(fn (string $state): string => StudentRiskLevel::tryFrom($state)?->color() ?? 'gray')
                    ->sortable(),

                Tables\Columns\TextColumn::make('updated_at')
                    ->dateTime('M d, Y h:i A')
                    ->label('Last Update')
                    ->sortable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('status')
                    ->options(StudentStatus::options()),

                Tables\Filters\SelectFilter::make('risk_level')
                    ->options(StudentRiskLevel::options()),

                Tables\Filters\SelectFilter::make('school_id')
                    ->relationship('school', 'name')
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
                            $records->loadMissing(['school', 'section', 'academicYear']);

                            return response()->streamDownload(function () use ($records): void {
                                $handle = fopen('php://output', 'w');

                                fputcsv($handle, [
                                    'LRN',
                                    'First Name',
                                    'Middle Name',
                                    'Last Name',
                                    'School',
                                    'Academic Year',
                                    'Section',
                                    'Status',
                                    'Risk Level',
                                    'Updated At',
                                ]);

                                foreach ($records as $student) {
                                    fputcsv($handle, [
                                        $student->lrn,
                                        $student->first_name,
                                        $student->middle_name,
                                        $student->last_name,
                                        $student->school?->name,
                                        $student->academicYear?->name,
                                        $student->section?->name,
                                        is_string($student->status) ? $student->status : $student->status?->value,
                                        is_string($student->risk_level) ? $student->risk_level : $student->risk_level?->value,
                                        optional($student->updated_at)?->format('Y-m-d H:i:s'),
                                    ]);
                                }

                                fclose($handle);
                            }, 'students-export-' . now()->format('Ymd-His') . '.csv', [
                                'Content-Type' => 'text/csv',
                            ]);
                        }),
                ]),
            ]);
    }

    public static function getEloquentQuery(): Builder
    {
        $query = parent::getEloquentQuery()->with(['school', 'section', 'academicYear']);

        if (static::isSchoolHead()) {
            $query->where('school_id', auth()->user()?->school_id);
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

        return static::isSchoolHead() && (int) $record->school_id === (int) auth()->user()?->school_id;
    }

    public static function canDelete(Model $record): bool
    {
        return static::isMonitor();
    }

    public static function canDeleteAny(): bool
    {
        return static::isMonitor();
    }

    public static function getRelations(): array
    {
        return [
            StatusLogsRelationManager::class,
            PerformanceRecordsRelationManager::class,
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListStudents::route('/'),
            'create' => Pages\CreateStudent::route('/create'),
            'edit' => Pages\EditStudent::route('/{record}/edit'),
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

    protected static function caseInsensitiveLikeOperator(): string
    {
        return DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
    }
}