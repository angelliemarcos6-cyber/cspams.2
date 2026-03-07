<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\GenerateFormSubmissionRequest;
use App\Http\Requests\Api\ValidateFormSubmissionRequest;
use App\Http\Resources\FormSubmissionHistoryResource;
use App\Http\Resources\Sf1SubmissionResource;
use App\Http\Resources\Sf5SubmissionResource;
use App\Models\FormSubmissionHistory;
use App\Models\Sf1Submission;
use App\Models\Sf5Submission;
use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\FormSubmissionStatus;
use App\Support\Forms\FormSubmissionHistoryLogger;
use App\Support\Forms\Sf1PayloadFactory;
use App\Support\Forms\Sf5PayloadFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class FormSubmissionController extends Controller
{
    public function indexSf1(Request $request): AnonymousResourceCollection
    {
        $user = $this->requireUser($request);

        $query = Sf1Submission::query()
            ->with([
                'school:id,school_code,name',
                'academicYear:id,name',
                'generatedBy:id,name,email',
                'submittedBy:id,name,email',
                'validatedBy:id,name,email',
            ])
            ->orderByDesc('id');

        $this->applyVisibilityScope($query, $user);
        $this->applyCommonFilters($query, $request);

        return Sf1SubmissionResource::collection($query->limit(200)->get());
    }

    public function indexSf5(Request $request): AnonymousResourceCollection
    {
        $user = $this->requireUser($request);

        $query = Sf5Submission::query()
            ->with([
                'school:id,school_code,name',
                'academicYear:id,name',
                'generatedBy:id,name,email',
                'submittedBy:id,name,email',
                'validatedBy:id,name,email',
            ])
            ->orderByDesc('id');

        $this->applyVisibilityScope($query, $user);
        $this->applyCommonFilters($query, $request);

        return Sf5SubmissionResource::collection($query->limit(200)->get());
    }

    public function generateSf1(GenerateFormSubmissionRequest $request): JsonResponse
    {
        $user = $this->requireUser($request);

        $schoolId = $this->resolveGenerationSchoolId(
            $user,
            $request->filled('school_id') ? $request->integer('school_id') : null,
        );

        $academicYearId = $request->integer('academic_year_id');
        $reportingPeriod = $request->filled('reporting_period') ? $request->string('reporting_period')->toString() : null;

        $payload = app(Sf1PayloadFactory::class)->build($schoolId, $academicYearId);

        $submission = Sf1Submission::query()->create([
            'school_id' => $schoolId,
            'academic_year_id' => $academicYearId,
            'reporting_period' => $reportingPeriod,
            'version' => $this->nextVersionForSf1($schoolId, $academicYearId, $reportingPeriod),
            'status' => FormSubmissionStatus::DRAFT->value,
            'payload' => $payload,
            'generated_by' => $user->id,
            'generated_at' => now(),
        ]);

        app(FormSubmissionHistoryLogger::class)->log(
            formType: Sf1Submission::FORM_TYPE,
            submissionId: $submission->id,
            schoolId: $submission->school_id,
            academicYearId: $submission->academic_year_id,
            action: 'generated',
            fromStatus: null,
            toStatus: FormSubmissionStatus::DRAFT,
            actorId: $user->id,
            notes: 'Auto-generated SF-1 from current learner records.',
            metadata: [
                'total_learners' => data_get($payload, 'summary.total_learners'),
            ],
        );

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'generatedBy:id,name,email',
            'submittedBy:id,name,email',
            'validatedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new Sf1SubmissionResource($submission))->resolve(),
        ], Response::HTTP_CREATED);
    }

    public function generateSf5(GenerateFormSubmissionRequest $request): JsonResponse
    {
        $user = $this->requireUser($request);

        $schoolId = $this->resolveGenerationSchoolId(
            $user,
            $request->filled('school_id') ? $request->integer('school_id') : null,
        );

        $academicYearId = $request->integer('academic_year_id');
        $reportingPeriod = $request->filled('reporting_period') ? $request->string('reporting_period')->toString() : null;

        $payload = app(Sf5PayloadFactory::class)->build($schoolId, $academicYearId, $reportingPeriod);

        $submission = Sf5Submission::query()->create([
            'school_id' => $schoolId,
            'academic_year_id' => $academicYearId,
            'reporting_period' => $reportingPeriod,
            'version' => $this->nextVersionForSf5($schoolId, $academicYearId, $reportingPeriod),
            'status' => FormSubmissionStatus::DRAFT->value,
            'payload' => $payload,
            'generated_by' => $user->id,
            'generated_at' => now(),
        ]);

        app(FormSubmissionHistoryLogger::class)->log(
            formType: Sf5Submission::FORM_TYPE,
            submissionId: $submission->id,
            schoolId: $submission->school_id,
            academicYearId: $submission->academic_year_id,
            action: 'generated',
            fromStatus: null,
            toStatus: FormSubmissionStatus::DRAFT,
            actorId: $user->id,
            notes: 'Auto-generated SF-5 from current status and performance records.',
            metadata: [
                'total_learners' => data_get($payload, 'summary.total_learners'),
                'reporting_period' => $reportingPeriod,
            ],
        );

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'generatedBy:id,name,email',
            'submittedBy:id,name,email',
            'validatedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new Sf5SubmissionResource($submission))->resolve(),
        ], Response::HTTP_CREATED);
    }

    public function submitSf1(Request $request, Sf1Submission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanSubmit($user, $submission->school_id);

        $fromStatus = $this->statusValue($submission->status);
        if (! in_array($fromStatus, [
            FormSubmissionStatus::DRAFT->value,
            FormSubmissionStatus::RETURNED->value,
        ], true)) {
            throw ValidationException::withMessages([
                'submission' => 'Only draft or returned SF-1 submissions can be submitted.',
            ]);
        }

        $submission->forceFill([
            'status' => FormSubmissionStatus::SUBMITTED->value,
            'submitted_by' => $user->id,
            'submitted_at' => now(),
        ])->save();

        app(FormSubmissionHistoryLogger::class)->log(
            formType: Sf1Submission::FORM_TYPE,
            submissionId: $submission->id,
            schoolId: $submission->school_id,
            academicYearId: $submission->academic_year_id,
            action: 'submitted',
            fromStatus: $fromStatus,
            toStatus: FormSubmissionStatus::SUBMITTED,
            actorId: $user->id,
            notes: 'SF-1 submitted for monitor validation.',
        );

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'generatedBy:id,name,email',
            'submittedBy:id,name,email',
            'validatedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new Sf1SubmissionResource($submission))->resolve(),
        ]);
    }

    public function submitSf5(Request $request, Sf5Submission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanSubmit($user, $submission->school_id);

        $fromStatus = $this->statusValue($submission->status);
        if (! in_array($fromStatus, [
            FormSubmissionStatus::DRAFT->value,
            FormSubmissionStatus::RETURNED->value,
        ], true)) {
            throw ValidationException::withMessages([
                'submission' => 'Only draft or returned SF-5 submissions can be submitted.',
            ]);
        }

        $submission->forceFill([
            'status' => FormSubmissionStatus::SUBMITTED->value,
            'submitted_by' => $user->id,
            'submitted_at' => now(),
        ])->save();

        app(FormSubmissionHistoryLogger::class)->log(
            formType: Sf5Submission::FORM_TYPE,
            submissionId: $submission->id,
            schoolId: $submission->school_id,
            academicYearId: $submission->academic_year_id,
            action: 'submitted',
            fromStatus: $fromStatus,
            toStatus: FormSubmissionStatus::SUBMITTED,
            actorId: $user->id,
            notes: 'SF-5 submitted for monitor validation.',
        );

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'generatedBy:id,name,email',
            'submittedBy:id,name,email',
            'validatedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new Sf5SubmissionResource($submission))->resolve(),
        ]);
    }

    public function validateSf1(ValidateFormSubmissionRequest $request, Sf1Submission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanValidate($user);
        $this->assertCanView($user, $submission->school_id);

        $fromStatus = $this->statusValue($submission->status);
        if ($fromStatus !== FormSubmissionStatus::SUBMITTED->value) {
            throw ValidationException::withMessages([
                'submission' => 'Only submitted SF-1 forms can be validated or returned.',
            ]);
        }

        $decision = $request->string('decision')->toString();
        $notes = $request->filled('notes') ? trim($request->string('notes')->toString()) : null;

        $submission->forceFill([
            'status' => $decision,
            'validated_by' => $user->id,
            'validated_at' => now(),
            'validation_notes' => $notes,
        ])->save();

        app(FormSubmissionHistoryLogger::class)->log(
            formType: Sf1Submission::FORM_TYPE,
            submissionId: $submission->id,
            schoolId: $submission->school_id,
            academicYearId: $submission->academic_year_id,
            action: $decision === FormSubmissionStatus::VALIDATED->value ? 'validated' : 'returned',
            fromStatus: $fromStatus,
            toStatus: $decision,
            actorId: $user->id,
            notes: $notes,
        );

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'generatedBy:id,name,email',
            'submittedBy:id,name,email',
            'validatedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new Sf1SubmissionResource($submission))->resolve(),
        ]);
    }

    public function validateSf5(ValidateFormSubmissionRequest $request, Sf5Submission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanValidate($user);
        $this->assertCanView($user, $submission->school_id);

        $fromStatus = $this->statusValue($submission->status);
        if ($fromStatus !== FormSubmissionStatus::SUBMITTED->value) {
            throw ValidationException::withMessages([
                'submission' => 'Only submitted SF-5 forms can be validated or returned.',
            ]);
        }

        $decision = $request->string('decision')->toString();
        $notes = $request->filled('notes') ? trim($request->string('notes')->toString()) : null;

        $submission->forceFill([
            'status' => $decision,
            'validated_by' => $user->id,
            'validated_at' => now(),
            'validation_notes' => $notes,
        ])->save();

        app(FormSubmissionHistoryLogger::class)->log(
            formType: Sf5Submission::FORM_TYPE,
            submissionId: $submission->id,
            schoolId: $submission->school_id,
            academicYearId: $submission->academic_year_id,
            action: $decision === FormSubmissionStatus::VALIDATED->value ? 'validated' : 'returned',
            fromStatus: $fromStatus,
            toStatus: $decision,
            actorId: $user->id,
            notes: $notes,
        );

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'generatedBy:id,name,email',
            'submittedBy:id,name,email',
            'validatedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new Sf5SubmissionResource($submission))->resolve(),
        ]);
    }

    public function sf1History(Request $request, Sf1Submission $submission): AnonymousResourceCollection
    {
        $user = $this->requireUser($request);
        $this->assertCanView($user, $submission->school_id);

        $history = FormSubmissionHistory::query()
            ->with('actor:id,name,email')
            ->where('form_type', Sf1Submission::FORM_TYPE)
            ->where('submission_id', $submission->id)
            ->orderByDesc('created_at')
            ->get();

        return FormSubmissionHistoryResource::collection($history);
    }

    public function sf5History(Request $request, Sf5Submission $submission): AnonymousResourceCollection
    {
        $user = $this->requireUser($request);
        $this->assertCanView($user, $submission->school_id);

        $history = FormSubmissionHistory::query()
            ->with('actor:id,name,email')
            ->where('form_type', Sf5Submission::FORM_TYPE)
            ->where('submission_id', $submission->id)
            ->orderByDesc('created_at')
            ->get();

        return FormSubmissionHistoryResource::collection($history);
    }

    private function requireUser(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
        abort_if(! $user, Response::HTTP_UNAUTHORIZED, 'Unauthenticated.');

        return $user;
    }

    private function applyVisibilityScope(Builder $query, User $user): void
    {
        if ($this->isSchoolHead($user)) {
            abort_if(! $user->school_id, Response::HTTP_FORBIDDEN, 'School Head account is missing school assignment.');
            $query->where('school_id', $user->school_id);
            return;
        }

        $this->assertCanValidate($user);
    }

    private function applyCommonFilters(Builder $query, Request $request): void
    {
        if ($request->filled('school_id')) {
            $query->where('school_id', $request->integer('school_id'));
        }

        if ($request->filled('academic_year_id')) {
            $query->where('academic_year_id', $request->integer('academic_year_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }

        if ($request->has('reporting_period')) {
            $reportingPeriod = trim((string) $request->input('reporting_period'));
            if ($reportingPeriod === '') {
                $query->whereNull('reporting_period');
            } else {
                $query->where('reporting_period', $reportingPeriod);
            }
        }
    }

    private function resolveGenerationSchoolId(User $user, ?int $requestedSchoolId): int
    {
        if ($this->isSchoolHead($user)) {
            abort_if(! $user->school_id, Response::HTTP_FORBIDDEN, 'School Head account is missing school assignment.');

            return (int) $user->school_id;
        }

        $this->assertCanValidate($user);

        if (! $requestedSchoolId) {
            throw ValidationException::withMessages([
                'school_id' => 'Monitor-generated forms require a school_id.',
            ]);
        }

        return $requestedSchoolId;
    }

    private function assertCanView(User $user, int $schoolId): void
    {
        if ($this->isMonitor($user)) {
            return;
        }

        if ($this->isSchoolHead($user) && (int) $user->school_id === (int) $schoolId) {
            return;
        }

        abort(Response::HTTP_FORBIDDEN, 'You are not allowed to access this form submission.');
    }

    private function assertCanSubmit(User $user, int $schoolId): void
    {
        if ($this->isSchoolHead($user) && (int) $user->school_id === (int) $schoolId) {
            return;
        }

        abort(Response::HTTP_FORBIDDEN, 'Only the assigned School Head can submit this form.');
    }

    private function assertCanValidate(User $user): void
    {
        abort_if(! $this->isMonitor($user), Response::HTTP_FORBIDDEN, 'Only monitor users can validate forms.');
    }

    private function nextVersionForSf1(int $schoolId, int $academicYearId, ?string $reportingPeriod): int
    {
        $query = Sf1Submission::query()
            ->where('school_id', $schoolId)
            ->where('academic_year_id', $academicYearId);

        if ($reportingPeriod === null) {
            $query->whereNull('reporting_period');
        } else {
            $query->where('reporting_period', $reportingPeriod);
        }

        return ((int) $query->max('version')) + 1;
    }

    private function nextVersionForSf5(int $schoolId, int $academicYearId, ?string $reportingPeriod): int
    {
        $query = Sf5Submission::query()
            ->where('school_id', $schoolId)
            ->where('academic_year_id', $academicYearId);

        if ($reportingPeriod === null) {
            $query->whereNull('reporting_period');
        } else {
            $query->where('reporting_period', $reportingPeriod);
        }

        return ((int) $query->max('version')) + 1;
    }

    private function isMonitor(User $user): bool
    {
        return UserRoleResolver::has($user, UserRoleResolver::MONITOR);
    }

    private function isSchoolHead(User $user): bool
    {
        return UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);
    }

    private function statusValue(FormSubmissionStatus|string|null $status): ?string
    {
        if ($status instanceof FormSubmissionStatus) {
            return $status->value;
        }

        return is_string($status) && $status !== '' ? $status : null;
    }
}
