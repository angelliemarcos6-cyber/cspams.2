<?php

namespace App\Http\Controllers\Api;

use App\Events\CspamsUpdateBroadcast;
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
use App\Notifications\IndicatorReviewOutcomeNotification;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\FormSubmissionStatus;
use App\Support\Domain\MetricDataType;
use App\Support\Forms\FormSubmissionHistoryLogger;
use App\Support\Indicators\RollingIndicatorYearWindow;
use App\Support\Indicators\TargetsMetAutoCalculator;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class IndicatorSubmissionController extends Controller
{
    public function academicYears(Request $request): JsonResponse
    {
        $this->requireUser($request);
        $this->syncRollingIndicatorYears();

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
        $this->syncRollingIndicatorYears();
        $autoMetricCodes = array_flip(app(TargetsMetAutoCalculator::class)->supportedCodes());

        $metrics = PerformanceMetric::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('category')
            ->orderBy('code')
            ->get(['id', 'code', 'name', 'category', 'framework', 'data_type', 'input_schema', 'unit', 'sort_order']);

        return response()->json([
            'data' => $metrics->map(fn (PerformanceMetric $metric): array => [
                'id' => (string) $metric->id,
                'code' => $metric->code,
                'name' => $metric->name,
                'category' => is_string($metric->category)
                    ? $metric->category
                    : $metric->category->value,
                'framework' => (string) $metric->framework,
                'dataType' => $metric->data_type instanceof MetricDataType
                    ? $metric->data_type->value
                    : (string) $metric->data_type,
                'inputSchema' => $metric->input_schema,
                'unit' => $metric->unit,
                'sortOrder' => (int) ($metric->sort_order ?? 0),
                'isAutoCalculated' => isset($autoMetricCodes[strtoupper((string) $metric->code)]),
            ])->values(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $this->requireUser($request);

        $scope = $this->isSchoolHead($user) ? 'school' : 'division';
        $baseScopeKey = $scope === 'school'
            ? ($user->school_id ? 'school:' . $user->school_id : 'school:unassigned')
            : 'division:all';
        $filtersKey = $this->buildFiltersKey($request);
        $scopeKey = $baseScopeKey . '|' . $filtersKey;

        $baseQuery = IndicatorSubmission::query();
        $this->applyVisibilityScope($baseQuery, $user);
        $this->applyCommonFilters($baseQuery, $request);

        $perPage = $this->resolvePerPage($request);
        $page = max(1, $request->integer('page', 1));

        $syncFingerprint = $this->buildSyncFingerprint(clone $baseQuery);
        $recordCount = $syncFingerprint['recordCount'];
        $latestAt = $syncFingerprint['latestAt'];
        $etag = $this->buildSyncEtag($scope, $scopeKey, $page, $perPage, $recordCount, $latestAt);

        $incomingEtag = trim((string) $request->header('If-None-Match'));
        if ($incomingEtag !== '' && trim($incomingEtag, '"') === $etag) {
            return $this->buildNotModifiedResponse($etag, $scope, $scopeKey, $recordCount, $latestAt);
        }

        $query = (clone $baseQuery)
            ->with([
                'school:id,school_code,name',
                'academicYear:id,name',
                'items.metric:id,code,name,category,framework,data_type,input_schema,unit,sort_order',
                'createdBy:id,name,email',
                'submittedBy:id,name,email',
                'reviewedBy:id,name,email',
            ])
            ->orderByDesc('id');

        $syncedAt = now()->toISOString();
        $resource = IndicatorSubmissionResource::collection(
            $query->paginate($perPage)->appends($request->query()),
        );

        return $this->applySyncHeaders(
            $resource->response(),
            $etag,
            $scope,
            $scopeKey,
            $recordCount,
            $latestAt,
            $syncedAt,
        );
    }

    public function show(Request $request, IndicatorSubmission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanView($user, $submission->school_id);

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'items.metric:id,code,name,category,framework,data_type,input_schema,unit,sort_order',
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
        $this->syncRollingIndicatorYears();

        $schoolId = (int) $user->school_id;
        $academicYearId = $request->integer('academic_year_id');
        $reportingPeriod = $request->filled('reporting_period')
            ? $request->string('reporting_period')->toString()
            : null;
        $notes = $request->filled('notes')
            ? trim($request->string('notes')->toString())
            : null;
        $indicatorRows = $this->buildIndicatorRows($request, $schoolId);

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

            event(new CspamsUpdateBroadcast([
                'entity' => 'indicators',
                'eventType' => 'indicators.generated',
                'submissionId' => (string) $submission->id,
                'schoolId' => (string) $submission->school_id,
                'academicYearId' => (string) $submission->academic_year_id,
                'status' => FormSubmissionStatus::DRAFT->value,
            ]));

            return $submission;
        });

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'items.metric:id,code,name,category,framework,data_type,input_schema,unit,sort_order',
            'createdBy:id,name,email',
            'submittedBy:id,name,email',
            'reviewedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new IndicatorSubmissionResource($submission))->resolve(),
        ], Response::HTTP_CREATED);
    }

    public function update(UpsertIndicatorSubmissionRequest $request, IndicatorSubmission $submission): JsonResponse
    {
        $user = $this->requireUser($request);
        $this->assertCanSubmit($user, $submission->school_id);
        $this->syncRollingIndicatorYears();

        $currentStatus = $this->statusValue($submission->status);
        if (! in_array($currentStatus, [
            FormSubmissionStatus::DRAFT->value,
            FormSubmissionStatus::RETURNED->value,
        ], true)) {
            throw ValidationException::withMessages([
                'submission' => 'Only draft or returned indicator submissions can be updated.',
            ]);
        }

        $academicYearId = $request->integer('academic_year_id');
        $reportingPeriod = $request->filled('reporting_period')
            ? $request->string('reporting_period')->toString()
            : null;
        $notes = $request->filled('notes')
            ? trim($request->string('notes')->toString())
            : null;
        $indicatorRows = $this->buildIndicatorRows($request, (int) $submission->school_id);

        DB::transaction(function () use (
            $submission,
            $user,
            $academicYearId,
            $reportingPeriod,
            $notes,
            $indicatorRows,
            $currentStatus,
        ): void {
            $submission->forceFill([
                'academic_year_id' => $academicYearId,
                'reporting_period' => $reportingPeriod,
                'notes' => $notes,
            ])->save();

            $submission->items()->delete();
            $submission->items()->createMany($indicatorRows->all());

            app(FormSubmissionHistoryLogger::class)->log(
                formType: IndicatorSubmission::FORM_TYPE,
                submissionId: $submission->id,
                schoolId: $submission->school_id,
                academicYearId: $submission->academic_year_id,
                action: 'updated',
                fromStatus: $currentStatus,
                toStatus: $currentStatus,
                actorId: $user->id,
                notes: 'Indicator package draft updated by school head.',
                metadata: [
                    'indicator_count' => $indicatorRows->count(),
                    'met_count' => $indicatorRows->where('compliance_status', 'met')->count(),
                    'below_target_count' => $indicatorRows->where('compliance_status', 'below_target')->count(),
                ],
            );

            event(new CspamsUpdateBroadcast([
                'entity' => 'indicators',
                'eventType' => 'indicators.updated',
                'submissionId' => (string) $submission->id,
                'schoolId' => (string) $submission->school_id,
                'academicYearId' => (string) $submission->academic_year_id,
                'status' => $currentStatus,
            ]));
        });

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'items.metric:id,code,name,category,framework,data_type,input_schema,unit,sort_order',
            'createdBy:id,name,email',
            'submittedBy:id,name,email',
            'reviewedBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new IndicatorSubmissionResource($submission))->resolve(),
        ]);
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
            'reviewed_by' => null,
            'reviewed_at' => null,
            'review_notes' => null,
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

        event(new CspamsUpdateBroadcast([
            'entity' => 'indicators',
            'eventType' => 'indicators.submitted',
            'submissionId' => (string) $submission->id,
            'schoolId' => (string) $submission->school_id,
            'academicYearId' => (string) $submission->academic_year_id,
            'status' => FormSubmissionStatus::SUBMITTED->value,
        ]));

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'items.metric:id,code,name,category,framework,data_type,input_schema,unit,sort_order',
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

        $schoolHeads = User::query()
            ->with('roles')
            ->where('school_id', $submission->school_id)
            ->get()
            ->filter(
                static fn (User $candidate): bool => UserRoleResolver::has($candidate, UserRoleResolver::SCHOOL_HEAD),
            )
            ->values();

        foreach ($schoolHeads as $schoolHead) {
            $schoolHead->notify(new IndicatorReviewOutcomeNotification(
                $submission,
                $user,
                $decision,
                $notes,
            ));
        }

        event(new CspamsUpdateBroadcast([
            'entity' => 'indicators',
            'eventType' => $decision === FormSubmissionStatus::VALIDATED->value ? 'indicators.validated' : 'indicators.returned',
            'submissionId' => (string) $submission->id,
            'schoolId' => (string) $submission->school_id,
            'academicYearId' => (string) $submission->academic_year_id,
            'status' => $decision,
            'notes' => $notes,
        ]));

        $submission->load([
            'school:id,school_code,name',
            'academicYear:id,name',
            'items.metric:id,code,name,category,framework,data_type,input_schema,unit,sort_order',
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

    private function syncRollingIndicatorYears(): void
    {
        app(RollingIndicatorYearWindow::class)->sync();
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

    /**
     * @return Collection<int, array{
     *     performance_metric_id: int,
     *     target_value: float,
     *     target_typed_value: array<string, mixed>,
     *     actual_value: float,
     *     actual_typed_value: array<string, mixed>,
     *     variance_value: float,
     *     target_display: string,
     *     actual_display: string,
     *     compliance_status: string,
     *     remarks: string|null
     * }>
     */
    private function buildIndicatorRows(UpsertIndicatorSubmissionRequest $request, int $schoolId): Collection
    {
        $rawIndicatorRows = collect($request->input('indicators', []))->values();
        $rawIndicatorRows = $this->mergeAutoCalculatedRows($rawIndicatorRows, $schoolId);
        $metricIds = $rawIndicatorRows
            ->pluck('metric_id')
            ->map(static fn (mixed $value): int => (int) $value)
            ->filter(static fn (int $value): bool => $value > 0)
            ->unique()
            ->values();

        $metricsById = PerformanceMetric::query()
            ->whereIn('id', $metricIds)
            ->get()
            ->keyBy('id');

        return $rawIndicatorRows
            ->map(function (array $row, int $index) use ($metricsById): array {
                $metricId = (int) ($row['metric_id'] ?? 0);
                /** @var PerformanceMetric|null $metric */
                $metric = $metricsById->get($metricId);

                if (! $metric) {
                    throw ValidationException::withMessages([
                        "indicators.{$index}.metric_id" => 'Selected indicator metric does not exist.',
                    ]);
                }

                $normalized = $this->normalizeMetricValues($metric, $row, $index);

                return [
                    'performance_metric_id' => $metricId,
                    'target_value' => $normalized['target_value'],
                    'target_typed_value' => $normalized['target_typed_value'],
                    'actual_value' => $normalized['actual_value'],
                    'actual_typed_value' => $normalized['actual_typed_value'],
                    'variance_value' => $normalized['variance_value'],
                    'target_display' => $normalized['target_display'],
                    'actual_display' => $normalized['actual_display'],
                    'compliance_status' => $normalized['compliance_status'],
                    'remarks' => isset($row['remarks']) ? trim((string) $row['remarks']) : null,
                ];
            })
            ->values();
    }

    /**
     * @param array<string, mixed> $row
     * @param array<string, mixed> $schema
     * @param int $index
     *
     * @return array{
     *     target_value: float,
     *     actual_value: float,
     *     variance_value: float,
     *     target_typed_value: array<string, mixed>,
     *     actual_typed_value: array<string, mixed>,
     *     target_display: string,
     *     actual_display: string,
     *     compliance_status: string
     * }
     */
    private function normalizeMetricValues(PerformanceMetric $metric, array $row, int $index): array
    {
        $schema = is_array($metric->input_schema) ? $metric->input_schema : [];
        $dataType = $this->metricDataType($metric);
        $comparison = (string) ($schema['comparison'] ?? $this->defaultComparison($dataType));

        $targetRaw = array_key_exists('target', $row)
            ? $row['target']
            : ($row['target_value'] ?? null);
        $actualRaw = array_key_exists('actual', $row)
            ? $row['actual']
            : ($row['actual_value'] ?? null);

        if ($targetRaw === null || $actualRaw === null) {
            throw ValidationException::withMessages([
                "indicators.{$index}" => 'Both target and actual values are required for this indicator.',
            ]);
        }

        $targetParsed = $this->parseMetricValue($dataType, $targetRaw, $schema, "indicators.{$index}.target");
        $actualParsed = $this->parseMetricValue($dataType, $actualRaw, $schema, "indicators.{$index}.actual");
        $varianceValue = round($actualParsed['numeric'] - $targetParsed['numeric'], 2);

        $complianceStatus = $this->isCompliant(
            $comparison,
            $targetParsed['comparable'],
            $actualParsed['comparable'],
        ) ? 'met' : 'below_target';

        return [
            'target_value' => round($targetParsed['numeric'], 2),
            'actual_value' => round($actualParsed['numeric'], 2),
            'variance_value' => $varianceValue,
            'target_typed_value' => $targetParsed['typed'],
            'actual_typed_value' => $actualParsed['typed'],
            'target_display' => $targetParsed['display'],
            'actual_display' => $actualParsed['display'],
            'compliance_status' => $complianceStatus,
        ];
    }

    private function metricDataType(PerformanceMetric $metric): string
    {
        if ($metric->data_type instanceof MetricDataType) {
            return $metric->data_type->value;
        }

        $raw = (string) $metric->data_type;
        return MetricDataType::tryFrom($raw)?->value ?? MetricDataType::NUMBER->value;
    }

    /**
     * @param array<string, mixed> $schema
     *
     * @return array{
     *     typed: array<string, mixed>,
     *     numeric: float,
     *     display: string,
     *     comparable: mixed
     * }
     */
    private function parseMetricValue(string $dataType, mixed $raw, array $schema, string $errorPath): array
    {
        return match ($dataType) {
            MetricDataType::CURRENCY->value => $this->parseCurrencyValue($raw, $schema, $errorPath),
            MetricDataType::YES_NO->value => $this->parseYesNoValue($raw, $errorPath),
            MetricDataType::ENUM->value => $this->parseEnumValue($raw, $schema, $errorPath),
            MetricDataType::YEARLY_MATRIX->value => $this->parseYearlyMatrixValue($raw, $schema, $errorPath),
            MetricDataType::TEXT->value => $this->parseTextValue($raw, $errorPath),
            default => $this->parseNumberValue($raw, $schema, $errorPath),
        };
    }

    /**
     * @param array<string, mixed> $schema
     *
     * @return array{typed: array<string, mixed>, numeric: float, display: string, comparable: float}
     */
    private function parseNumberValue(mixed $raw, array $schema, string $errorPath): array
    {
        $value = is_array($raw) ? ($raw['value'] ?? null) : $raw;

        if (! is_numeric($value)) {
            throw ValidationException::withMessages([
                $errorPath => 'Numeric value is required.',
            ]);
        }

        $numeric = round((float) $value, 2);
        $valueType = (string) ($schema['valueType'] ?? 'number');

        if ($valueType === 'integer' && floor($numeric) !== $numeric) {
            throw ValidationException::withMessages([
                $errorPath => 'Whole number is required.',
            ]);
        }

        $display = $valueType === 'percentage'
            ? number_format($numeric, 2) . '%'
            : number_format($numeric, 2);

        return [
            'typed' => ['value' => $numeric],
            'numeric' => $numeric,
            'display' => $display,
            'comparable' => $numeric,
        ];
    }

    /**
     * @param array<string, mixed> $schema
     *
     * @return array{typed: array<string, mixed>, numeric: float, display: string, comparable: float}
     */
    private function parseCurrencyValue(mixed $raw, array $schema, string $errorPath): array
    {
        $amount = is_array($raw)
            ? ($raw['amount'] ?? $raw['value'] ?? null)
            : $raw;

        if (! is_numeric($amount)) {
            throw ValidationException::withMessages([
                $errorPath => 'Currency amount is required.',
            ]);
        }

        $currency = (string) ($schema['currency'] ?? 'PHP');
        $numeric = round((float) $amount, 2);

        return [
            'typed' => [
                'amount' => $numeric,
                'currency' => $currency,
            ],
            'numeric' => $numeric,
            'display' => "{$currency} " . number_format($numeric, 2),
            'comparable' => $numeric,
        ];
    }

    /**
     * @return array{typed: array<string, mixed>, numeric: float, display: string, comparable: bool}
     */
    private function parseYesNoValue(mixed $raw, string $errorPath): array
    {
        $value = is_array($raw) ? ($raw['value'] ?? null) : $raw;
        $bool = $this->normalizeBoolean($value);

        if ($bool === null) {
            throw ValidationException::withMessages([
                $errorPath => 'Value must be Yes or No.',
            ]);
        }

        return [
            'typed' => ['value' => $bool],
            'numeric' => $bool ? 1.0 : 0.0,
            'display' => $bool ? 'Yes' : 'No',
            'comparable' => $bool,
        ];
    }

    /**
     * @param array<string, mixed> $schema
     *
     * @return array{typed: array<string, mixed>, numeric: float, display: string, comparable: string}
     */
    private function parseEnumValue(mixed $raw, array $schema, string $errorPath): array
    {
        $value = is_array($raw) ? ($raw['value'] ?? null) : $raw;
        $value = is_string($value) ? trim($value) : '';
        $options = collect($schema['options'] ?? [])->map(static fn (mixed $option): string => trim((string) $option))
            ->filter(static fn (string $option): bool => $option !== '')
            ->values();

        if ($value === '' || $options->isEmpty() || ! $options->contains($value)) {
            throw ValidationException::withMessages([
                $errorPath => 'Invalid option selected for this indicator.',
            ]);
        }

        $numeric = (float) ($options->search($value) + 1);

        return [
            'typed' => ['value' => $value],
            'numeric' => $numeric,
            'display' => $value,
            'comparable' => $value,
        ];
    }

    /**
     * @param array<string, mixed> $schema
     *
     * @return array{typed: array<string, mixed>, numeric: float, display: string, comparable: array<string, mixed>}
     */
    private function parseYearlyMatrixValue(mixed $raw, array $schema, string $errorPath): array
    {
        if (is_array($raw)) {
            $values = $raw['values'] ?? $raw;
        } else {
            $seedYears = collect($schema['years'] ?? [])
                ->map(static fn (mixed $year): string => trim((string) $year))
                ->filter(static fn (string $year): bool => $year !== '')
                ->values();
            $defaultYear = $seedYears->first() ?? 'value';
            $values = [$defaultYear => $raw];
        }

        if (! is_array($values)) {
            throw ValidationException::withMessages([
                $errorPath => 'Yearly matrix values are required.',
            ]);
        }

        $allowedYears = collect($schema['years'] ?? [])
            ->map(static fn (mixed $year): string => trim((string) $year))
            ->filter(static fn (string $year): bool => $year !== '')
            ->values();
        $providedYears = collect(array_keys($values))
            ->map(static fn (mixed $year): string => trim((string) $year))
            ->filter(static fn (string $year): bool => $year !== '')
            ->values();
        $valueType = (string) ($schema['valueType'] ?? 'number');
        $enumOptions = collect($schema['options'] ?? [])
            ->map(static fn (mixed $option): string => trim((string) $option))
            ->filter(static fn (string $option): bool => $option !== '')
            ->values();
        $currency = (string) ($schema['currency'] ?? 'PHP');

        if ($allowedYears->isNotEmpty()) {
            $invalidYear = $providedYears->first(
                static fn (string $year): bool => ! $allowedYears->contains($year),
            );

            if (is_string($invalidYear)) {
                throw ValidationException::withMessages([
                    $errorPath => "Invalid school-year key: {$invalidYear}.",
                ]);
            }
        }

        $years = $providedYears;
        if ($years->isEmpty()) {
            throw ValidationException::withMessages([
                $errorPath => 'At least one school-year value is required.',
            ]);
        }

        $normalized = [];
        foreach ($years as $year) {
            if (! array_key_exists($year, $values)) {
                throw ValidationException::withMessages([
                    $errorPath => "Missing value for {$year}.",
                ]);
            }

            $yearValue = $values[$year];

            if ($valueType === 'yes_no') {
                $boolValue = $this->normalizeBoolean($yearValue);
                if ($boolValue === null) {
                    throw ValidationException::withMessages([
                        $errorPath => "Invalid Yes/No value for {$year}.",
                    ]);
                }
                $normalized[$year] = $boolValue;
                continue;
            }

            if ($valueType === 'enum') {
                $enumValue = trim((string) $yearValue);
                if ($enumValue === '' || $enumOptions->isEmpty() || ! $enumOptions->contains($enumValue)) {
                    throw ValidationException::withMessages([
                        $errorPath => "Invalid option for {$year}.",
                    ]);
                }

                $normalized[$year] = $enumValue;
                continue;
            }

            if ($valueType === 'text') {
                $textValue = trim((string) $yearValue);
                if ($textValue === '') {
                    throw ValidationException::withMessages([
                        $errorPath => "Text value is required for {$year}.",
                    ]);
                }

                $normalized[$year] = $textValue;
                continue;
            }

            if (! is_numeric($yearValue)) {
                throw ValidationException::withMessages([
                    $errorPath => "Numeric value is required for {$year}.",
                ]);
            }

            $numericValue = round((float) $yearValue, 2);
            if ($valueType === 'integer' && floor($numericValue) !== $numericValue) {
                throw ValidationException::withMessages([
                    $errorPath => "Whole number is required for {$year}.",
                ]);
            }

            $normalized[$year] = $numericValue;
        }

        $numeric = round(collect($normalized)->sum(function (mixed $value) use ($valueType, $enumOptions): float {
            if (is_bool($value)) {
                return $value ? 1.0 : 0.0;
            }

            if (is_numeric($value)) {
                return (float) $value;
            }

            if ($valueType === 'enum') {
                $index = $enumOptions->search((string) $value);
                return $index === false ? 0.0 : ((float) $index + 1);
            }

            return 1.0;
        }), 2);

        $display = collect($normalized)
            ->map(function (mixed $value, string $year) use ($valueType, $currency): string {
                if (is_bool($value)) {
                    return "{$year}: " . ($value ? 'Yes' : 'No');
                }

                if (is_numeric($value)) {
                    $formatted = number_format((float) $value, 2);
                    if ($valueType === 'percentage') {
                        return "{$year}: {$formatted}%";
                    }

                    if ($valueType === 'currency') {
                        return "{$year}: {$currency} {$formatted}";
                    }

                    return "{$year}: {$formatted}";
                }

                return "{$year}: " . (string) $value;
            })
            ->join(' | ');

        return [
            'typed' => ['values' => $normalized],
            'numeric' => $numeric,
            'display' => $display,
            'comparable' => $normalized,
        ];
    }

    /**
     * @return array{typed: array<string, mixed>, numeric: float, display: string, comparable: string}
     */
    private function parseTextValue(mixed $raw, string $errorPath): array
    {
        $value = is_array($raw) ? ($raw['value'] ?? null) : $raw;
        $value = trim((string) $value);

        if ($value === '') {
            throw ValidationException::withMessages([
                $errorPath => 'Text value is required.',
            ]);
        }

        return [
            'typed' => ['value' => $value],
            'numeric' => 1.0,
            'display' => $value,
            'comparable' => $value,
        ];
    }

    private function defaultComparison(string $dataType): string
    {
        return match ($dataType) {
            MetricDataType::YES_NO->value,
            MetricDataType::ENUM->value,
            MetricDataType::TEXT->value => 'equal',
            default => 'greater_or_equal',
        };
    }

    private function normalizeBoolean(mixed $value): ?bool
    {
        if (is_bool($value)) {
            return $value;
        }

        $normalized = strtolower(trim((string) $value));
        return match ($normalized) {
            '1', 'true', 'yes', 'y' => true,
            '0', 'false', 'no', 'n' => false,
            default => null,
        };
    }

    private function isCompliant(string $comparison, mixed $target, mixed $actual): bool
    {
        if ($comparison === 'info_only') {
            return true;
        }

        if (is_array($target) && is_array($actual)) {
            $keys = array_unique(array_merge(array_keys($target), array_keys($actual)));
            foreach ($keys as $key) {
                if (! array_key_exists($key, $target) || ! array_key_exists($key, $actual)) {
                    return false;
                }

                if (! $this->isCompliant($comparison, $target[$key], $actual[$key])) {
                    return false;
                }
            }

            return true;
        }

        return match ($comparison) {
            'less_or_equal' => (float) $actual <= (float) $target,
            'equal' => (string) $actual === (string) $target,
            default => (float) $actual >= (float) $target,
        };
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

    private function resolvePerPage(Request $request, int $default = 25, int $max = 100): int
    {
        $perPage = $request->integer('per_page');

        if ($perPage <= 0) {
            return $default;
        }

        return min($perPage, $max);
    }

    private function buildFiltersKey(Request $request): string
    {
        $schoolIdKey = $request->filled('school_id')
            ? 'school_id:' . $request->integer('school_id')
            : 'school_id:any';
        $academicYearKey = $request->filled('academic_year_id')
            ? 'academic_year_id:' . $request->integer('academic_year_id')
            : 'academic_year_id:any';
        $statusKey = $request->filled('status')
            ? 'status:' . $request->string('status')->toString()
            : 'status:any';
        $reportingPeriodKey = 'reporting_period:any';
        if ($request->has('reporting_period')) {
            $raw = trim((string) $request->input('reporting_period'));
            $reportingPeriodKey = $raw === '' ? 'reporting_period:null' : 'reporting_period:' . $raw;
        }

        return implode('|', [
            $schoolIdKey,
            $academicYearKey,
            $statusKey,
            $reportingPeriodKey,
        ]);
    }

    /**
     * @return array{recordCount: int, latestAt: ?Carbon}
     */
    private function buildSyncFingerprint(Builder $query): array
    {
        $probe = (clone $query)
            ->selectRaw('COUNT(*) as aggregate_count')
            ->selectRaw('MAX(updated_at) as latest_updated_at')
            ->selectRaw('MAX(submitted_at) as latest_submitted_at')
            ->selectRaw('MAX(reviewed_at) as latest_reviewed_at')
            ->first();

        $recordCount = (int) ($probe?->aggregate_count ?? 0);
        $latestAt = $this->resolveLatestTimestamp(
            $probe?->latest_updated_at,
            $probe?->latest_submitted_at,
            $probe?->latest_reviewed_at,
        );

        return [
            'recordCount' => $recordCount,
            'latestAt' => $latestAt,
        ];
    }

    private function resolveLatestTimestamp(?string ...$rawTimestamps): ?Carbon
    {
        $timestamps = [];
        foreach ($rawTimestamps as $rawTimestamp) {
            if (! $rawTimestamp) {
                continue;
            }

            $timestamps[] = Carbon::parse($rawTimestamp);
        }

        if ($timestamps === []) {
            return null;
        }

        usort(
            $timestamps,
            static fn (Carbon $a, Carbon $b): int => $b->greaterThan($a) ? 1 : ($a->equalTo($b) ? 0 : -1),
        );

        return $timestamps[0];
    }

    private function buildSyncEtag(
        string $scope,
        string $scopeKey,
        int $page,
        int $perPage,
        int $recordCount,
        ?Carbon $latestAt,
    ): string {
        return sha1(implode('|', [
            $scope,
            $scopeKey,
            (string) $page,
            (string) $perPage,
            (string) $recordCount,
            $latestAt?->format('U.u') ?? '0',
        ]));
    }

    private function applySyncHeaders(
        JsonResponse $response,
        string $etag,
        string $scope,
        string $scopeKey,
        int $recordCount,
        ?Carbon $latestAt,
        string $syncedAt,
    ): JsonResponse {
        $response->setEtag($etag);
        if ($latestAt) {
            $response->setLastModified($latestAt);
        }

        $response->headers->set('X-Sync-Scope', $scope);
        $response->headers->set('X-Sync-Scope-Key', $scopeKey);
        $response->headers->set('X-Sync-Record-Count', (string) $recordCount);
        $response->headers->set('X-Sync-Etag', $etag);
        $response->headers->set('X-Synced-At', $syncedAt);

        return $response;
    }

    private function buildNotModifiedResponse(
        string $etag,
        string $scope,
        string $scopeKey,
        int $recordCount,
        ?Carbon $latestAt,
    ): JsonResponse {
        $response = response()->json(null, Response::HTTP_NOT_MODIFIED);

        return $this->applySyncHeaders(
            $response,
            $etag,
            $scope,
            $scopeKey,
            $recordCount,
            $latestAt,
            now()->toISOString(),
        );
    }

    /**
     * Merge auto-calculated KPI indicator rows so these metrics no longer rely
     * on manual target/actual encoding.
     *
     * @param Collection<int, array<string, mixed>> $rawIndicatorRows
     * @return Collection<int, array<string, mixed>>
     */
    private function mergeAutoCalculatedRows(Collection $rawIndicatorRows, int $schoolId): Collection
    {
        $autoCalculator = app(TargetsMetAutoCalculator::class);
        $derivedByCode = $autoCalculator->deriveMatricesForSchool($schoolId);

        if ($derivedByCode === []) {
            return $rawIndicatorRows;
        }

        $autoMetricsById = PerformanceMetric::query()
            ->whereIn('code', array_keys($derivedByCode))
            ->where('is_active', true)
            ->get(['id', 'code'])
            ->keyBy(static fn (PerformanceMetric $metric): string => (string) $metric->id);

        if ($autoMetricsById->isEmpty()) {
            return $rawIndicatorRows;
        }

        return $rawIndicatorRows
            ->map(function (mixed $row) use ($autoMetricsById, $derivedByCode): mixed {
                if (! is_array($row)) {
                    return $row;
                }

                $metricId = (string) ((int) ($row['metric_id'] ?? 0));
                /** @var PerformanceMetric|null $metric */
                $metric = $autoMetricsById->get($metricId);
                if (! $metric) {
                    return $row;
                }

                /** @var array<string, mixed>|null $derived */
                $derived = $derivedByCode[(string) $metric->code] ?? null;
                if (! is_array($derived)) {
                    return $row;
                }

                return array_merge($row, [
                    'metric_id' => (int) $metric->id,
                    'target' => $derived['target'] ?? null,
                    'actual' => $derived['actual'] ?? null,
                    'remarks' => $row['remarks'] ?? ($derived['remarks'] ?? null),
                ]);
            })
            ->filter(static fn (mixed $row): bool => is_array($row))
            ->values();
    }
}
