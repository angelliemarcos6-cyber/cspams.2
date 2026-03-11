<?php

namespace App\Notifications;

use App\Models\IndicatorSubmission;
use App\Models\User;
use App\Support\Domain\FormSubmissionStatus;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class IndicatorReviewOutcomeNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly IndicatorSubmission $submission,
        private readonly User $monitor,
        private readonly string $decision,
        private readonly ?string $notes = null,
    ) {
    }

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        $schoolName = (string) ($this->submission->school?->name ?? 'Your school');
        $schoolCode = (string) ($this->submission->school?->school_code ?? 'N/A');
        $isValidated = $this->decision === FormSubmissionStatus::VALIDATED->value;
        $statusLabel = $isValidated ? 'Validated' : 'Returned';
        $monitorName = (string) ($this->monitor->name ?? 'Division Monitor');

        return [
            'eventType' => $isValidated ? 'indicator_validated' : 'indicator_returned',
            'title' => "Indicator package {$statusLabel}",
            'message' => $isValidated
                ? "Your indicator package #{$this->submission->id} was validated by {$monitorName}."
                : "Your indicator package #{$this->submission->id} was returned by {$monitorName} for revision.",
            'status' => $this->decision,
            'submissionId' => (string) $this->submission->id,
            'academicYearId' => (string) $this->submission->academic_year_id,
            'schoolId' => (string) $this->submission->school_id,
            'schoolCode' => $schoolCode,
            'schoolName' => $schoolName,
            'reviewNotes' => $this->notes,
            'monitorName' => $monitorName,
            'createdAt' => now()->toISOString(),
        ];
    }
}
