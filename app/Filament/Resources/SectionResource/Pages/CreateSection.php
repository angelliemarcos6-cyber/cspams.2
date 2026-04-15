<?php

namespace App\Filament\Resources\SectionResource\Pages;

use App\Filament\Resources\SectionResource;
use App\Support\Auth\UserRoleResolver;
use Filament\Resources\Pages\CreateRecord;

class CreateSection extends CreateRecord
{
    protected static string $resource = SectionResource::class;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            $data['school_id'] = auth()->user()?->school_id;
        }

        return $data;
    }
}
