<?php

namespace App\Support\Validation;

use App\Models\Student;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Validation\ValidationException;

trait EnsuresStudentScope
{
    private function assertStudentIsInUserScope(int|string|null $studentId, string $message): void
    {
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
            'data.student_id' => $message,
        ]);
    }
}