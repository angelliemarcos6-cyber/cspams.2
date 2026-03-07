<?php

namespace App\Filament\Resources\StudentResource\Pages;

use App\Filament\Resources\StudentResource;
use App\Models\StudentStatusLog;
use App\Support\Auth\UserRoleResolver;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditStudent extends EditRecord
{
    protected static string $resource = StudentResource::class;

    protected ?string $previousStatus = null;

    protected function getHeaderActions(): array
    {
        return [
            Actions\DeleteAction::make(),
        ];
    }

    protected function mutateFormDataBeforeFill(array $data): array
    {
        $this->previousStatus = isset($data['status']) ? (string) $data['status'] : null;

        return $data;
    }

    protected function mutateFormDataBeforeSave(array $data): array
    {
        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            $data['school_id'] = auth()->user()?->school_id;
        }

        if (($data['status'] ?? null) !== $this->previousStatus) {
            $data['last_status_at'] = now();
        }

        return $data;
    }

    protected function afterSave(): void
    {
        $currentStatus = is_string($this->record->status) ? $this->record->status : $this->record->status->value;

        if ($this->previousStatus === $currentStatus) {
            return;
        }

        StudentStatusLog::query()->create([
            'student_id' => $this->record->id,
            'from_status' => $this->previousStatus,
            'to_status' => $currentStatus,
            'changed_by' => auth()->id(),
            'notes' => 'Status updated via learner profile edit.',
            'changed_at' => now(),
        ]);
    }
}

