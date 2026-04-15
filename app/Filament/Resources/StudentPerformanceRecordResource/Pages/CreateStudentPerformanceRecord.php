<?php

namespace App\Filament\Resources\StudentPerformanceRecordResource\Pages;

use App\Filament\Resources\StudentPerformanceRecordResource;
use App\Support\Validation\EnsuresStudentScope;
use Filament\Resources\Pages\CreateRecord;

class CreateStudentPerformanceRecord extends CreateRecord
{
    use EnsuresStudentScope;

    protected static string $resource = StudentPerformanceRecordResource::class;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        $data['encoded_by'] = auth()->id();
        $data['submitted_at'] = now();

        $this->assertStudentIsInUserScope(
            studentId: $data['student_id'] ?? null,
            message: 'You can only encode performance for learners in your assigned school.',
        );

        return $data;
    }
}