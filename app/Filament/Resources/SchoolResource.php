<?php

namespace App\Filament\Resources;

use App\Filament\Resources\SchoolResource\Pages;
use App\Models\School;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\SchoolStatus;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class SchoolResource extends Resource
{
    protected static ?string $model = School::class;

    protected static ?string $navigationIcon = 'heroicon-o-building-office-2';

    protected static ?string $navigationGroup = 'Master Data';

    protected static ?int $navigationSort = 1;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('school_code')
                    ->label('School Code')
                    ->required()
                    ->maxLength(50)
                    ->unique(ignoreRecord: true),

                Forms\Components\TextInput::make('name')
                    ->required()
                    ->maxLength(255),

                Forms\Components\TextInput::make('district')
                    ->required()
                    ->maxLength(100),

                Forms\Components\TextInput::make('region')
                    ->required()
                    ->maxLength(100),

                Forms\Components\Select::make('type')
                    ->options([
                        'public' => 'Public',
                        'private' => 'Private',
                    ])
                    ->default('public')
                    ->required(),

                Forms\Components\Select::make('status')
                    ->options(SchoolStatus::options())
                    ->default(SchoolStatus::ACTIVE->value)
                    ->required(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('school_code')
                    ->label('Code')
                    ->searchable()
                    ->sortable(),

                Tables\Columns\TextColumn::make('name')
                    ->searchable()
                    ->sortable(),

                Tables\Columns\TextColumn::make('district')
                    ->searchable()
                    ->sortable(),

                Tables\Columns\TextColumn::make('region')
                    ->searchable()
                    ->sortable(),

                Tables\Columns\TextColumn::make('type')
                    ->badge()
                    ->color(fn (string $state): string => $state === 'public' ? 'success' : 'info')
                    ->sortable(),

                Tables\Columns\TextColumn::make('status')
                    ->badge()
                    ->color(fn (string $state): string => SchoolStatus::tryFrom($state)?->color() ?? 'gray')
                    ->sortable(),

                Tables\Columns\TextColumn::make('students_count')
                    ->counts('students')
                    ->label('Students')
                    ->sortable(),

                Tables\Columns\TextColumn::make('sections_count')
                    ->counts('sections')
                    ->label('Sections')
                    ->sortable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('status')
                    ->options(SchoolStatus::options()),

                Tables\Filters\SelectFilter::make('type')
                    ->options([
                        'public' => 'Public',
                        'private' => 'Private',
                    ]),
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
        $query = parent::getEloquentQuery();

        if (static::isSchoolHead()) {
            $query->where('id', auth()->user()?->school_id);
        }

        return $query;
    }

    public static function canViewAny(): bool
    {
        return static::isDivisionAdmin() || static::isDivisionMonitor() || static::isSchoolHead();
    }

    public static function canCreate(): bool
    {
        return static::isDivisionAdmin();
    }

    public static function canEdit(Model $record): bool
    {
        return static::isDivisionAdmin();
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
            'index' => Pages\ListSchools::route('/'),
            'create' => Pages\CreateSchool::route('/create'),
            'edit' => Pages\EditSchool::route('/{record}/edit'),
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
