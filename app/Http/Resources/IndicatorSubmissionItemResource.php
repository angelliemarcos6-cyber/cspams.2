<?php

namespace App\Http\Resources;

use App\Models\IndicatorSubmissionItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin IndicatorSubmissionItem */
class IndicatorSubmissionItemResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'metric' => $this->when(
                $this->relationLoaded('metric') && $this->metric,
                fn (): array => [
                    'id' => (string) $this->metric->id,
                    'code' => $this->metric->code,
                    'name' => $this->metric->name,
                    'category' => (string) $this->metric->category->value,
                ],
            ),
            'targetValue' => (float) $this->target_value,
            'actualValue' => (float) $this->actual_value,
            'varianceValue' => (float) $this->variance_value,
            'complianceStatus' => $this->compliance_status,
            'remarks' => $this->remarks,
        ];
    }
}
