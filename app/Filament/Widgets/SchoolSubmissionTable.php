<?php

namespace App\Filament\Widgets;

use App\Models\School;
use App\Support\Auth\UserRoleResolver;
use Filament\Tables;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget as BaseWidget;
use Illuminate\Database\Eloquent\Builder;

class SchoolSubmissionTable extends BaseWidget
{
    protected static ?string $heading = 'School Submission Snapshot';

    protected int | string | array $columnSpan = 'full';

    protected function getTableQuery(): Builder
    {
        $query = School::query()
            ->withCount('students')
            ->withMax('students', 'updated_at');

        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            $query->whereKey(auth()->user()?->school_id);
        }

        return $query;
    }

    protected function getTableColumns(): array
    {
        return [
            Tables\Columns\TextColumn::make('name')
                ->label('School')
                ->searchable(),

            Tables\Columns\TextColumn::make('district')
                ->label('District')
                ->sortable(),

            Tables\Columns\TextColumn::make('students_count')
                ->label('Learners')
                ->sortable(),

            Tables\Columns\TextColumn::make('students_max_updated_at')
                ->label('Latest Submission')
                ->dateTime('M d, Y h:i A')
                ->sortable(),
        ];
    }

    protected function isTablePaginationEnabled(): bool
    {
        return true;
    }

    protected function getTableRecordsPerPageSelectOptions(): array
    {
        return [10, 25, 50];
    }

    public function table(Table $table): Table
    {
        return $table
            ->query($this->getTableQuery())
            ->columns($this->getTableColumns());
    }
}
