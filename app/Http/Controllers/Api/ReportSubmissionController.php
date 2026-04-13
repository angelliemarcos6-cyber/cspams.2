<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ReportSubmissionResource;
use App\Models\AcademicYear;
use App\Models\ReportSubmission;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportSubmissionController extends Controller
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

        $query = ReportSubmission::query()
            ->with(['school:id,school_code,name', 'academicYear:id,name,is_current', 'submittedBy:id,name', 'approvedBy:id,name'])
            ->orderByDesc('updated_at');

        if ($isSchoolHead) {
            if (! $user->school_id) {
                return response()->json(['data' => []]);
            }
            $query->where('school_id', $user->school_id);
        }

        if ($isMonitor) {
            $schoolId = $request->query('schoolId');
            if ($schoolId) {
                $query->where('school_id', (int) $schoolId);
            }
        }

        // Optional filters
        $reportType = $request->query('reportType');
        if ($reportType && in_array($reportType, ['bmef', 'targets_met'], true)) {
            $query->where('report_type', $reportType);
        }

        $status = $request->query('status');
        if ($status && in_array($status, ['pending', 'submitted', 'approved'], true)) {
            $query->where('status', $status);
        }

        $academicYearId = $request->query('academicYearId');
        if ($academicYearId) {
            $query->where('academic_year_id', (int) $academicYearId);
        }

        $submissions = $query->get();

        return response()->json(['data' => ReportSubmissionResource::collection($submissions)]);
    }

    // ---------------------------------------------------------------------------
    // UPLOAD / CREATE
    // ---------------------------------------------------------------------------

    public function store(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)) {
            return response()->json(['message' => 'Only School Heads can upload reports.'], Response::HTTP_FORBIDDEN);
        }

        if (! $user->school_id) {
            return response()->json(['message' => 'Your account is not linked to a school.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $validated = $request->validate([
            'reportType' => ['required', Rule::in(['bmef', 'targets_met'])],
            'academicYearId' => ['required', 'integer', 'exists:academic_years,id'],
            'file' => ['required', 'file', 'mimes:pdf,docx,doc,xlsx,xls', 'max:10240'],
        ]);

        $file = $request->file('file');

        // Check if a record already exists — if so, return error (use replace endpoint)
        $existing = ReportSubmission::where([
            'school_id' => $user->school_id,
            'academic_year_id' => $validated['academicYearId'],
            'report_type' => $validated['reportType'],
        ])->first();

        if ($existing) {
            return response()->json([
                'message' => 'A submission already exists. Use the replace endpoint to update the file.',
                'data' => new ReportSubmissionResource($existing->load(['school:id,school_code,name', 'academicYear:id,name,is_current', 'submittedBy:id,name'])),
            ], Response::HTTP_CONFLICT);
        }

        $path = $this->storeFile($file, $user->school_id, $validated['academicYearId'], $validated['reportType']);

        $submission = ReportSubmission::create([
            'school_id' => $user->school_id,
            'academic_year_id' => $validated['academicYearId'],
            'report_type' => $validated['reportType'],
            'status' => 'submitted',
            'file_path' => $path,
            'original_filename' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'submitted_at' => now(),
            'submitted_by' => $user->id,
        ]);

        $submission->load(['school:id,school_code,name', 'academicYear:id,name,is_current', 'submittedBy:id,name']);

        return response()->json(['data' => new ReportSubmissionResource($submission)], Response::HTTP_CREATED);
    }

    // ---------------------------------------------------------------------------
    // SHOW
    // ---------------------------------------------------------------------------

    public function show(Request $request, ReportSubmission $submission): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! $this->canAccess($user, $submission)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        $submission->load(['school:id,school_code,name', 'academicYear:id,name,is_current', 'submittedBy:id,name', 'approvedBy:id,name']);

        return response()->json(['data' => new ReportSubmissionResource($submission)]);
    }

    // ---------------------------------------------------------------------------
    // REPLACE FILE
    // ---------------------------------------------------------------------------

    public function replace(Request $request, ReportSubmission $submission): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        if ((int) $user->school_id !== (int) $submission->school_id) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        if ($submission->status === 'approved') {
            return response()->json(['message' => 'Approved submissions cannot be replaced.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $request->validate([
            'file' => ['required', 'file', 'mimes:pdf,docx,doc,xlsx,xls', 'max:10240'],
        ]);

        $file = $request->file('file');

        // Delete old file
        $oldPath = $submission->file_path; // decrypted via accessor
        if ($oldPath && Storage::exists($oldPath)) {
            Storage::delete($oldPath);
        }

        $path = $this->storeFile($file, $submission->school_id, $submission->academic_year_id, $submission->report_type);

        $submission->update([
            'file_path' => $path,
            'original_filename' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'status' => 'submitted',
            'submitted_at' => now(),
            'submitted_by' => $user->id,
            'approved_at' => null,
            'approved_by' => null,
        ]);

        $submission->load(['school:id,school_code,name', 'academicYear:id,name,is_current', 'submittedBy:id,name']);

        return response()->json(['data' => new ReportSubmissionResource($submission)]);
    }

    // ---------------------------------------------------------------------------
    // APPROVE (monitor only)
    // ---------------------------------------------------------------------------

    public function approve(Request $request, ReportSubmission $submission): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! UserRoleResolver::has($user, UserRoleResolver::MONITOR)) {
            return response()->json(['message' => 'Only Division Monitors can approve submissions.'], Response::HTTP_FORBIDDEN);
        }

        if ($submission->status !== 'submitted') {
            return response()->json(['message' => 'Only submitted reports can be approved.'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $validated = $request->validate([
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $submission->update([
            'status' => 'approved',
            'approved_at' => now(),
            'approved_by' => $user->id,
            'notes' => $validated['notes'] ?? $submission->notes,
        ]);

        $submission->load(['school:id,school_code,name', 'academicYear:id,name,is_current', 'submittedBy:id,name', 'approvedBy:id,name']);

        return response()->json(['data' => new ReportSubmissionResource($submission)]);
    }

    // ---------------------------------------------------------------------------
    // DOWNLOAD
    // ---------------------------------------------------------------------------

    public function download(Request $request, ReportSubmission $submission): StreamedResponse|JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if (! $this->canAccess($user, $submission)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        if (! $submission->file_path) {
            return response()->json(['message' => 'No file uploaded yet.'], Response::HTTP_NOT_FOUND);
        }

        $path = $submission->file_path; // decrypted via accessor

        if (! Storage::exists($path)) {
            return response()->json(['message' => 'File not found.'], Response::HTTP_NOT_FOUND);
        }

        return Storage::download($path, $submission->original_filename);
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private function canAccess(\App\Models\User $user, ReportSubmission $submission): bool
    {
        $isMonitor = UserRoleResolver::has($user, UserRoleResolver::MONITOR);
        $isSchoolHead = UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);

        if ($isMonitor) {
            return true;
        }

        if ($isSchoolHead) {
            return (int) $user->school_id === (int) $submission->school_id;
        }

        return false;
    }

    private function storeFile(\Illuminate\Http\UploadedFile $file, int $schoolId, int $academicYearId, string $reportType): string
    {
        $extension = strtolower($file->getClientOriginalExtension());
        $storedName = Str::uuid() . '.' . $extension;
        $path = "private/reports/{$schoolId}/{$academicYearId}/{$reportType}/{$storedName}";
        Storage::put($path, file_get_contents($file->getRealPath()));

        return $path;
    }
}
