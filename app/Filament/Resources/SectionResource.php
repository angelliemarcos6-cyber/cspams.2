<?php

namespace App\Filament\Resources;

use App\Filament\Resources\SectionResource\Pages;
use App\Models\Section;
use Filament\Forms\Components\Component;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class SectionResource extends Resource
{
    protected static ?string $model = Section::class;
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

        // School head: auto-fill + hide
        if ($user?->school_id) {
            return Hidden::make('school_id')
            ->default(fn () => auth()->user()?->school_id)
            ->required();
        }

        // Monitor/Admin: choose school
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

                             TextInput::make('grade_level')
                             ->numeric()
                             ->minValue(1)
                             ->maxValue(12)
                             ->required(),

                             TextInput::make('name')
                             ->maxLength(255)
                             ->required(),

                             TextInput::make('track')
                             ->maxLength(255)
                             ->nullable(),

                             TextInput::make('adviser_name')
                             ->maxLength(255)
                             ->nullable(),
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

                  TextColumn::make('grade_level')->sortable(),

                  TextColumn::make('name')
                  ->sortable()
                  ->searchable(),

                  TextColumn::make('track')->toggleable(),

                  TextColumn::make('adviser_name')
                  ->label('Adviser')
                  ->toggleable(),

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

    public static function getPages(): array
    {
        return [
            'index'  => Pages\ListSections::route('/'),
            'create' => Pages\CreateSection::route('/create'),
            'edit'   => Pages\EditSection::route('/{record}/edit'),
        ];
    }
}
