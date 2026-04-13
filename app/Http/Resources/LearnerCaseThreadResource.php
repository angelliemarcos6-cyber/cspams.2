<?php

namespace App\Http\Resources;

use App\Models\LearnerCaseThread;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin LearnerCaseThread */
class LearnerCaseThreadResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'userId' => (string) $this->user_id,
            'userName' => $this->user?->name,
            'message' => $this->message,
            'createdAt' => $this->created_at?->toISOString(),
        ];
    }
}
