<?php

namespace App\Filament\Resources;

use App\Filament\Resources\SectionResource\Pages;
use App\Models\AcademicYear;
use App\Models\Section;
use App\Support\Auth\UserRoleResolver;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rules\Unique;

class SectionResource extends Resource
{
    protected static ?string $model = Section::class;

    protected static ?string $navigationIcon = 'heroicon-o-rectangle-stack';

    protected static ?string $navigationGroup = 'School Management';

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\Select::make('school_id')
                    ->relationship('school', 'name')
                    ->required(fn (): bool => static::isDivisionMonitorUser())
                    ->searchable()
                    ->preload()
                    ->visible(fn (): bool => static::isDivisionMonitorUser()),

                Forms\Components\Hidden::make('school_id')
                    ->default(fn (): ?int => auth()->user()?->school_id)
                    ->dehydrated(fn (): bool => static::isSchoolHeadUser()),

                Forms\Components\Select::make('academic_year_id')
                    ->relationship('academicYear', 'name')
                    ->label('Academic Year')
                    ->required()
                    ->searchable()
                    ->preload()
                    ->default(fn (): ?int => AcademicYear::where('is_current', true)->value('id')
                        ?? AcademicYear::query()->latest('year')->value('id')),

                Forms\Components\TextInput::make('name')
                    ->label('Section Name')
                    ->required()
                    ->maxLength(100)
                    ->placeholder('e.g. Apple, Section A, Grade 7 - 1')
                    ->unique(
                        table: Section::class,
                        column: 'name',
                        ignoreRecord: true,
                        modifyRuleUsing: fn (Unique $rule, Forms\Get $get) => $rule
                            ->where('school_id', (int) $get('school_id'))
                            ->where('academic_year_id', (int) $get('academic_year_id'))
                            ->where('grade_level', (string) $get('grade_level')),
                    ),

                Forms\Components\TextInput::make('grade_level')
                    ->label('Grade Level')
                    ->required()
                    ->maxLength(50)
                    ->placeholder('e.g. Grade 7, 10, Senior High - STEM'),

                Forms\Components\TextInput::make('capacity')
                    ->label('Maximum Students')
                    ->numeric()
                    ->integer()
                    ->minValue(1)
                    ->maxValue(100)
                    ->nullable(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('name')
                    ->searchable()
                    ->sortable(),

                Tables\Columns\TextColumn::make('grade_level')
                    ->searchable()
                    ->sortable(),

                Tables\Columns\TextColumn::make('academicYear.name')
                    ->label('Academic Year')
                    ->sortable(),

                Tables\Columns\TextColumn::make('school.name')
                    ->label('School')
                    ->sortable()
                    ->visible(fn (): bool => static::isDivisionLevelUser()),

                Tables\Columns\TextColumn::make('capacity')
                    ->numeric()
                    ->sortable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('academic_year_id')
                    ->relationship('academicYear', 'name')
                    ->label('Academic Year'),

                Tables\Filters\SelectFilter::make('school_id')
                    ->relationship('school', 'name')
                    ->label('School')
                    ->visible(fn (): bool => static::isDivisionLevelUser()),
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
        $query = parent::getEloquentQuery()->with(['school', 'academicYear']);

        if (static::isSchoolHeadUser()) {
            $query->where('school_id', auth()->user()?->school_id);
        }

        return $query;
    }

    public static function canViewAny(): bool
    {
        return static::isDivisionLevelUser() || static::isSchoolHeadUser();
    }

    public static function canCreate(): bool
    {
        return static::isDivisionMonitorUser() || static::isSchoolHeadUser();
    }

    public static function canEdit(Model $record): bool
    {
        if (static::isDivisionMonitorUser()) {
            return true;
        }

        return static::isSchoolHeadUser()
            && (int) $record->school_id === (int) auth()->user()?->school_id;
    }

    public static function canDelete(Model $record): bool
    {
        if (static::isDivisionMonitorUser()) {
            return true;
        }

        return static::isSchoolHeadUser()
            && (int) $record->school_id === (int) auth()->user()?->school_id;
    }

    public static function canDeleteAny(): bool
    {
        return static::isDivisionMonitorUser();
    }

    public static function getRelations(): array
    {
        return [
            // RelationManagers\StudentsRelationManager::class,
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListSections::route('/'),
            'create' => Pages\CreateSection::route('/create'),
            'edit' => Pages\EditSection::route('/{record}/edit'),
        ];
    }

    protected static function isDivisionLevelUser(): bool
    {
        return UserRoleResolver::isDivisionLevel(auth()->user());
    }

    protected static function isDivisionMonitorUser(): bool
    {
        return UserRoleResolver::has(auth()->user(), UserRoleResolver::MONITOR);
    }

    protected static function isSchoolHeadUser(): bool
    {
        return UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD);
    }
}


