<?php

namespace App\Http\Resources;

use App\Models\LearnerCase;
use BackedEnum;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin LearnerCase */
class LearnerCaseResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $issueType = $this->enumValue($this->issue_type);
        $severity = $this->enumValue($this->severity);
        $status = $this->enumValue($this->status);

        return [
            'id' => (string) $this->id,
            'lrn' => (string) $this->lrn,
            'name' => (string) $this->name,
            'gradeSection' => (string) $this->grade_section,
            'issueType' => $issueType,
            'issueTypeLabel' => LearnerCase::issueTypeLabel($issueType),
            'severity' => $severity,
            'severityLabel' => LearnerCase::severityLabel($severity),
            'caseNotes' => (string) $this->case_notes,
            'status' => $status,
            'statusLabel' => LearnerCase::statusLabel($status),
            'resolvedAt' => $this->resolved_at?->toISOString(),
            'school' => $this->when(
                $this->relationLoaded('school') && $this->school,
                fn (): array => [
                    'id' => (string) $this->school->id,
                    'schoolCode' => $this->school->school_code,
                    'name' => $this->school->name,
                ],
            ),
            'academicYear' => $this->when(
                $this->relationLoaded('academicYear') && $this->academicYear,
                fn (): array => [
                    'id' => (string) $this->academicYear->id,
                    'name' => $this->academicYear->name,
                    'isCurrent' => (bool) ($this->academicYear->is_current ?? false),
                ],
            ),
            'createdBy' => $this->when(
                $this->relationLoaded('createdBy') && $this->createdBy,
                fn (): array => [
                    'id' => (string) $this->createdBy->id,
                    'name' => $this->createdBy->name,
                    'email' => $this->createdBy->email,
                ],
            ),
            'createdAt' => $this->created_at?->toISOString(),
            'updatedAt' => $this->updated_at?->toISOString(),
        ];
    }

    private function enumValue(mixed $value): string
    {
        if ($value instanceof BackedEnum) {
            return (string) $value->value;
        }

        return trim((string) $value);
    }
}
