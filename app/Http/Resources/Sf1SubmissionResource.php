<?php

namespace App\Http\Resources;

use App\Models\Sf1Submission;
use App\Support\Domain\FormSubmissionStatus;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Sf1Submission */
class Sf1SubmissionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'formType' => Sf1Submission::FORM_TYPE,
            'status' => $this->statusValue($this->status),
            'statusLabel' => $this->statusLabel($this->status),
            'reportingPeriod' => $this->reporting_period,
            'version' => (int) $this->version,
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
                ],
            ),
            'summary' => is_array($this->payload) ? ($this->payload['summary'] ?? null) : null,
            'payload' => $this->payload,
            'validationNotes' => $this->validation_notes,
            'generatedBy' => $this->when(
                $this->relationLoaded('generatedBy') && $this->generatedBy,
                fn (): array => [
                    'id' => (string) $this->generatedBy->id,
                    'name' => $this->generatedBy->name,
                    'email' => $this->generatedBy->email,
                ],
            ),
            'submittedBy' => $this->when(
                $this->relationLoaded('submittedBy') && $this->submittedBy,
                fn (): array => [
                    'id' => (string) $this->submittedBy->id,
                    'name' => $this->submittedBy->name,
                    'email' => $this->submittedBy->email,
                ],
            ),
            'validatedBy' => $this->when(
                $this->relationLoaded('validatedBy') && $this->validatedBy,
                fn (): array => [
                    'id' => (string) $this->validatedBy->id,
                    'name' => $this->validatedBy->name,
                    'email' => $this->validatedBy->email,
                ],
            ),
            'generatedAt' => optional($this->generated_at)->toISOString(),
            'submittedAt' => optional($this->submitted_at)->toISOString(),
            'validatedAt' => optional($this->validated_at)->toISOString(),
            'createdAt' => optional($this->created_at)->toISOString(),
            'updatedAt' => optional($this->updated_at)->toISOString(),
        ];
    }

    private function statusValue(mixed $status): ?string
    {
        if ($status instanceof FormSubmissionStatus) {
            return $status->value;
        }

        return is_string($status) && $status !== '' ? $status : null;
    }

    private function statusLabel(mixed $status): ?string
    {
        $value = $this->statusValue($status);
        if (! $value) {
            return null;
        }

        return FormSubmissionStatus::options()[$value] ?? ucfirst(str_replace('_', ' ', $value));
    }
}
