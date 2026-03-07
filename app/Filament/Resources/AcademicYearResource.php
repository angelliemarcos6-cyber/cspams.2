<?php

namespace App\Filament\Resources;

use App\Filament\Resources\AcademicYearResource\Pages;
use App\Models\AcademicYear;
use App\Support\Auth\UserRoleResolver;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class AcademicYearResource extends Resource
{
    protected static ?string $model = AcademicYear::class;

    protected static ?string $navigationIcon = 'heroicon-o-calendar-days';

    protected static ?string $navigationGroup = 'Master Data';

    protected static ?int $navigationSort = 2;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('name')
                    ->required()
                    ->placeholder('e.g. 2025-2026')
                    ->unique(ignoreRecord: true),

                Forms\Components\DatePicker::make('start_date')
                    ->required(),

                Forms\Components\DatePicker::make('end_date')
                    ->required(),

                Forms\Components\Toggle::make('is_current')
                    ->label('Set as current academic year')
                    ->default(false),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('name')
                    ->searchable()
                    ->sortable(),

                Tables\Columns\TextColumn::make('start_date')
                    ->date()
                    ->sortable(),

                Tables\Columns\TextColumn::make('end_date')
                    ->date()
                    ->sortable(),

                Tables\Columns\IconColumn::make('is_current')
                    ->boolean()
                    ->label('Current')
                    ->sortable(),

                Tables\Columns\TextColumn::make('students_count')
                    ->counts('students')
                    ->label('Students')
                    ->sortable(),
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
        return parent::getEloquentQuery();
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
            'index' => Pages\ListAcademicYears::route('/'),
            'create' => Pages\CreateAcademicYear::route('/create'),
            'edit' => Pages\EditAcademicYear::route('/{record}/edit'),
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
