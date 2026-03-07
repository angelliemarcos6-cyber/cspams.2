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
                    ->formatStateUsing(fn (?string $state): string => $state ? (StudentStatus::options()[$state] ?? $state) : 'Initial')
                    ->color(fn (?string $state): string => $state ? (StudentStatus::tryFrom($state)?->color() ?? 'gray') : 'gray'),

                Tables\Columns\TextColumn::make('to_status')
                    ->label('To')
                    ->badge()
                    ->formatStateUsing(fn (string $state): string => StudentStatus::options()[$state] ?? $state)
                    ->color(fn (string $state): string => StudentStatus::tryFrom($state)?->color() ?? 'gray'),

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
}
