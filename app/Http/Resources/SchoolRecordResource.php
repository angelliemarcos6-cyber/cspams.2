<?php

namespace App\Http\Resources;

use App\Models\School;
use App\Models\User;
use App\Support\Domain\FormSubmissionStatus;
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
        $studentCount = isset($this->students_count)
            ? (int) $this->students_count
            : (int) $this->reported_student_count;

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
            'indicatorLatest' => $this->serializeIndicatorLatest(),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function serializeIndicatorLatest(): ?array
    {
        if (! $this->relationLoaded('latestIndicatorSubmission')) {
            return null;
        }

        $submission = $this->latestIndicatorSubmission;
        if (! $submission) {
            return null;
        }

        $status = $submission->status;
        $statusValue = $status instanceof FormSubmissionStatus
            ? $status->value
            : (is_string($status) && $status !== '' ? $status : null);

        return [
            'id' => (string) $submission->id,
            'status' => $statusValue,
            'submittedAt' => $submission->submitted_at?->toISOString(),
            'reviewedAt' => $submission->reviewed_at?->toISOString(),
            'createdAt' => $submission->created_at?->toISOString(),
            'updatedAt' => $submission->updated_at?->toISOString(),
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

        $status = $account->accountStatus();
        $setupToken = $account->relationLoaded('latestAccountSetupToken')
            ? $account->latestAccountSetupToken
            : null;
        $setupLinkExpiresAt = null;

        if ($setupToken && $setupToken->used_at === null && $setupToken->expires_at !== null && $setupToken->expires_at->isFuture()) {
            $setupLinkExpiresAt = $setupToken->expires_at->toISOString();
        }

        return [
            'id' => (string) $account->id,
            'name' => $account->name,
            'email' => $account->email,
            'emailVerifiedAt' => $account->email_verified_at?->toISOString(),
            'lastLoginAt' => $account->last_login_at?->toISOString(),
            'accountStatus' => $status->value,
            'mustResetPassword' => (bool) $account->must_reset_password,
            'verifiedAt' => $account->verified_at?->toISOString(),
            'verifiedByUserId' => $account->verified_by_user_id ? (string) $account->verified_by_user_id : null,
            'verifiedByName' => $account->verifiedBy?->name,
            'verificationNotes' => $account->verification_notes,
            'flagged' => $account->flagged_at !== null,
            'flaggedAt' => $account->flagged_at?->toISOString(),
            'flagReason' => $account->flagged_reason,
            'deleteRecordFlagged' => $account->delete_record_flagged_at !== null,
            'deleteRecordFlaggedAt' => $account->delete_record_flagged_at?->toISOString(),
            'deleteRecordReason' => $account->delete_record_flag_reason,
            'setupLinkExpiresAt' => $setupLinkExpiresAt,
        ];
    }
}
