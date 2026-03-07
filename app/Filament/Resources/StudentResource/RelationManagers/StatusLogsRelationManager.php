<?php

namespace App\Filament\Resources\StudentResource\RelationManagers;

use App\Support\Domain\StudentStatus;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables;
use Filament\Tables\Table;

class StatusLogsRelationManager extends RelationManager
{
    protected static string $relationship = 'statusLogs';

    protected static ?string $title = 'Status Timeline';

    public function table(Table $table): Table
    {
        return $table
            ->defaultSort('changed_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('changed_at')
                    ->label('Changed At')
                    ->dateTime('M d, Y h:i A')
                    ->sortable(),

                Tables\Columns\TextColumn::make('from_status')
                    ->label('From')
                    ->badge()
                    ->formatStateUsing(function (mixed $state): string {
                        $status = self::normalizeStatus($state);

                        return $status ? (StudentStatus::options()[$status] ?? $status) : 'Initial';
                    })
                    ->color(function (mixed $state): string {
                        $status = self::normalizeStatus($state);

                        return $status ? (StudentStatus::tryFrom($status)?->color() ?? 'gray') : 'gray';
                    }),

                Tables\Columns\TextColumn::make('to_status')
                    ->label('To')
                    ->badge()
                    ->formatStateUsing(function (mixed $state): string {
                        $status = self::normalizeStatus($state);

                        return $status ? (StudentStatus::options()[$status] ?? $status) : '-';
                    })
                    ->color(function (mixed $state): string {
                        $status = self::normalizeStatus($state);

                        return $status ? (StudentStatus::tryFrom($status)?->color() ?? 'gray') : 'gray';
                    }),

                Tables\Columns\TextColumn::make('user.name')
                    ->label('Changed By')
                    ->searchable(),

                Tables\Columns\TextColumn::make('notes')
                    ->wrap(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('to_status')
                    ->label('Target Status')
                    ->options(StudentStatus::options()),
            ])
            ->headerActions([])
            ->actions([])
            ->bulkActions([]);
    }

    private static function normalizeStatus(mixed $state): ?string
    {
        if ($state instanceof StudentStatus) {
            return $state->value;
        }

        return is_string($state) && $state !== '' ? $state : null;
    }
}
