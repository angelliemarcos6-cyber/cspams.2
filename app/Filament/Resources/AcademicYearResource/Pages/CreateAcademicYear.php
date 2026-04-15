<?php

namespace App\Filament\Resources\AcademicYearResource\Pages;

use App\Filament\Resources\AcademicYearResource;
use Filament\Resources\Pages\CreateRecord;

class CreateAcademicYear extends CreateRecord
{
    protected static string $resource = AcademicYearResource::class;

    protected function afterCreate(): void
    {
        if (! $this->record->is_current) {
            return;
        }

        $this->record::query()
            ->whereKeyNot($this->record->getKey())
            ->update(['is_current' => false]);
    }
}
