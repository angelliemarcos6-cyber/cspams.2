<?php

namespace App\Filament\Resources\StudentPerformanceRecordResource\Pages;

use App\Filament\Resources\StudentPerformanceRecordResource;
use App\Models\Student;
use App\Support\Auth\UserRoleResolver;
use Filament\Resources\Pages\CreateRecord;

class CreateStudentPerformanceRecord extends CreateRecord
{
    protected static string $resource = StudentPerformanceRecordResource::class;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        $data['encoded_by'] = auth()->id();
        $data['submitted_at'] = now();

        if (UserRoleResolver::has(auth()->user(), UserRoleResolver::SCHOOL_HEAD)) {
            $studentSchoolId = Student::query()
                ->whereKey($data['student_id'] ?? null)
                ->value('school_id');

            if ((int) $studentSchoolId !== (int) auth()->user()?->school_id) {
                abort(403, 'You can only encode performance for your assigned school learners.');
            }
        }

        return $data;
    }
}
