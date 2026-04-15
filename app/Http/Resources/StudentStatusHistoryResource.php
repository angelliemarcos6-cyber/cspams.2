<?php

namespace App\Http\Resources;

use App\Models\StudentStatusLog;
use App\Support\Domain\StudentStatus;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin StudentStatusLog */
class StudentStatusHistoryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'studentId' => (string) $this->student_id,
            'fromStatus' => $this->from_status,
            'fromStatusLabel' => $this->statusLabel($this->from_status),
            'toStatus' => $this->to_status,
            'toStatusLabel' => $this->statusLabel($this->to_status),
            'notes' => $this->notes,
            'actor' => $this->when(
                $this->relationLoaded('user') && $this->user,
                fn (): array => [
                    'id' => (string) $this->user->id,
                    'name' => $this->user->name,
                    'email' => $this->user->email,
                ],
            ),
            'changedAt' => $this->changed_at?->toISOString(),
        ];
    }

    private function statusLabel(string|StudentStatus|null $status): ?string
    {
        if (! $status) {
            return null;
        }

        $statusValue = $status instanceof StudentStatus ? $status->value : $status;

        return StudentStatus::options()[$statusValue] ?? ucfirst(str_replace('_', ' ', $statusValue));
    }
}
