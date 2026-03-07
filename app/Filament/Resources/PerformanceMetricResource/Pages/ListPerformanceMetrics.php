<?php

namespace App\Filament\Resources\PerformanceMetricResource\Pages;

use App\Filament\Resources\PerformanceMetricResource;
use Filament\Actions;
use Filament\Resources\Pages\ListRecords;

class ListPerformanceMetrics extends ListRecords
{
    protected static string $resource = PerformanceMetricResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\CreateAction::make(),
        ];
    }
}
