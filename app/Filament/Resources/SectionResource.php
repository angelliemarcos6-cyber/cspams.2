<?php

namespace App\Filament\Resources;

use App\Filament\Resources\SectionResource\Pages;
use App\Models\AcademicYear;
use App\Models\Section;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class SectionResource extends Resource
{
    protected static ?string $model = Section::class;

    protected static ?string $navigationIcon = 'heroicon-o-rectangle-stack';

    protected static ?string $navigationGroup = 'School Management';

    public static function form(Form $form): Form
    {
        return $form
        ->schema([
            // School selection – visible only to Division Admin
            Forms\Components\Select::make('school_id')
            ->relationship('school', 'name')
            ->required()
            ->searchable()
            ->preload()
            ->visible(fn (): bool => auth()->user()?->hasRole('Division Admin') ?? false),

                 // For School Head: auto-set hidden school_id
                 Forms\Components\Hidden::make('school_id')
                 ->default(fn (): ?int => auth()->user()?->school_id)
                 ->dehydrated(fn (): bool => auth()->user()?->hasRole('School Head') ?? false),

                 // Academic Year – default to current
                 Forms\Components\Select::make('academic_year_id')
                 ->relationship('academicYear', 'name') // or 'year' – choose one
                 ->label('Academic Year')
                 ->required()
                 ->searchable()
                 ->preload()
                 ->default(fn (): ?int => AcademicYear::where('is_current', true)->first()?->id
                 ?? AcademicYear::latest('year')->first()?->id),

                 Forms\Components\TextInput::make('name')
                 ->label('Section Name')
                 ->required()
                 ->maxLength(100)
                 ->placeholder('e.g. Apple, Section A, Grade 7 - 1'),

                 Forms\Components\TextInput::make('grade_level')
                 ->label('Grade Level')
                 ->required()
                 ->maxLength(50)
                 ->placeholder('e.g. Grade 7, 10, Senior High - STEM'),

                 Forms\Components\TextInput::make('capacity')
                 ->label('Maximum Students')
                 ->numeric()
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
                  ->visible(fn (): bool => auth()->user()?->hasRole('Division Admin') ?? false),

                  Tables\Columns\TextColumn::make('capacity')
                  ->numeric()
                  ->sortable(),
        ])
        ->filters([
            Tables\Filters\SelectFilter::make('academic_year_id')
            ->relationship('academicYear', 'name')
            ->label('Academic Year'),
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

        // Restrict School Heads to their own school only
        if (auth()->user()?->hasRole('School Head')) {
            $query->where('school_id', auth()->user()->school_id);
        }

        return $query;
    }

    public static function getRelations(): array
    {
        return [
            // RelationManagers\StudentsRelationManager::class, // ← add later if needed
        ];
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
