<?php

namespace App\Http\Resources;

use App\Models\Teacher;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Teacher */
class TeacherRecordResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'school' => [
                'id' => (string) ($this->school?->id ?? $this->school_id),
                'schoolCode' => $this->school?->school_code,
                'name' => $this->school?->name,
            ],
            'name' => $this->name,
            'sex' => $this->sex,
            'createdAt' => $this->created_at?->toISOString(),
            'updatedAt' => $this->updated_at?->toISOString(),
        ];
    }
}

