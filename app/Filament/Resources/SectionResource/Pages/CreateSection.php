<?php

namespace App\Filament\Resources\SectionResource\Pages;

use App\Filament\Resources\SectionResource;
use Filament\Resources\Pages\CreateRecord;

class CreateSection extends CreateRecord
{
    protected static string $resource = SectionResource::class;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        if ($schoolId = auth()->user()?->school_id) {
            $data['school_id'] = $schoolId;
        }

        return $data;
    }
}
