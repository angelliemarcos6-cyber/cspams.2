<?php

namespace App\Filament\Resources\StudentResource\Pages;

use App\Filament\Resources\StudentResource;
use App\Models\StudentStatusLog;
use App\Support\Auth\UserRoleResolver;
use Filament\Resources\Pages\CreateRecord;

class CreateStudent extends CreateRecord
{
    protected static string $resource = StudentResource::class;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            $data['school_id'] = auth()->user()?->school_id;
        }

        $data['last_status_at'] = now();

        return $data;
    }

    protected function afterCreate(): void
    {
        StudentStatusLog::query()->create([
            'student_id' => $this->record->id,
            'from_status' => null,
            'to_status' => (string) $this->record->status->value,
            'changed_by' => auth()->id(),
            'notes' => 'Initial status upon learner creation.',
            'changed_at' => now(),
        ]);
    }
}

