<?php

namespace App\Filament\Resources;

use App\Filament\Resources\PerformanceMetricResource\Pages;
use App\Models\PerformanceMetric;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\MetricCategory;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Model;

class PerformanceMetricResource extends Resource
{
    protected static ?string $model = PerformanceMetric::class;

    protected static ?string $navigationIcon = 'heroicon-o-calculator';

    protected static ?string $navigationGroup = 'Analytics Setup';

    protected static ?int $navigationSort = 1;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('code')
                    ->required()
                    ->maxLength(50)
                    ->unique(ignoreRecord: true),

                Forms\Components\TextInput::make('name')
                    ->required()
                    ->maxLength(255),

                Forms\Components\Select::make('category')
                    ->options(MetricCategory::options())
                    ->required(),

                Forms\Components\Textarea::make('description')
                    ->rows(3),

                Forms\Components\Toggle::make('is_active')
                    ->default(true),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('code')
                    ->searchable()
                    ->sortable(),

                Tables\Columns\TextColumn::make('name')
                    ->searchable()
                    ->sortable(),

                Tables\Columns\TextColumn::make('category')
                    ->badge()
                    ->sortable(),

                Tables\Columns\IconColumn::make('is_active')
                    ->boolean()
                    ->sortable(),

                Tables\Columns\TextColumn::make('updated_at')
                    ->dateTime('M d, Y h:i A')
                    ->label('Updated')
                    ->sortable(),
            ])
            ->filters([
                Tables\Filters\TernaryFilter::make('is_active')
                    ->label('Active'),

                Tables\Filters\SelectFilter::make('category')
                    ->options(MetricCategory::options()),
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
            'index' => Pages\ListPerformanceMetrics::route('/'),
            'create' => Pages\CreatePerformanceMetric::route('/create'),
            'edit' => Pages\EditPerformanceMetric::route('/{record}/edit'),
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
