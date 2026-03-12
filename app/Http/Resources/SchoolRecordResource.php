<?php

namespace App\Http\Resources;

use App\Models\School;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin School */
class SchoolRecordResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $studentCount = $this->reported_student_count;
        if ($studentCount <= 0 && isset($this->students_count)) {
            $studentCount = (int) $this->students_count;
        }

        return [
            'id' => (string) $this->id,
            'schoolId' => $this->school_code,
            'schoolCode' => $this->school_code,
            'schoolName' => $this->name,
            'level' => $this->level,
            'district' => $this->district,
            'address' => $this->address ?? $this->district,
            'type' => $this->type,
            'studentCount' => (int) $studentCount,
            'teacherCount' => (int) $this->reported_teacher_count,
            'region' => $this->region,
            'status' => $this->status,
            'submittedBy' => $this->submittedBy?->name ?? 'Unassigned',
            'lastUpdated' => ($this->submitted_at ?? $this->updated_at)?->toISOString(),
            'deletedAt' => $this->deleted_at?->toISOString(),
            'schoolHeadAccount' => $this->serializeSchoolHeadAccount(),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function serializeSchoolHeadAccount(): ?array
    {
        if (! $this->relationLoaded('schoolHeadAccounts')) {
            return null;
        }

        /** @var User|null $account */
        $account = $this->schoolHeadAccounts
            ->sortByDesc(static fn (User $candidate): int => (int) $candidate->id)
            ->first();

        if (! $account) {
            return null;
        }

        $account->loadMissing('latestAccountSetupToken');
        $status = $account->accountStatus();
        $setupToken = $account->latestAccountSetupToken;
        $setupLinkExpiresAt = null;

        if ($setupToken && $setupToken->used_at === null && $setupToken->expires_at !== null && $setupToken->expires_at->isFuture()) {
            $setupLinkExpiresAt = $setupToken->expires_at->toISOString();
        }

        return [
            'id' => (string) $account->id,
            'name' => $account->name,
            'email' => $account->email,
            'accountStatus' => $status->value,
            'mustResetPassword' => (bool) $account->must_reset_password,
            'flagged' => $account->flagged_at !== null,
            'flaggedAt' => $account->flagged_at?->toISOString(),
            'flagReason' => $account->flagged_reason,
            'setupLinkExpiresAt' => $setupLinkExpiresAt,
        ];
    }
}
