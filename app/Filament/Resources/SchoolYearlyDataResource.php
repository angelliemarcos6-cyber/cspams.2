<?php

namespace App\Filament\Resources;

use App\Filament\Resources\SchoolYearlyDataResource\Pages;
use App\Models\SchoolYearlyData;
use Filament\Forms\Components\Component;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\KeyValue;
use Filament\Forms\Components\Select;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class SchoolYearlyDataResource extends Resource
{
    protected static ?string $model = SchoolYearlyData::class;

    protected static ?string $navigationIcon = 'heroicon-o-rectangle-stack';

    public static function getEloquentQuery(): Builder
    {
        $query = parent::getEloquentQuery();

        $user = auth()->user();
        if ($user?->school_id) {
            $query->where('school_id', $user->school_id);
        }

        return $query;
    }

    protected static function schoolIdField(): Component
    {
        $user = auth()->user();

        // School head: force their school_id, don't show selector
        if ($user?->school_id) {
            return Hidden::make('school_id')
            ->default($user->school_id)
            ->dehydrated(true);
        }

        // Monitor/admin: can select school
        return Select::make('school_id')
        ->relationship('school', 'name')
        ->searchable()
        ->preload()
        ->required();
    }

    public static function form(Form $form): Form
    {
        return $form->schema([
            static::schoolIdField(),

                             Select::make('academic_year_id')
                             ->relationship('academicYear', 'name')
                             ->searchable()
                             ->preload()
                             ->required(),

                             Select::make('status')
                             ->options([
                                 'draft' => 'Draft',
                                 'submitted' => 'Submitted',
                                 'approved' => 'Approved',
                             ])
                             ->required(),

                             KeyValue::make('targets_met')
                             ->label('Targets Met')
                             ->keyLabel('Metric')
                             ->valueLabel('Value')
                             ->reorderable(),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
        ->columns([
            TextColumn::make('academicYear.name')
            ->label('Academic Year')
            ->sortable()
            ->searchable(),

                  TextColumn::make('status')
                  ->sortable()
                  ->badge(),

                  TextColumn::make('submitted_at')
                  ->label('Submitted At')
                  ->dateTime()
                  ->toggleable(isToggledHiddenByDefault: true),

                  TextColumn::make('school.name')
                  ->label('School')
                  ->toggleable(isToggledHiddenByDefault: true),
        ])
        ->actions([
            Tables\Actions\EditAction::make(),
        ])
        ->bulkActions([
            Tables\Actions\BulkActionGroup::make([
                Tables\Actions\DeleteBulkAction::make(),
            ]),
        ]);
    }

    public static function getRelations(): array
    {
        return [
            //
        ];
    }

    public static function getPages(): array
    {
        return [
            'index'  => Pages\ListSchoolYearlyData::route('/'),
            'create' => Pages\CreateSchoolYearlyData::route('/create'),
            'edit'   => Pages\EditSchoolYearlyData::route('/{record}/edit'),
        ];
    }
}
