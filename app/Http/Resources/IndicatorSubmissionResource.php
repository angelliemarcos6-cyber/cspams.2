<?php

namespace App\Http\Resources;

use App\Models\IndicatorSubmission;
use App\Support\Domain\FormSubmissionStatus;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin IndicatorSubmission */
class IndicatorSubmissionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $itemCollection = $this->relationLoaded('items') ? $this->items : collect();
        $totalIndicators = $itemCollection->count();
        $metIndicators = $itemCollection->where('compliance_status', 'met')->count();
        $belowTargetIndicators = $itemCollection->where('compliance_status', 'below_target')->count();
        $complianceRate = $totalIndicators > 0
            ? round(($metIndicators / $totalIndicators) * 100, 2)
            : 0.0;
        $hasImeta = $this->hasImetaFormData();
        $hasBmef = is_string($this->bmef_file_path) && trim($this->bmef_file_path) !== '';
        $hasSmea = is_string($this->smea_file_path) && trim($this->smea_file_path) !== '';

        return [
            'id' => (string) $this->id,
            'formType' => IndicatorSubmission::FORM_TYPE,
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
            'notes' => $this->notes,
            'reviewNotes' => $this->review_notes,
            'summary' => [
                'totalIndicators' => $totalIndicators,
                'metIndicators' => $metIndicators,
                'belowTargetIndicators' => $belowTargetIndicators,
                'complianceRatePercent' => $complianceRate,
            ],
            // BMEF/SMEA upload support added per redesign doc
            'files' => [
                'bmef' => [
                    'type' => 'bmef',
                    'uploaded' => $hasBmef,
                    'path' => $this->bmef_file_path,
                    'originalFilename' => $this->bmef_original_filename,
                    'sizeBytes' => $this->bmef_file_size ? (int) $this->bmef_file_size : null,
                    'uploadedAt' => optional($this->bmef_uploaded_at)->toISOString(),
                    'downloadUrl' => $hasBmef ? "/api/submissions/{$this->id}/download/bmef" : null,
                ],
                'smea' => [
                    'type' => 'smea',
                    'uploaded' => $hasSmea,
                    'path' => $this->smea_file_path,
                    'originalFilename' => $this->smea_original_filename,
                    'sizeBytes' => $this->smea_file_size ? (int) $this->smea_file_size : null,
                    'uploadedAt' => optional($this->smea_uploaded_at)->toISOString(),
                    'downloadUrl' => $hasSmea ? "/api/submissions/{$this->id}/download/smea" : null,
                ],
            ],
            'completion' => [
                'hasImetaFormData' => $hasImeta,
                'hasBmefFile' => $hasBmef,
                'hasSmeaFile' => $hasSmea,
                'isComplete' => $hasImeta && $hasBmef && $hasSmea,
            ],
            'indicators' => IndicatorSubmissionItemResource::collection($itemCollection),
            'createdBy' => $this->when(
                $this->relationLoaded('createdBy') && $this->createdBy,
                fn (): array => [
                    'id' => (string) $this->createdBy->id,
                    'name' => $this->createdBy->name,
                    'email' => $this->createdBy->email,
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
            'reviewedBy' => $this->when(
                $this->relationLoaded('reviewedBy') && $this->reviewedBy,
                fn (): array => [
                    'id' => (string) $this->reviewedBy->id,
                    'name' => $this->reviewedBy->name,
                    'email' => $this->reviewedBy->email,
                ],
            ),
            'submittedAt' => optional($this->submitted_at)->toISOString(),
            'reviewedAt' => optional($this->reviewed_at)->toISOString(),
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
