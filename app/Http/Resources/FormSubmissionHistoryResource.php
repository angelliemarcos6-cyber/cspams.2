<?php

namespace App\Http\Resources;

use App\Models\FormSubmissionHistory;
use App\Support\Domain\FormSubmissionStatus;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin FormSubmissionHistory */
class FormSubmissionHistoryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'formType' => $this->form_type,
            'submissionId' => (string) $this->submission_id,
            'action' => $this->action,
            'fromStatus' => $this->from_status,
            'fromStatusLabel' => $this->statusLabel($this->from_status),
            'toStatus' => $this->to_status,
            'toStatusLabel' => $this->statusLabel($this->to_status),
            'notes' => $this->notes,
            'metadata' => $this->metadata,
            'actor' => $this->when(
                $this->relationLoaded('actor') && $this->actor,
                fn (): array => [
                    'id' => (string) $this->actor->id,
                    'name' => $this->actor->name,
                    'email' => $this->actor->email,
                ],
            ),
            'createdAt' => optional($this->created_at)->toISOString(),
        ];
    }

    private function statusLabel(?string $status): ?string
    {
        if (! $status) {
            return null;
        }

        return FormSubmissionStatus::options()[$status] ?? ucfirst(str_replace('_', ' ', $status));
    }
}
