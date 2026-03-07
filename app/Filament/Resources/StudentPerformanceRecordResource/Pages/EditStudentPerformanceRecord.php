<?php

namespace App\Filament\Resources\StudentPerformanceRecordResource\Pages;

use App\Filament\Resources\StudentPerformanceRecordResource;
use App\Support\Validation\EnsuresStudentScope;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditStudentPerformanceRecord extends EditRecord
{
    use EnsuresStudentScope;

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

        $this->assertStudentIsInUserScope(
            studentId: $data['student_id'] ?? null,
            message: 'You can only edit records for learners in your assigned school.',
        );

        return $data;
    }
}
