<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\LearnerCaseAttachmentResource;
use App\Http\Resources\LearnerCaseResource;
use App\Http\Resources\LearnerCaseThreadResource;
use App\Models\LearnerCase;
use App\Models\LearnerCaseAttachment;
use App\Models\LearnerCaseThread;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class LearnerCaseController extends Controller
{
    // ---------------------------------------------------------------------------
    // LIST
    // ---------------------------------------------------------------------------

    public function index(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $isSchoolHead = UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);
        $isMonitor = UserRoleResolver::has($user, UserRoleResolver::MONITOR);

        if (! $isSchoolHead && ! $isMonitor) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        $query = LearnerCase::query()
            ->with(['school:id,school_code,name', 'flaggedBy:id,name'])
            ->recentFirst();

        // School head can only see their own school
        if ($isSchoolHead) {
            if (! $user->school_id) {
                return response()->json(['data' => [], 'meta' => ['total' => 0]]);
            }
            $query->where('school_id', $user->school_id);
        }

        // Monitor can optionally filter by school
        if ($isMonitor) {
            $schoolId = $request->query('schoolId');
            if ($schoolId) {
                $query->where('school_id', (int) $schoolId);
            }
        }

        // Filters
        $severity = $request->query('severity');
        if ($severity && in_array($severity, ['low', 'medium', 'high'], true)) {
            $query->where('severity', $severity);
        }

        $status = $request->query('status');
        if ($status && in_array($status, ['open', 'monitoring', 'resolved'], true)) {
            $query->where('status', $status);
        }

        $issueType = $request->query('issueType');
        if ($issueType && in_array($issueType, ['financial', 'abuse', 'health', 'attendance', 'academic', 'other'], true)) {
            $query->where('issue_type', $issueType);
        }

        $overdue = filter_var($request->query('overdue'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($overdue === true) {
            $query->overdue();
        }

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function ($q) use ($search): void {
                $q->where('learner_name', 'like', '%' . $search . '%')
                  ->orWhere('lrn', 'like', '%' . $search . '%')
                  ->orWhere('grade_level', 'like', '%' . $search . '%')
                  ->orWhere('section', 'like', '%' . $search . '%');
            });
        }

        $perPage = min((int) $request->query('perPage', 25), 100);
        $paginated = $query->paginate($perPage);

        return response()->json([
            'data' => LearnerCaseResource::collection($paginated->items()),
            'meta' => [
                'total' => $paginated->total(),
                'perPage' => $paginated->perPage(),
                'currentPage' => $paginated->currentPage(),
                'lastPage' => $paginated->lastPage(),
            ],
        ]);
    }

    // ---------------------------------------------------------------------------
    // CREATE
    // ---------------------------------------------------------------------------

    public function store(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)) {
            return response()->json(['message' => 'Only School Heads can create learner cases.'], Response::HTTP_FORBIDDEN);
        }

        if (! $user->school_id) {
            return response()->json(['message' => 'Your account is not linked to a school.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $validated = $request->validate([
            'lrn' => ['nullable', 'string', 'max:12'],
            'learnerName' => ['nullable', 'string', 'max:255'],
            'gradeLevel' => ['required', 'string', 'max:50'],
            'section' => ['required', 'string', 'max:100'],
            'issueType' => ['required', Rule::in(['financial', 'abuse', 'health', 'attendance', 'academic', 'other'])],
            'severity' => ['required', Rule::in(['low', 'medium', 'high'])],
            'description' => ['required', 'string', 'max:2000'],
        ]);

        $case = LearnerCase::create([
            'school_id' => $user->school_id,
            'flagged_by' => $user->id,
            'lrn' => $validated['lrn'] ?? null,
            'learner_name' => $validated['learnerName'] ?? null,
            'grade_level' => $validated['gradeLevel'],
            'section' => $validated['section'],
            'issue_type' => $validated['issueType'],
            'severity' => $validated['severity'],
            'description' => $validated['description'],
            'status' => 'open',
        ]);

        $case->load(['school:id,school_code,name', 'flaggedBy:id,name']);

        return response()->json(['data' => new LearnerCaseResource($case)], Response::HTTP_CREATED);
    }

    // ---------------------------------------------------------------------------
    // SHOW
    // ---------------------------------------------------------------------------

    public function show(Request $request, LearnerCase $case): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! $this->canAccess($user, $case)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        $case->load([
            'school:id,school_code,name',
            'flaggedBy:id,name',
            'acknowledgedBy:id,name',
            'resolvedBy:id,name',
            'attachments.uploadedBy:id,name',
            'threads.user:id,name',
        ]);

        return response()->json(['data' => new LearnerCaseResource($case)]);
    }

    // ---------------------------------------------------------------------------
    // UPDATE
    // ---------------------------------------------------------------------------

    public function update(Request $request, LearnerCase $case): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        if ((int) $user->school_id !== (int) $case->school_id) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        if ($case->status === 'resolved') {
            return response()->json(['message' => 'Resolved cases cannot be edited.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $validated = $request->validate([
            'lrn' => ['nullable', 'string', 'max:12'],
            'learnerName' => ['nullable', 'string', 'max:255'],
            'gradeLevel' => ['sometimes', 'required', 'string', 'max:50'],
            'section' => ['sometimes', 'required', 'string', 'max:100'],
            'issueType' => ['sometimes', 'required', Rule::in(['financial', 'abuse', 'health', 'attendance', 'academic', 'other'])],
            'severity' => ['sometimes', 'required', Rule::in(['low', 'medium', 'high'])],
            'description' => ['sometimes', 'required', 'string', 'max:2000'],
        ]);

        $case->update([
            'lrn' => array_key_exists('lrn', $validated) ? $validated['lrn'] : $case->lrn,
            'learner_name' => array_key_exists('learnerName', $validated) ? $validated['learnerName'] : $case->learner_name,
            'grade_level' => $validated['gradeLevel'] ?? $case->grade_level,
            'section' => $validated['section'] ?? $case->section,
            'issue_type' => $validated['issueType'] ?? $case->issue_type,
            'severity' => $validated['severity'] ?? $case->severity,
            'description' => $validated['description'] ?? $case->description,
        ]);

        $case->load(['school:id,school_code,name', 'flaggedBy:id,name']);

        return response()->json(['data' => new LearnerCaseResource($case)]);
    }

    // ---------------------------------------------------------------------------
    // DELETE
    // ---------------------------------------------------------------------------

    public function destroy(Request $request, LearnerCase $case): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        if ((int) $user->school_id !== (int) $case->school_id) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        $case->delete();

        return response()->json(['message' => 'Case deleted.']);
    }

    // ---------------------------------------------------------------------------
    // ACKNOWLEDGE (monitor moves case to "monitoring")
    // ---------------------------------------------------------------------------

    public function acknowledge(Request $request, LearnerCase $case): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! UserRoleResolver::has($user, UserRoleResolver::MONITOR)) {
            return response()->json(['message' => 'Only Division Monitors can acknowledge cases.'], Response::HTTP_FORBIDDEN);
        }

        if ($case->status !== 'open') {
            return response()->json(['message' => 'Only open cases can be acknowledged.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $case->update([
            'status' => 'monitoring',
            'acknowledged_at' => now(),
            'acknowledged_by' => $user->id,
        ]);

        $case->load(['school:id,school_code,name', 'flaggedBy:id,name', 'acknowledgedBy:id,name']);

        return response()->json(['data' => new LearnerCaseResource($case)]);
    }

    // ---------------------------------------------------------------------------
    // RESOLVE
    // ---------------------------------------------------------------------------

    public function resolve(Request $request, LearnerCase $case): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $isSchoolHead = UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);
        $isMonitor = UserRoleResolver::has($user, UserRoleResolver::MONITOR);

        if (! $isSchoolHead && ! $isMonitor) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        // School head can only resolve their own school's cases
        if ($isSchoolHead && (int) $user->school_id !== (int) $case->school_id) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        if ($case->status === 'resolved') {
            return response()->json(['message' => 'Case is already resolved.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $case->update([
            'status' => 'resolved',
            'resolved_at' => now(),
            'resolved_by' => $user->id,
        ]);

        $case->load(['school:id,school_code,name', 'flaggedBy:id,name', 'resolvedBy:id,name']);

        return response()->json(['data' => new LearnerCaseResource($case)]);
    }

    // ---------------------------------------------------------------------------
    // THREADS
    // ---------------------------------------------------------------------------

    public function threads(Request $request, LearnerCase $case): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! $this->canAccess($user, $case)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        $threads = $case->threads()->with('user:id,name')->get();

        return response()->json(['data' => LearnerCaseThreadResource::collection($threads)]);
    }

    public function addThread(Request $request, LearnerCase $case): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! $this->canAccess($user, $case)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        $validated = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
        ]);

        $thread = LearnerCaseThread::create([
            'concern_id' => $case->id,
            'user_id' => $user->id,
            'message' => $validated['message'],
        ]);

        $thread->load('user:id,name');

        return response()->json(['data' => new LearnerCaseThreadResource($thread)], Response::HTTP_CREATED);
    }

    // ---------------------------------------------------------------------------
    // ATTACHMENTS
    // ---------------------------------------------------------------------------

    public function uploadAttachment(Request $request, LearnerCase $case): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        if ((int) $user->school_id !== (int) $case->school_id) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        $request->validate([
            'file' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,doc,docx', 'max:10240'],
        ]);

        $file = $request->file('file');
        $extension = strtolower($file->getClientOriginalExtension());
        $storedName = Str::uuid() . '.' . $extension;
        $path = "private/cases/{$case->school_id}/{$case->id}/{$storedName}";

        Storage::put($path, file_get_contents($file->getRealPath()));

        $attachment = LearnerCaseAttachment::create([
            'concern_id' => $case->id,
            'file_path' => $path,
            'original_filename' => $file->getClientOriginalName(),
            'file_type' => $extension === 'jpeg' ? 'jpg' : $extension,
            'uploaded_by' => $user->id,
        ]);

        $attachment->load('uploadedBy:id,name');

        return response()->json(['data' => new LearnerCaseAttachmentResource($attachment)], Response::HTTP_CREATED);
    }

    public function downloadAttachment(Request $request, LearnerCase $case, LearnerCaseAttachment $attachment): StreamedResponse|JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! $this->canAccess($user, $case)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        if ((int) $attachment->concern_id !== (int) $case->id) {
            return response()->json(['message' => 'Not found.'], Response::HTTP_NOT_FOUND);
        }

        $path = $attachment->file_path; // decrypted by accessor

        if (! Storage::exists($path)) {
            return response()->json(['message' => 'File not found.'], Response::HTTP_NOT_FOUND);
        }

        return Storage::download($path, $attachment->original_filename);
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private function canAccess(\App\Models\User $user, LearnerCase $case): bool
    {
        $isSchoolHead = UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);
        $isMonitor = UserRoleResolver::has($user, UserRoleResolver::MONITOR);

        if ($isMonitor) {
            return true;
        }

        if ($isSchoolHead) {
            return (int) $user->school_id === (int) $case->school_id;
        }

        return false;
    }
}
