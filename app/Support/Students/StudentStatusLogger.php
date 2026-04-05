<?php

namespace App\Support\Students;

use App\Models\Student;
use App\Models\StudentStatusLog;

class StudentStatusLogger
{
    public function logTransition(Student $student, ?string $fromStatus, ?string $toStatus, string $notes, ?int $actorId = null): void
    {
        if (! $toStatus || $fromStatus === $toStatus) {
            return;
        }

        StudentStatusLog::query()->create([
            'student_id' => $student->id,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'changed_by' => $actorId ?? auth()->id(),
            'notes' => $notes,
            'changed_at' => now(),
        ]);
    }
}