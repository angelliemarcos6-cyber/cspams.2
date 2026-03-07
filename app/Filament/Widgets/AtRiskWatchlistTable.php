<?php

namespace App\Filament\Widgets;

use App\Models\Student;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;
use Filament\Tables;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget as BaseWidget;
use Illuminate\Database\Eloquent\Builder;

class AtRiskWatchlistTable extends BaseWidget
{
    protected static ?string $heading = 'At-Risk Watchlist';

    protected int | string | array $columnSpan = 'full';

    protected function getTableQuery(): Builder
    {
        $query = Student::query()
            ->with(['school', 'section'])
            ->whereIn('status', [
                StudentStatus::AT_RISK->value,
                StudentStatus::DROPPED_OUT->value,
            ])
            ->orderByDesc('last_status_at')
            ->orderByDesc('updated_at');

        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            $query->where('school_id', auth()->user()?->school_id);
        }

        return $query;
    }

    protected function getTableColumns(): array
    {
        return [
            Tables\Columns\TextColumn::make('lrn')
                ->label('LRN')
                ->searchable(),

            Tables\Columns\TextColumn::make('last_name')
                ->label('Learner')
                ->formatStateUsing(fn (string $state, Student $record): string => $record->full_name)
                ->searchable(['first_name', 'middle_name', 'last_name']),

            Tables\Columns\TextColumn::make('school.name')
                ->label('School')
                ->visible(fn (): bool => UserRoleResolver::has(auth()->user(), UserRoleResolver::MONITOR)),

            Tables\Columns\TextColumn::make('section.name')
                ->label('Section'),

            Tables\Columns\TextColumn::make('status')
                ->badge()
                ->formatStateUsing(fn (string $state): string => StudentStatus::options()[$state] ?? $state)
                ->color(fn (string $state): string => StudentStatus::tryFrom($state)?->color() ?? 'gray'),

            Tables\Columns\TextColumn::make('risk_level')
                ->label('Risk')
                ->badge()
                ->formatStateUsing(fn (string $state): string => StudentRiskLevel::options()[$state] ?? $state)
                ->color(fn (string $state): string => StudentRiskLevel::tryFrom($state)?->color() ?? 'gray'),

            Tables\Columns\TextColumn::make('last_status_at')
                ->label('Last Transition')
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