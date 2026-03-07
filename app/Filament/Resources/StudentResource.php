<?php

namespace App\Filament\Resources;

use App\Filament\Resources\StudentResource\Pages;
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
use Illuminate\Database\Eloquent\Model;

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
                    ->options(fn (): array => School::query()->orderBy('name')->pluck('name', 'id')->all())
                    ->required(fn (): bool => static::isDivisionAdmin())
                    ->visible(fn (): bool => static::isDivisionAdmin())
                    ->live(),

                Forms\Components\Hidden::make('school_id')
                    ->default(fn (): ?int => auth()->user()?->school_id)
                    ->dehydrated(fn (): bool => static::isSchoolHead()),

                Forms\Components\Select::make('academic_year_id')
                    ->label('Academic Year')
                    ->options(fn (): array => AcademicYear::query()->orderByDesc('name')->pluck('name', 'id')->all())
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
                    ->visible(fn (): bool => static::isDivisionAdmin() || static::isDivisionMonitor())
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
                    ->visible(fn (): bool => static::isDivisionAdmin() || static::isDivisionMonitor()),
            ])
            ->actions([
                Tables\Actions\EditAction::make(),
                Tables\Actions\DeleteAction::make(),
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    Tables\Actions\DeleteBulkAction::make(),
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
        return static::isDivisionAdmin() || static::isDivisionMonitor() || static::isSchoolHead();
    }

    public static function canCreate(): bool
    {
        return static::isDivisionAdmin() || static::isSchoolHead();
    }

    public static function canEdit(Model $record): bool
    {
        if (static::isDivisionAdmin()) {
            return true;
        }

        return static::isSchoolHead() && (int) $record->school_id === (int) auth()->user()?->school_id;
    }

    public static function canDelete(Model $record): bool
    {
        return static::isDivisionAdmin();
    }

    public static function canDeleteAny(): bool
    {
        return static::isDivisionAdmin();
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListStudents::route('/'),
            'create' => Pages\CreateStudent::route('/create'),
            'edit' => Pages\EditStudent::route('/{record}/edit'),
        ];
    }

    protected static function isDivisionAdmin(): bool
    {
        return UserRoleResolver::has(auth()->user(), UserRoleResolver::DIVISION_ADMIN);
    }

    protected static function isDivisionMonitor(): bool
    {
        return UserRoleResolver::has(auth()->user(), UserRoleResolver::MONITOR);
    }

    protected static function isSchoolHead(): bool
    {
        return UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD);
    }
}
