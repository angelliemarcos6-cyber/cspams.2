<?php

namespace App\Filament\Resources\StudentResource\Pages;

use App\Filament\Resources\StudentResource;
use App\Models\Section;
use App\Models\StudentStatusLog;
use App\Support\Auth\UserRoleResolver;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Validation\ValidationException;

class CreateStudent extends CreateRecord
{
    protected static string $resource = StudentResource::class;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            $data['school_id'] = auth()->user()?->school_id;
        }

        $this->assertSectionBelongsToScope($data);

        $data['last_status_at'] = $data['last_status_at'] ?? now();

        return $data;
    }

    protected function afterCreate(): void
    {
        $currentStatus = is_string($this->record->status)
            ? $this->record->status
            : $this->record->status->value;

        StudentStatusLog::query()->create([
            'student_id' => $this->record->id,
            'from_status' => null,
            'to_status' => $currentStatus,
            'changed_by' => auth()->id(),
            'notes' => 'Initial status upon learner creation.',
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
