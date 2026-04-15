<?php

namespace App\Filament\Resources\StudentResource\Pages;

use App\Filament\Resources\StudentResource;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\StudentStatus;
use App\Support\Students\StudentStatusLogger;
use App\Support\Validation\EnsuresSectionScope;
use Filament\Resources\Pages\CreateRecord;

class CreateStudent extends CreateRecord
{
    use EnsuresSectionScope;

    protected static string $resource = StudentResource::class;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            $data['school_id'] = auth()->user()?->school_id;
        }

        $schoolId = (int) ($data['school_id'] ?? 0);
        $academicYearId = (int) ($data['academic_year_id'] ?? 0);

        $this->assertSectionBelongsToScope($data['section_id'] ?? null, $schoolId, $academicYearId);

        $data['last_status_at'] = $data['last_status_at'] ?? now();

        return $data;
    }

    protected function afterCreate(): void
    {
        $currentStatus = $this->statusValue($this->record->status);

        app(StudentStatusLogger::class)->logTransition(
            student: $this->record,
            fromStatus: null,
            toStatus: $currentStatus,
            notes: 'Initial status upon learner creation.',
        );
    }

    private function statusValue(mixed $status): ?string
    {
        if ($status instanceof StudentStatus) {
            return $status->value;
        }

        return is_string($status) && $status !== '' ? $status : null;
    }
}
