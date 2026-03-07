<?php

namespace App\Support\Forms;

use App\Models\FormSubmissionHistory;
use App\Support\Domain\FormSubmissionStatus;

class FormSubmissionHistoryLogger
{
    /**
     * @param array<string, mixed> $metadata
     */
    public function log(
        string $formType,
        int $submissionId,
        int $schoolId,
        int $academicYearId,
        string $action,
        FormSubmissionStatus|string|null $fromStatus,
        FormSubmissionStatus|string $toStatus,
        ?int $actorId,
        ?string $notes = null,
        array $metadata = [],
    ): void {
        FormSubmissionHistory::query()->create([
            'form_type' => $formType,
            'submission_id' => $submissionId,
            'school_id' => $schoolId,
            'academic_year_id' => $academicYearId,
            'action' => $action,
            'from_status' => $this->statusValue($fromStatus),
            'to_status' => $this->statusValue($toStatus),
            'actor_id' => $actorId,
            'notes' => $notes,
            'metadata' => $metadata === [] ? null : $metadata,
            'created_at' => now(),
        ]);
    }

    private function statusValue(FormSubmissionStatus|string|null $status): ?string
    {
        if ($status instanceof FormSubmissionStatus) {
            return $status->value;
        }

        return is_string($status) && $status !== '' ? $status : null;
    }
}
