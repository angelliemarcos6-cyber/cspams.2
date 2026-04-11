<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\IndicatorSubmission;
use App\Models\User;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\FormSubmissionStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class SubmissionController extends Controller
{
    public function create(Request $request): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanSubmitForSchool($user, (int) $request->integer('school_id'));

        $validated = $request->validate([
            'school_id' => ['required', 'integer', 'exists:schools,id'],
            'academic_year_id' => ['required', 'integer', 'exists:academic_years,id'],
        ]);

        $submission = IndicatorSubmission::query()->firstOrCreate(
            [
                'school_id' => $validated['school_id'],
                'academic_year_id' => $validated['academic_year_id'],
                'reporting_period' => 'annual_requirements',
            ],
            [
                'version' => 1,
                'status' => FormSubmissionStatus::DRAFT->value,
                'created_by' => $user->id,
            ],
        );

        $this->audit(
            $request,
            $user,
            'submission_hybrid_create',
            $submission,
            ['created' => $submission->wasRecentlyCreated],
        );

        return response()->json([
            'id' => $submission->id,
            'status' => $submission->status,
            'completion' => $submission->getCompletionPercentage(),
            'files' => $submission->getFilesInfo(),
            'submission' => $submission,
        ]);
    }

    public function saveImetaForm(Request $request, IndicatorSubmission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanSubmitForSchool($user, (int) $submission->school_id);

        if (! $submission->canBeEdited()) {
            return response()->json([
                'error' => 'Only draft or returned submissions can be edited.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $validated = $request->validate([
            'form_data' => ['required', 'array'],
        ]);

        $submission->forceFill([
            'form_data' => $validated['form_data'],
        ])->save();

        $this->audit(
            $request,
            $user,
            'submission_hybrid_imeta_saved',
            $submission,
            ['form_data_updated' => true],
        );

        return response()->json([
            'success' => true,
            'message' => 'I-META form saved.',
            'completion' => $submission->getCompletionPercentage(),
            'files' => $submission->getFilesInfo(),
        ]);
    }

    public function uploadFile(Request $request, IndicatorSubmission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanSubmitForSchool($user, (int) $submission->school_id);

        if (! $submission->canBeEdited()) {
            return response()->json([
                'error' => 'Only draft or returned submissions can be edited.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $validated = $request->validate([
            'file' => ['required', 'file', 'max:10240'],
            'type' => ['required', 'in:targets_met,smea'],
        ]);

        if ($validated['type'] === 'targets_met') {
            $request->validate([
                'file' => ['mimes:xlsx,xls,pdf'],
            ]);
        } elseif ($validated['type'] === 'smea') {
            $request->validate([
                'file' => ['mimes:docx,doc,pdf'],
            ]);
        }

        $file = $request->file('file');
        if (! $file) {
            return response()->json([
                'error' => 'File is required.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $filename = sprintf(
            '%d_%s_%d.%s',
            $submission->school_id,
            $validated['type'],
            time(),
            $file->getClientOriginalExtension(),
        );

        $path = $file->storeAs('submissions', $filename, 'private');

        if ($validated['type'] === 'targets_met') {
            if ($submission->targets_met_file_path) {
                Storage::disk('private')->delete($submission->targets_met_file_path);
            }

            $submission->forceFill([
                'targets_met_file_path' => $path,
                'targets_met_uploaded_at' => now(),
                'targets_met_original_filename' => $file->getClientOriginalName(),
            ])->save();
        } else {
            if ($submission->smea_file_path) {
                Storage::disk('private')->delete($submission->smea_file_path);
            }

            $submission->forceFill([
                'smea_file_path' => $path,
                'smea_uploaded_at' => now(),
                'smea_original_filename' => $file->getClientOriginalName(),
            ])->save();
        }

        $this->audit(
            $request,
            $user,
            'submission_hybrid_file_uploaded',
            $submission,
            [
                'type' => $validated['type'],
                'original_filename' => $file->getClientOriginalName(),
                'size' => $file->getSize(),
            ],
        );

        return response()->json([
            'success' => true,
            'message' => ucfirst(str_replace('_', ' ', $validated['type'])) . ' file uploaded.',
            'file_info' => [
                'filename' => $file->getClientOriginalName(),
                'uploadedAt' => now()->toISOString(),
                'size' => $file->getSize(),
            ],
            'completion' => $submission->getCompletionPercentage(),
            'files' => $submission->getFilesInfo(),
        ]);
    }

    public function downloadFile(IndicatorSubmission $submission, string $type)
    {
        $request = request();
        $user = $this->requireUser($request);
        $this->assertCanView($user, (int) $submission->school_id);

        if ($type === 'targets_met') {
            $path = $submission->targets_met_file_path;
            $filename = $submission->targets_met_original_filename ?? 'targets-met';
        } elseif ($type === 'smea') {
            $path = $submission->smea_file_path;
            $filename = $submission->smea_original_filename ?? 'smea';
        } else {
            return response()->json(['error' => 'Invalid file type.'], Response::HTTP_BAD_REQUEST);
        }

        if (! $path || ! Storage::disk('private')->exists($path)) {
            return response()->json(['error' => 'File not found.'], Response::HTTP_NOT_FOUND);
        }

        $this->audit(
            $request,
            $user,
            'submission_hybrid_file_downloaded',
            $submission,
            ['type' => $type, 'filename' => $filename],
        );

        return Storage::disk('private')->download($path, $filename);
    }

    public function submit(Request $request, IndicatorSubmission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanSubmitForSchool($user, (int) $submission->school_id);

        if (! $submission->canBeEdited()) {
            return response()->json([
                'error' => 'Only draft or returned submissions can be submitted.',
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        if (! $submission->isComplete()) {
            return response()->json([
                'error' => 'All requirements must be complete before submitting.',
                'status' => $submission->getFilesInfo(),
                'completion' => $submission->getCompletionPercentage(),
            ], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $submission->forceFill([
            'status' => FormSubmissionStatus::SUBMITTED->value,
            'submitted_at' => now(),
            'submitted_by' => $user->id,
            'reviewed_by' => null,
            'reviewed_at' => null,
            'review_notes' => null,
        ])->save();

        $this->audit(
            $request,
            $user,
            'submission_hybrid_submitted',
            $submission,
            ['status' => FormSubmissionStatus::SUBMITTED->value],
        );

        return response()->json([
            'success' => true,
            'message' => 'Requirements submitted successfully.',
            'submission' => $submission,
            'completion' => $submission->getCompletionPercentage(),
            'files' => $submission->getFilesInfo(),
        ]);
    }

    public function show(Request $request, IndicatorSubmission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanView($user, (int) $submission->school_id);

        return response()->json([
            'id' => $submission->id,
            'school_id' => $submission->school_id,
            'academic_year_id' => $submission->academic_year_id,
            'status' => $submission->status,
            'completionPercentage' => $submission->getCompletionPercentage(),
            'files' => $submission->getFilesInfo(),
            'form_data' => $submission->form_data,
            'submittedAt' => $submission->submitted_at,
            'submittedBy' => $submission->submittedBy,
            'reviewedAt' => $submission->reviewed_at,
            'reviewedBy' => $submission->reviewedBy,
            'reviewNotes' => $submission->review_notes,
            'canEdit' => $submission->canBeEdited(),
            'createdAt' => $submission->created_at,
            'updatedAt' => $submission->updated_at,
        ]);
    }

    private function requireUser(Request $request): User
    {
        $user = ApiUserResolver::fromRequest($request);
        abort_if(! $user instanceof User, Response::HTTP_UNAUTHORIZED, 'Authentication required.');

        return $user;
    }

    private function assertCanSubmitForSchool(User $user, int $schoolId): void
    {
        abort_if(
            ! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD),
            Response::HTTP_FORBIDDEN,
            'Only school heads can perform this action.',
        );

        abort_if(
            (int) $user->school_id !== $schoolId,
            Response::HTTP_FORBIDDEN,
            'You can only manage submissions for your assigned school.',
        );
    }

    private function assertCanView(User $user, int $schoolId): void
    {
        if (UserRoleResolver::has($user, UserRoleResolver::MONITOR)) {
            return;
        }

        if (
            UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)
            && (int) $user->school_id === $schoolId
        ) {
            return;
        }

        abort(Response::HTTP_FORBIDDEN, 'You are not allowed to view this submission.');
    }

    /**
     * @param array<string, mixed> $metadata
     */
    private function audit(
        Request $request,
        User $user,
        string $action,
        IndicatorSubmission $submission,
        array $metadata = [],
    ): void {
        AuditLog::query()->create([
            'user_id' => $user->id,
            'action' => $action,
            'auditable_type' => IndicatorSubmission::class,
            'auditable_id' => $submission->id,
            'metadata' => $metadata,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);
    }
}
