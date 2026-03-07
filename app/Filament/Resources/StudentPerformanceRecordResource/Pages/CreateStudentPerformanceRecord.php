<?php

namespace App\Filament\Resources\StudentPerformanceRecordResource\Pages;

use App\Filament\Resources\StudentPerformanceRecordResource;
use App\Models\Student;
use App\Support\Auth\UserRoleResolver;
use Filament\Resources\Pages\CreateRecord;
use Illuminate\Validation\ValidationException;

class CreateStudentPerformanceRecord extends CreateRecord
{
    protected static string $resource = StudentPerformanceRecordResource::class;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        $data['encoded_by'] = auth()->id();
        $data['submitted_at'] = now();

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
            'data.student_id' => 'You can only encode performance for learners in your assigned school.',
        ]);
    }
}
