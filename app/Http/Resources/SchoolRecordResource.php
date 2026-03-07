<?php

namespace App\Http\Resources;

use App\Models\School;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin School */
class SchoolRecordResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $studentCount = $this->reported_student_count;
        if ($studentCount <= 0 && isset($this->students_count)) {
            $studentCount = (int) $this->students_count;
        }

        return [
            'id' => (string) $this->id,
            'schoolCode' => $this->school_code,
            'schoolName' => $this->name,
            'district' => $this->district,
            'type' => $this->type,
            'studentCount' => (int) $studentCount,
            'teacherCount' => (int) $this->reported_teacher_count,
            'region' => $this->region,
            'status' => $this->status,
            'submittedBy' => $this->submittedBy?->name ?? 'Unassigned',
            'lastUpdated' => ($this->submitted_at ?? $this->updated_at)?->toISOString(),
        ];
    }
}
