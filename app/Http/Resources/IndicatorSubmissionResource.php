<?php

namespace App\Http\Resources;

use App\Models\IndicatorSubmission;
use App\Support\Domain\FormSubmissionStatus;
use App\Support\Indicators\SubmissionFileDefinition;
use App\Support\Indicators\SubmissionFileRequirementResolver;
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
        $recordedIndicators = $itemCollection->where('compliance_status', 'recorded')->count();
        $comparableIndicators = $metIndicators + $belowTargetIndicators;
        $complianceRate = $comparableIndicators > 0
            ? round(($metIndicators / $comparableIndicators) * 100, 2)
            : 0.0;
        /** @var SubmissionFileRequirementResolver $requirementResolver */
        $requirementResolver = app(SubmissionFileRequirementResolver::class);
        $hasImeta = $this->hasImetaFormData();
        $hasBmef = $this->hasBmefFile();
        $hasSmea = $this->hasSmeaFile();
        $uploadedFileTypes = $this->uploadedSubmissionFileTypes();
        $requiredFileTypes = $requirementResolver->requiredTypesForSubmission($this->resource);
        $missingFileTypes = $requirementResolver->missingTypesForSubmission($this->resource);
        $secondaryHistoricalFileTypes = $requirementResolver->secondaryHistoricalTypesForSubmission($this->resource);

        return [
            'id' => (string) $this->id,
            'formType' => IndicatorSubmission::FORM_TYPE,
            'status' => $this->statusValue($this->status),
            'statusLabel' => $this->statusLabel($this->status),
            'reportingPeriod' => $this->reporting_period,
            'version' => (int) $this->version,
            'schoolId' => (string) $this->school_id,
            'schoolType' => $this->school?->type,
            'school' => $this->when(
                $this->relationLoaded('school') && $this->school,
                fn (): array => [
                    'id' => (string) $this->school->id,
                    'schoolCode' => $this->school->school_code,
                    'name' => $this->school->name,
                    'type' => $this->school->type,
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
                'recordedIndicators' => $recordedIndicators,
                'complianceRatePercent' => $complianceRate,
            ],
            'files' => $this->buildSubmissionFiles(),
            // Legacy completion flags remain for compatibility. School Head package
            // presentation should prefer the normalized presentation.* contract below.
            'completion' => [
                'hasImetaFormData' => $hasImeta,
                'hasBmefFile' => $hasBmef,
                'hasSmeaFile' => $hasSmea,
                'isComplete' => $requirementResolver->isSubmissionComplete($this->resource),
                'requiredFileTypes' => $requiredFileTypes,
                'uploadedFileTypes' => $uploadedFileTypes,
                'missingFileTypes' => $missingFileTypes,
            ],
            // Canonical School Head package meaning. Active/private-vs-public screens
            // should use these normalized fields instead of inferring from raw history.
            'presentation' => [
                'activeFileTypes' => $requiredFileTypes,
                'activeReportFileTypes' => $requiredFileTypes,
                'activeWorkspaceFileTypes' => $requiredFileTypes,
                'secondaryHistoricalFileTypes' => $secondaryHistoricalFileTypes,
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

    /**
     * @return array<string, array<string, mixed>>
     */
    private function buildSubmissionFiles(): array
    {
        $files = [];

        foreach (SubmissionFileDefinition::types() as $type) {
            $uploaded = $this->hasSubmissionFileType($type);
            $files[$type] = [
                'type' => $type,
                'uploaded' => $uploaded,
                'path' => $this->submissionFilePathForType($type),
                'originalFilename' => $this->submissionFileOriginalNameForType($type),
                'sizeBytes' => $this->submissionFileSizeForType($type),
                'uploadedAt' => optional($this->submissionFileUploadedAtForType($type))->toISOString(),
                'downloadUrl' => $uploaded ? "/api/submissions/{$this->id}/download/{$type}" : null,
                'viewUrl' => $uploaded ? "/api/submissions/{$this->id}/view/{$type}" : null,
            ];
        }

        return $files;
    }
}
