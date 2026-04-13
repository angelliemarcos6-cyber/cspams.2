<?php

namespace App\Http\Resources;

use App\Models\LearnerCaseAttachment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin LearnerCaseAttachment */
class LearnerCaseAttachmentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'originalFilename' => $this->original_filename,
            'fileType' => $this->file_type,
            'uploadedBy' => $this->whenLoaded('uploadedBy', fn () => [
                'id' => (string) $this->uploadedBy->id,
                'name' => $this->uploadedBy->name,
            ]),
            'uploadedAt' => $this->created_at?->toISOString(),
        ];
    }
}
