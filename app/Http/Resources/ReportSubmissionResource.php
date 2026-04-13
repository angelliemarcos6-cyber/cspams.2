<?php

namespace App\Http\Resources;

use App\Models\ReportSubmission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ReportSubmission */
class ReportSubmissionResource extends JsonResource
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
            'academicYearId' => (string) $this->academic_year_id,
            'academicYear' => $this->whenLoaded('academicYear', fn () => [
                'id' => (string) $this->academicYear->id,
                'name' => $this->academicYear->name,
                'isCurrent' => (bool) $this->academicYear->is_current,
            ]),
            'reportType' => $this->report_type,
            'status' => $this->status,
            'originalFilename' => $this->original_filename,
            'fileSize' => $this->file_size,
            'submittedAt' => $this->submitted_at?->toISOString(),
            'submittedBy' => $this->whenLoaded('submittedBy', fn () => $this->submittedBy ? [
                'id' => (string) $this->submittedBy->id,
                'name' => $this->submittedBy->name,
            ] : null),
            'approvedAt' => $this->approved_at?->toISOString(),
            'approvedBy' => $this->whenLoaded('approvedBy', fn () => $this->approvedBy ? [
                'id' => (string) $this->approvedBy->id,
                'name' => $this->approvedBy->name,
            ] : null),
            'notes' => $this->notes,
            'createdAt' => $this->created_at?->toISOString(),
            'updatedAt' => $this->updated_at?->toISOString(),
        ];
    }
}
