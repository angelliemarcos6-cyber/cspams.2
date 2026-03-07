<?php

namespace App\Filament\Resources\StudentResource\Pages;

use App\Filament\Resources\StudentResource;
use App\Models\Section;
use App\Models\StudentStatusLog;
use App\Support\Auth\UserRoleResolver;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Validation\ValidationException;

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

        $this->assertSectionBelongsToScope($data);

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

    /**
     * @param array<string, mixed> $data
     */
    private function assertSectionBelongsToScope(array $data): void
    {
        $sectionId = $data['section_id'] ?? null;

        if (! $sectionId) {
            return;
        }

        $schoolId = (int) ($data['school_id'] ?? 0);
        $academicYearId = (int) ($data['academic_year_id'] ?? 0);

        $sectionIsInScope = Section::query()
            ->whereKey($sectionId)
            ->where('school_id', $schoolId)
            ->where('academic_year_id', $academicYearId)
            ->exists();

        if ($sectionIsInScope) {
            return;
        }

        throw ValidationException::withMessages([
            'data.section_id' => 'Selected section does not match the learner school and academic year.',
        ]);
    }
}
