<?php

namespace App\Filament\Resources\StudentPerformanceRecordResource\Pages;

use App\Filament\Resources\StudentPerformanceRecordResource;
use Filament\Actions;
use Filament\Resources\Pages\ListRecords;

class ListStudentPerformanceRecords extends ListRecords
{
    protected static string $resource = StudentPerformanceRecordResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\CreateAction::make(),
        ];
    }
}
