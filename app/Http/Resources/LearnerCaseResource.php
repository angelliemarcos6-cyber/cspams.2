<?php

namespace App\Http\Resources;

use App\Models\LearnerCase;
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
        return [
            'id' => (string) $this->id,
            'schoolId' => (string) $this->school_id,
            'school' => $this->whenLoaded('school', fn () => [
                'id' => (string) $this->school->id,
                'schoolCode' => $this->school->school_code,
                'name' => $this->school->name,
            ]),
            'flaggedBy' => $this->whenLoaded('flaggedBy', fn () => [
                'id' => (string) $this->flaggedBy->id,
                'name' => $this->flaggedBy->name,
            ]),
            'lrn' => $this->lrn,
            'learnerName' => $this->learner_name,
            'gradeLevel' => $this->grade_level,
            'section' => $this->section,
            'issueType' => $this->issue_type,
            'severity' => $this->severity,
            'description' => $this->description,
            'status' => $this->status,
            'flaggedAt' => $this->flagged_at?->toISOString(),
            'acknowledgedAt' => $this->acknowledged_at?->toISOString(),
            'acknowledgedBy' => $this->whenLoaded('acknowledgedBy', fn () => $this->acknowledgedBy ? [
                'id' => (string) $this->acknowledgedBy->id,
                'name' => $this->acknowledgedBy->name,
            ] : null),
            'resolvedAt' => $this->resolved_at?->toISOString(),
            'resolvedBy' => $this->whenLoaded('resolvedBy', fn () => $this->resolvedBy ? [
                'id' => (string) $this->resolvedBy->id,
                'name' => $this->resolvedBy->name,
            ] : null),
            'daysOpen' => $this->days_open,
            'isOverdue' => $this->isOverdue(),
            'attachments' => LearnerCaseAttachmentResource::collection($this->whenLoaded('attachments')),
            'threads' => LearnerCaseThreadResource::collection($this->whenLoaded('threads')),
            'createdAt' => $this->created_at?->toISOString(),
            'updatedAt' => $this->updated_at?->toISOString(),
        ];
    }
}
