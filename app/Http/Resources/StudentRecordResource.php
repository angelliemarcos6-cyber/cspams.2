<?php

namespace App\Http\Resources;

use App\Models\Student;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Student */
class StudentRecordResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $status = $this->status instanceof StudentStatus
            ? $this->status
            : StudentStatus::tryFrom((string) $this->status);
        $riskLevel = $this->risk_level instanceof StudentRiskLevel
            ? $this->risk_level
            : StudentRiskLevel::tryFrom((string) $this->risk_level);

        return [
            'id' => (string) $this->id,
            'school' => [
                'id' => (string) ($this->school?->id ?? $this->school_id),
                'schoolCode' => $this->school?->school_code,
                'name' => $this->school?->name,
            ],
            'academicYear' => [
                'id' => (string) ($this->academicYear?->id ?? $this->academic_year_id),
                'name' => $this->academicYear?->name,
                'isCurrent' => (bool) ($this->academicYear?->is_current ?? false),
            ],
            'lrn' => $this->lrn,
            'firstName' => $this->first_name,
            'middleName' => $this->middle_name,
            'lastName' => $this->last_name,
            'fullName' => $this->full_name,
            'sex' => $this->sex,
            'birthDate' => $this->birth_date?->toDateString(),
            'age' => $this->birth_date?->age,
            'status' => $status?->value ?? (string) $this->status,
            'statusLabel' => StudentStatus::options()[$status?->value ?? (string) $this->status] ?? ucfirst((string) $this->status),
            'riskLevel' => $riskLevel?->value ?? (string) $this->risk_level,
            'section' => $this->section_name ?? $this->section?->name,
            'teacher' => $this->teacher_name,
            'currentLevel' => $this->current_level,
            'trackedFromLevel' => $this->tracked_from_level,
            'lastStatusAt' => $this->last_status_at?->toISOString(),
            'createdAt' => $this->created_at?->toISOString(),
            'updatedAt' => $this->updated_at?->toISOString(),
        ];
    }
}
