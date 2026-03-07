<?php

namespace App\Filament\Resources\StudentPerformanceRecordResource\Pages;

use App\Filament\Resources\StudentPerformanceRecordResource;
use App\Models\Student;
use App\Support\Auth\UserRoleResolver;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Validation\ValidationException;

class EditStudentPerformanceRecord extends EditRecord
{
    protected static string $resource = StudentPerformanceRecordResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\DeleteAction::make(),
        ];
    }

    protected function mutateFormDataBeforeSave(array $data): array
    {
        $data['encoded_by'] = auth()->id();

        $this->assertStudentIsInUserScope($data);

        return $data;
    }

    /**
     * @param array<string, mixed> $data
     */
    private function assertStudentIsInUserScope(array $data): void
    {
        $studentId = $data['student_id'] ?? null;

        if (! $studentId) {
            return;
        }

        $studentSchoolId = Student::query()
            ->whereKey($studentId)
            ->value('school_id');

        if (! $studentSchoolId) {
            throw ValidationException::withMessages([
                'data.student_id' => 'Selected learner was not found.',
            ]);
        }

        if (! UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            return;
        }

        if ((int) $studentSchoolId === (int) auth()->user()?->school_id) {
            return;
        }

        throw ValidationException::withMessages([
            'data.student_id' => 'You can only edit records for learners in your assigned school.',
        ]);
    }
}
