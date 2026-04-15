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
                    'framework' => (string) $this->metric->framework,
                    'dataType' => $this->metric->data_type?->value ?? (string) $this->metric->data_type,
                    'inputSchema' => $this->metric->input_schema ?? null,
                    'unit' => $this->metric->unit,
                ],
            ),
            'targetValue' => (float) $this->target_value,
            'actualValue' => (float) $this->actual_value,
            'varianceValue' => (float) $this->variance_value,
            'targetTypedValue' => $this->target_typed_value,
            'actualTypedValue' => $this->actual_typed_value,
            'targetDisplay' => $this->target_display,
            'actualDisplay' => $this->actual_display,
            'complianceStatus' => $this->compliance_status,
            'remarks' => $this->remarks,
        ];
    }
}
