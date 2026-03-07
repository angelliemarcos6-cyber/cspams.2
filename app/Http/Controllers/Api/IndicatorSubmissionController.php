<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\ReviewIndicatorSubmissionRequest;
use App\Http\Requests\Api\UpsertIndicatorSubmissionRequest;
use App\Http\Resources\FormSubmissionHistoryResource;
use App\Http\Resources\IndicatorSubmissionResource;
use App\Models\AcademicYear;
use App\Models\FormSubmissionHistory;
use App\Models\IndicatorSubmission;
use App\Models\PerformanceMetric;
use App\Models\User;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\FormSubmissionStatus;
use App\Support\Forms\FormSubmissionHistoryLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class IndicatorSubmissionController extends Controller
{
    public function academicYears(Request $request): JsonResponse
    {
        $this->requireUser($request);

        $years = AcademicYear::query()
            ->orderByDesc('is_current')
            ->orderByDesc('start_date')
            ->get(['id', 'name', 'is_current']);

        return response()->json([
            'data' => $years->map(static fn (AcademicYear $year): array => [
                'id' => (string) $year->id,
                'name' => $year->name,
                'isCurrent' => (bool) $year->is_current,
            ])->values(),
        ]);
    }

    public function metrics(Request $request): JsonResponse
    {
        $this->requireUser($request);

        $metrics = PerformanceMetric::query()
            ->where('is_active', true)
            ->orderBy('category')
            ->orderBy('code')
            ->get(['id', 'code', 'name', 'category']);

        return response()->json([
            'data' => $metrics->map(static fn (PerformanceMetric $metric): array => [
                'id' => (string) $metric->id,
                'code' => $metric->code,
                'name' => $metric->name,
                'category' => is_string($metric->category)
                    ? $metric->category
                    : $metric->category->value,
            ])->values(),
        ]);
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $this->requireUser($request);

        $query = IndicatorSubmission::query()
            ->with([
                'school:id,school_code,name',
                'academicYear:id,name',
                'items.metric:id,code,name,category',
                'createdBy:id,name,email',
                'submittedBy:id,name,email',
                'reviewedBy:id,name,email',
            ])
            ->orderByDesc('id');

        $this->applyVisibilityScope($query, $user);
        $this->applyCommonFilters($query, $request);

        return IndicatorSubmissionResource::collection($query->limit(200)->get());
    }

    public function show(Request $request, IndicatorSubmission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanView($user, $submission->school_id);

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'items.metric:id,code,name,category',
            'createdBy:id,name,email',
            'submittedBy:id,name,email',
            'reviewedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new IndicatorSubmissionResource($submission))->resolve(),
        ]);
    }

    public function store(UpsertIndicatorSubmissionRequest $request): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertSchoolHead($user);
        abort_if(! $user->school_id, Response::HTTP_FORBIDDEN, 'School Head account is missing school assignment.');

        $schoolId = (int) $user->school_id;
        $academicYearId = $request->integer('academic_year_id');
        $reportingPeriod = $request->filled('reporting_period')
            ? $request->string('reporting_period')->toString()
            : null;
        $notes = $request->filled('notes')
            ? trim($request->string('notes')->toString())
            : null;

        $indicatorRows = collect($request->input('indicators', []))
            ->map(function (array $row): array {
                $targetValue = round((float) $row['target_value'], 2);
                $actualValue = round((float) $row['actual_value'], 2);
                $varianceValue = round($actualValue - $targetValue, 2);

                return [
                    'performance_metric_id' => (int) $row['metric_id'],
                    'target_value' => $targetValue,
                    'actual_value' => $actualValue,
                    'variance_value' => $varianceValue,
                    'compliance_status' => $this->complianceStatus($targetValue, $actualValue),
                    'remarks' => isset($row['remarks']) ? trim((string) $row['remarks']) : null,
                ];
            })
            ->values();

        /** @var IndicatorSubmission $submission */
        $submission = DB::transaction(function () use (
            $schoolId,
            $academicYearId,
            $reportingPeriod,
            $notes,
            $user,
            $indicatorRows,
        ): IndicatorSubmission {
            $submission = IndicatorSubmission::query()->create([
                'school_id' => $schoolId,
                'academic_year_id' => $academicYearId,
                'reporting_period' => $reportingPeriod,
                'version' => $this->nextVersion($schoolId, $academicYearId, $reportingPeriod),
                'status' => FormSubmissionStatus::DRAFT->value,
                'notes' => $notes,
                'created_by' => $user->id,
            ]);

            $submission->items()->createMany($indicatorRows->all());

            app(FormSubmissionHistoryLogger::class)->log(
                formType: IndicatorSubmission::FORM_TYPE,
                submissionId: $submission->id,
                schoolId: $submission->school_id,
                academicYearId: $submission->academic_year_id,
                action: 'generated',
                fromStatus: null,
                toStatus: FormSubmissionStatus::DRAFT,
                actorId: $user->id,
                notes: 'Indicator compliance package encoded for monitor review.',
                metadata: [
                    'indicator_count' => $indicatorRows->count(),
                    'met_count' => $indicatorRows->where('compliance_status', 'met')->count(),
                    'below_target_count' => $indicatorRows->where('compliance_status', 'below_target')->count(),
                ],
            );

            return $submission;
        });

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'items.metric:id,code,name,category',
            'createdBy:id,name,email',
            'submittedBy:id,name,email',
            'reviewedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new IndicatorSubmissionResource($submission))->resolve(),
        ], Response::HTTP_CREATED);
    }

    public function submit(Request $request, IndicatorSubmission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanSubmit($user, $submission->school_id);

        $fromStatus = $this->statusValue($submission->status);
        if (! in_array($fromStatus, [
            FormSubmissionStatus::DRAFT->value,
            FormSubmissionStatus::RETURNED->value,
        ], true)) {
            throw ValidationException::withMessages([
                'submission' => 'Only draft or returned indicator submissions can be submitted.',
            ]);
        }

        $submission->forceFill([
            'status' => FormSubmissionStatus::SUBMITTED->value,
            'submitted_by' => $user->id,
            'submitted_at' => now(),
        ])->save();

        app(FormSubmissionHistoryLogger::class)->log(
            formType: IndicatorSubmission::FORM_TYPE,
            submissionId: $submission->id,
            schoolId: $submission->school_id,
            academicYearId: $submission->academic_year_id,
            action: 'submitted',
            fromStatus: $fromStatus,
            toStatus: FormSubmissionStatus::SUBMITTED,
            actorId: $user->id,
            notes: 'Indicator package submitted to monitor.',
        );

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'items.metric:id,code,name,category',
            'createdBy:id,name,email',
            'submittedBy:id,name,email',
            'reviewedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new IndicatorSubmissionResource($submission))->resolve(),
        ]);
    }

    public function review(ReviewIndicatorSubmissionRequest $request, IndicatorSubmission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanReview($user);
        $this->assertCanView($user, $submission->school_id);

        $fromStatus = $this->statusValue($submission->status);
        if ($fromStatus !== FormSubmissionStatus::SUBMITTED->value) {
            throw ValidationException::withMessages([
                'submission' => 'Only submitted indicator packages can be validated or returned.',
            ]);
        }

        $decision = $request->string('decision')->toString();
        $notes = $request->filled('notes')
            ? trim($request->string('notes')->toString())
            : null;

        $submission->forceFill([
            'status' => $decision,
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
            'review_notes' => $notes,
        ])->save();

        app(FormSubmissionHistoryLogger::class)->log(
            formType: IndicatorSubmission::FORM_TYPE,
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
            'items.metric:id,code,name,category',
            'createdBy:id,name,email',
            'submittedBy:id,name,email',
            'reviewedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new IndicatorSubmissionResource($submission))->resolve(),
        ]);
    }

    public function history(Request $request, IndicatorSubmission $submission): AnonymousResourceCollection
    {
        $user = $this->requireUser($request);
        $this->assertCanView($user, $submission->school_id);

        $history = FormSubmissionHistory::query()
            ->with('actor:id,name,email')
            ->where('form_type', IndicatorSubmission::FORM_TYPE)
            ->where('submission_id', $submission->id)
            ->orderByDesc('created_at')
            ->get();

        return FormSubmissionHistoryResource::collection($history);
    }

    private function requireUser(Request $request): User
    {
        $user = ApiUserResolver::fromRequest($request);
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

        $this->assertCanReview($user);
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

    private function assertCanView(User $user, int $schoolId): void
    {
        if ($this->isMonitor($user)) {
            return;
        }

        if ($this->isSchoolHead($user) && (int) $user->school_id === (int) $schoolId) {
            return;
        }

        abort(Response::HTTP_FORBIDDEN, 'You are not allowed to access this indicator submission.');
    }

    private function assertCanSubmit(User $user, int $schoolId): void
    {
        if ($this->isSchoolHead($user) && (int) $user->school_id === (int) $schoolId) {
            return;
        }

        abort(Response::HTTP_FORBIDDEN, 'Only the assigned School Head can submit this indicator package.');
    }

    private function assertCanReview(User $user): void
    {
        abort_if(
            ! $this->isMonitor($user),
            Response::HTTP_FORBIDDEN,
            'Only monitor users can review indicator submissions.',
        );
    }

    private function assertSchoolHead(User $user): void
    {
        abort_if(
            ! $this->isSchoolHead($user),
            Response::HTTP_FORBIDDEN,
            'Only School Heads can encode indicator submissions.',
        );
    }

    private function complianceStatus(float $targetValue, float $actualValue): string
    {
        return $actualValue >= $targetValue ? 'met' : 'below_target';
    }

    private function nextVersion(int $schoolId, int $academicYearId, ?string $reportingPeriod): int
    {
        $query = IndicatorSubmission::query()
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
