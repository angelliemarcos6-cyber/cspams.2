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
