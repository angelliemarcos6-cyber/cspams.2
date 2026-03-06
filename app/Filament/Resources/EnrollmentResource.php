<?php

namespace App\Filament\Resources;

use App\Filament\Resources\EnrollmentResource\Pages;
use App\Models\Enrollment;
use Filament\Forms\Components\Component;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\Select;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class EnrollmentResource extends Resource
{
    protected static ?string $model = Enrollment::class;
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

        // School head: hide + force their school_id
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
        $schoolId = auth()->user()?->school_id;

        return $form->schema([
            static::schoolIdField(),

                             Select::make('student_id')
                             ->relationship(
                                 name: 'student',
                                 titleAttribute: 'lrn',
                                 modifyQueryUsing: fn (Builder $query) => $schoolId
                                 ? $query->where('school_id', $schoolId)
                                 : $query
                             )
                             ->searchable()
                             ->preload()
                             ->required(),

                             Select::make('academic_year_id')
                             ->relationship('academicYear', 'name')
                             ->searchable()
                             ->preload()
                             ->required(),

                             Select::make('section_id')
                             ->relationship(
                                 name: 'section',
                                 titleAttribute: 'name',
                                 modifyQueryUsing: fn (Builder $query) => $schoolId
                                 ? $query->where('school_id', $schoolId)
                                 : $query
                             )
                             ->searchable()
                             ->preload()
                             ->required(),

                             Select::make('status')
                             ->options([
                                 'active' => 'Active',
                                 'ended' => 'Ended',
                                 'transferred' => 'Transferred',
                                 'dropped' => 'Dropped',
                                 'graduated' => 'Graduated',
                             ])
                             ->required()
                             ->default('active'),

                             DateTimePicker::make('enrolled_at')
                             ->label('Enrolled At')
                             ->nullable(),

                             DateTimePicker::make('ended_at')
                             ->label('Ended At')
                             ->nullable(),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
        ->columns([
            TextColumn::make('student.lrn')
            ->label('LRN')
            ->sortable()
            ->searchable(),

                  TextColumn::make('academicYear.name')
                  ->label('Academic Year')
                  ->sortable()
                  ->searchable(),

                  TextColumn::make('section.name')
                  ->label('Section')
                  ->sortable()
                  ->searchable(),

                  TextColumn::make('status')
                  ->sortable()
                  ->badge(),

                  TextColumn::make('enrolled_at')
                  ->label('Enrolled At')
                  ->dateTime()
                  ->toggleable(isToggledHiddenByDefault: true),

                  TextColumn::make('ended_at')
                  ->label('Ended At')
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
            'index'  => Pages\ListEnrollments::route('/'),
            'create' => Pages\CreateEnrollment::route('/create'),
            'edit'   => Pages\EditEnrollment::route('/{record}/edit'),
        ];
    }
}
