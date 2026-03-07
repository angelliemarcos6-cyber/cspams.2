<?php

namespace App\Filament\Resources\StudentResource\RelationManagers;

use App\Support\Domain\ReportingPeriod;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables;
use Filament\Tables\Table;

class PerformanceRecordsRelationManager extends RelationManager
{
    protected static string $relationship = 'performanceRecords';

    protected static ?string $title = 'Performance Records';

    public function table(Table $table): Table
    {
        return $table
            ->defaultSort('submitted_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('academicYear.name')
                    ->label('Academic Year')
                    ->sortable(),

                Tables\Columns\TextColumn::make('metric.name')
                    ->label('Metric')
                    ->sortable()
                    ->searchable(),

                Tables\Columns\TextColumn::make('period')
                    ->badge()
                    ->formatStateUsing(function (mixed $state): string {
                        $period = self::normalizePeriod($state);

                        return $period ? (ReportingPeriod::options()[$period] ?? $period) : '-';
                    })
                    ->sortable(),

                Tables\Columns\TextColumn::make('value')
                    ->numeric(decimalPlaces: 2)
                    ->sortable(),

                Tables\Columns\TextColumn::make('submitted_at')
                    ->label('Submitted')
                    ->dateTime('M d, Y h:i A')
                    ->sortable(),

                Tables\Columns\TextColumn::make('encoder.name')
                    ->label('Encoded By')
                    ->searchable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('period')
                    ->options(ReportingPeriod::options()),
            ])
            ->headerActions([])
            ->actions([])
            ->bulkActions([]);
    }

    private static function normalizePeriod(mixed $state): ?string
    {
        if ($state instanceof ReportingPeriod) {
            return $state->value;
        }

        return is_string($state) && $state !== '' ? $state : null;
    }
}
