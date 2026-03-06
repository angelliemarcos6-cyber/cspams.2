<?php

namespace App\Filament\Resources\SchoolYearlyDataResource\Pages;

use App\Filament\Resources\SchoolYearlyDataResource;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditSchoolYearlyData extends EditRecord
{
    protected static string $resource = SchoolYearlyDataResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\DeleteAction::make(),
        ];
    }
}
