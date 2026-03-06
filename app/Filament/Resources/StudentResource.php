<?php

namespace App\Filament\Resources;

use App\Filament\Resources\StudentResource\Pages;
use App\Models\Student;
use Filament\Forms\Components\Component;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class StudentResource extends Resource
{
    protected static ?string $model = Student::class;

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
        $user = auth()->user();

        return $form->schema([
            static::schoolIdField(),

                             TextInput::make('lrn')
                             ->label('LRN')
                             ->required()
                             ->maxLength(12)
                             ->regex('/^\d{12}$/')
                             ->helperText('LRN must be exactly 12 digits.')
                             ->unique(ignoreRecord: true),

                             TextInput::make('last_name')->required(),
                             TextInput::make('first_name')->required(),
                             TextInput::make('middle_name')->nullable(),

                             Select::make('sex')
                             ->options([
                                 'Male' => 'Male',
                                 'Female' => 'Female',
                             ])
                             ->nullable(),

                             DatePicker::make('birthdate')->nullable(),

                             Select::make('current_academic_year_id')
                             ->relationship('currentAcademicYear', 'name')
                             ->searchable()
                             ->preload()
                             ->nullable(),

                             Select::make('current_section_id')
                             ->relationship(
                                 name: 'currentSection',
                                 titleAttribute: 'name',
                                 modifyQueryUsing: fn (Builder $query) => $user?->school_id
                                 ? $query->where('school_id', $user->school_id)
                                 : $query
                             )
                             ->searchable()
                             ->preload()
                             ->nullable(),

                             Select::make('current_status')
                             ->options([
                                 'active' => 'Active',
                                 'dropped' => 'Dropped',
                                 'transferred' => 'Transferred',
                                 'graduated' => 'Graduated',
                             ])
                             ->required()
                             ->default('active'),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
        ->columns([
            TextColumn::make('lrn')->label('LRN')->searchable()->sortable(),
                  TextColumn::make('last_name')->sortable()->searchable(),
                  TextColumn::make('first_name')->sortable()->searchable(),
                  TextColumn::make('currentAcademicYear.name')->label('Academic Year')->toggleable(),
                  TextColumn::make('currentSection.name')->label('Section')->toggleable(),
                  TextColumn::make('current_status')->badge()->sortable(),
        ])
        ->filters([
            //
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
            'index'  => Pages\ListStudents::route('/'),
            'create' => Pages\CreateStudent::route('/create'),
            'edit'   => Pages\EditStudent::route('/{record}/edit'),
        ];
    }
}
