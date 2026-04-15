<?php

namespace App\Filament\Resources\PerformanceMetricResource\Pages;

use App\Filament\Resources\PerformanceMetricResource;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditPerformanceMetric extends EditRecord
{
    protected static string $resource = PerformanceMetricResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\DeleteAction::make(),
        ];
    }
}
