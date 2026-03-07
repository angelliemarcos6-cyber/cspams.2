<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\UpsertSchoolRecordRequest;
use App\Http\Resources\SchoolRecordResource;
use App\Models\School;
use App\Models\Section;
use App\Models\Student;
use App\Models\User;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\Response;

class SchoolRecordController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $isSchoolHead = UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);
        $isMonitor = UserRoleResolver::has($user, UserRoleResolver::MONITOR);

        $scope = $isSchoolHead ? 'school' : 'division';
        $scopeKey = $scope === 'division' ? 'division:all' : 'school:unassigned';
        $baseQuery = School::query();

        if ($isSchoolHead) {
            if ($user->school_id) {
                $scopeKey = 'school:' . $user->school_id;
                $baseQuery->whereKey($user->school_id);
            } else {
                $baseQuery->whereRaw('1 = 0');
            }
        } elseif (! $isMonitor) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        $syncFingerprint = $this->buildSyncFingerprint(clone $baseQuery);
        $recordCount = $syncFingerprint['recordCount'];
        $latestAt = $syncFingerprint['latestAt'];
        $etag = $this->buildSyncEtag($scope, $scopeKey, $syncFingerprint);

        $incomingEtag = trim((string) $request->header('If-None-Match'));
        if ($incomingEtag !== '' && trim($incomingEtag, '"') === $etag) {
            return $this->buildNotModifiedResponse($etag, $scope, $scopeKey, $recordCount, $latestAt);
        }

        $records = (clone $baseQuery)
            ->with('submittedBy:id,name')
            ->withCount('students')
            ->orderByDesc('submitted_at')
            ->orderByDesc('updated_at')
            ->get();

        $targetsMet = $this->buildTargetsMetSummary(clone $baseQuery);
        $syncAlerts = $this->buildSyncAlerts($targetsMet);
        $syncedAt = now()->toISOString();

        $resource = SchoolRecordResource::collection($records)->additional([
            'meta' => [
                'syncedAt' => $syncedAt,
                'scope' => $scope,
                'scopeKey' => $scopeKey,
                'recordCount' => $records->count(),
                'targetsMet' => $targetsMet,
                'alerts' => $syncAlerts,
            ],
        ]);

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

    public function store(UpsertSchoolRecordRequest $request): JsonResponse
    {
        $user = $this->requireSchoolHead($request);
        if (! $user->school_id) {
            return response()->json(
                ['message' => 'Your account is not linked to any school.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        /** @var School|null $school */
        $school = School::query()->find($user->school_id);
        if (! $school) {
            return response()->json(
                ['message' => 'Assigned school record is missing.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $this->applyPayload($school, $request, $user);

        return $this->buildMutationResponse($school, $user);
    }

    public function update(UpsertSchoolRecordRequest $request, School $school): JsonResponse
    {
        $user = $this->requireSchoolHead($request);

        if ((int) $user->school_id !== (int) $school->id) {
            return response()->json(
                ['message' => 'You can only update your assigned school record.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $this->applyPayload($school, $request, $user);

        return $this->buildMutationResponse($school, $user);
    }

    private function requireSchoolHead(Request $request): User
    {
        $user = ApiUserResolver::fromRequest($request);
        abort_if(! $user, Response::HTTP_UNAUTHORIZED, 'Unauthenticated.');
        abort_if(
            ! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD),
            Response::HTTP_FORBIDDEN,
            'Only School Heads can modify school records.',
        );

        return $user;
    }

    private function applyPayload(School $school, UpsertSchoolRecordRequest $request, User $user): void
    {
        $school->fill([
            'status' => $request->string('status')->toString(),
            'reported_student_count' => $request->integer('studentCount'),
            'reported_teacher_count' => $request->integer('teacherCount'),
            'submitted_by' => $user->id,
            'submitted_at' => now(),
        ]);

        $isSchoolHead = UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);

        // School identity fields are division-managed. School Heads can submit
        // compliance counts/status, but cannot rewrite profile metadata.
        if (! $isSchoolHead) {
            if ($request->filled('schoolName')) {
                $school->name = $request->string('schoolName')->toString();
            }

            if ($request->filled('region')) {
                $school->region = $request->string('region')->toString();
            }

            if ($request->filled('district')) {
                $school->district = $request->string('district')->toString();
            }

            if ($request->filled('type')) {
                $school->type = $request->string('type')->toString();
            }
        }

        $school->save();
    }

    private function buildMutationResponse(School $school, User $user): JsonResponse
    {
        $syncMeta = $this->buildSyncMetadataForUser($user);
        $targetsMetBundle = $this->buildTargetsMetAndAlertsForUser($user);
        $syncedAt = now()->toISOString();

        $response = response()->json([
            'data' => (new SchoolRecordResource($school->load('submittedBy:id,name')))->resolve(),
            'meta' => [
                'syncedAt' => $syncedAt,
                'scope' => $syncMeta['scope'],
                'scopeKey' => $syncMeta['scopeKey'],
                'recordCount' => $syncMeta['recordCount'],
                'targetsMet' => $targetsMetBundle['targetsMet'],
                'alerts' => $targetsMetBundle['alerts'],
            ],
        ]);

        return $this->applySyncHeaders(
            $response,
            $syncMeta['etag'],
            $syncMeta['scope'],
            $syncMeta['scopeKey'],
            $syncMeta['recordCount'],
            $syncMeta['latestAt'],
            $syncedAt,
        );
    }

    /**
     * @return array{
     *     scope: string,
     *     scopeKey: string,
     *     recordCount: int,
     *     latestAt: ?Carbon,
     *     etag: string
     * }
     */
    private function buildSyncMetadataForUser(User $user): array
    {
        $isSchoolHead = UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);
        $isMonitor = UserRoleResolver::has($user, UserRoleResolver::MONITOR);

        $scope = $isSchoolHead ? 'school' : 'division';
        $scopeKey = $scope === 'division' ? 'division:all' : 'school:unassigned';
        $baseQuery = School::query();

        if ($isSchoolHead) {
            if ($user->school_id) {
                $scopeKey = 'school:' . $user->school_id;
                $baseQuery->whereKey($user->school_id);
            } else {
                $baseQuery->whereRaw('1 = 0');
            }
        } elseif (! $isMonitor) {
            abort(Response::HTTP_FORBIDDEN, 'Forbidden.');
        }

        $syncFingerprint = $this->buildSyncFingerprint(clone $baseQuery);
        $recordCount = $syncFingerprint['recordCount'];
        $latestAt = $syncFingerprint['latestAt'];
        $etag = $this->buildSyncEtag($scope, $scopeKey, $syncFingerprint);

        return [
            'scope' => $scope,
            'scopeKey' => $scopeKey,
            'recordCount' => $recordCount,
            'latestAt' => $latestAt,
            'etag' => $etag,
        ];
    }

    /**
     * @return array{
     *     targetsMet: array<string, int|float|null|string>,
     *     alerts: array<int, array<string, int|float|string|null>>
     * }
     */
    private function buildTargetsMetAndAlertsForUser(User $user): array
    {
        $isSchoolHead = UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);
        $isMonitor = UserRoleResolver::has($user, UserRoleResolver::MONITOR);
        $baseQuery = School::query();

        if ($isSchoolHead) {
            if ($user->school_id) {
                $baseQuery->whereKey($user->school_id);
            } else {
                $baseQuery->whereRaw('1 = 0');
            }
        } elseif (! $isMonitor) {
            abort(Response::HTTP_FORBIDDEN, 'Forbidden.');
        }

        $targetsMet = $this->buildTargetsMetSummary($baseQuery);

        return [
            'targetsMet' => $targetsMet,
            'alerts' => $this->buildSyncAlerts($targetsMet),
        ];
    }

    /**
     * @return array<string, int|float|null|string>
     */
    private function buildTargetsMetSummary(Builder $baseQuery): array
    {
        $schools = (clone $baseQuery)
            ->select(['id', 'status', 'reported_student_count', 'reported_teacher_count'])
            ->get();

        $schoolIds = $schools->pluck('id');
        $totalSchools = (int) $schools->count();
        $activeSchools = (int) $schools->where('status', 'active')->count();
        $pendingSchools = (int) $schools->where('status', 'pending')->count();
        $inactiveSchools = (int) $schools->where('status', 'inactive')->count();

        $reportedStudents = (int) $schools->sum('reported_student_count');
        $reportedTeachers = (int) $schools->sum('reported_teacher_count');

        $sectionCount = 0;
        $statusCounts = collect();

        if ($schoolIds->isNotEmpty()) {
            $sectionCount = (int) Section::query()
                ->whereIn('school_id', $schoolIds)
                ->count();

            $statusCounts = Student::query()
                ->selectRaw('status, COUNT(*) as aggregate_count')
                ->whereIn('school_id', $schoolIds)
                ->groupBy('status')
                ->pluck('aggregate_count', 'status')
                ->map(static fn ($value): int => (int) $value);
        }

        $trackedLearners = (int) $statusCounts->sum();
        $enrolledLearners = (int) ($statusCounts->get('enrolled', 0) + $statusCounts->get('returning', 0));
        $atRiskLearners = (int) $statusCounts->get('at_risk', 0);
        $dropoutLearners = (int) $statusCounts->get('dropped_out', 0);
        $completerLearners = (int) ($statusCounts->get('completer', 0) + $statusCounts->get('graduated', 0));
        $transfereeLearners = (int) $statusCounts->get('transferee', 0);
        $retainedLearners = max($trackedLearners - $dropoutLearners, 0);

        return [
            'generatedAt' => now()->toISOString(),
            'schoolsMonitored' => $totalSchools,
            'activeSchools' => $activeSchools,
            'pendingSchools' => $pendingSchools,
            'inactiveSchools' => $inactiveSchools,
            'reportedStudents' => $reportedStudents,
            'reportedTeachers' => $reportedTeachers,
            'trackedLearners' => $trackedLearners,
            'enrolledLearners' => $enrolledLearners,
            'atRiskLearners' => $atRiskLearners,
            'dropoutLearners' => $dropoutLearners,
            'completerLearners' => $completerLearners,
            'transfereeLearners' => $transfereeLearners,
            'studentTeacherRatio' => $reportedTeachers > 0 ? round($reportedStudents / $reportedTeachers, 2) : null,
            'studentClassroomRatio' => $sectionCount > 0 ? round($reportedStudents / $sectionCount, 2) : null,
            'enrollmentRatePercent' => $this->calculatePercentage($enrolledLearners, $trackedLearners),
            'retentionRatePercent' => $this->calculatePercentage($retainedLearners, $trackedLearners),
            'dropoutRatePercent' => $this->calculatePercentage($dropoutLearners, $trackedLearners),
            'completionRatePercent' => $this->calculatePercentage($completerLearners, $trackedLearners),
            'atRiskRatePercent' => $this->calculatePercentage($atRiskLearners, $trackedLearners),
            'transitionRatePercent' => $this->calculatePercentage($transfereeLearners + $completerLearners, $trackedLearners),
        ];
    }

    /**
     * @param array<string, int|float|null|string> $targetsMet
     *
     * @return array<int, array<string, int|float|string|null>>
     */
    private function buildSyncAlerts(array $targetsMet): array
    {
        $alerts = [];

        $dropoutRate = (float) ($targetsMet['dropoutRatePercent'] ?? 0);
        if ($dropoutRate >= 4.0) {
            $alerts[] = [
                'id' => 'dropout-rate',
                'level' => $dropoutRate >= 8.0 ? 'critical' : 'warning',
                'title' => 'Dropout rate exceeds TARGETS-MET watch threshold',
                'message' => "Current dropout rate is {$dropoutRate}%. Initiate technical assistance for affected schools.",
                'metric' => 'dropoutRatePercent',
                'value' => $dropoutRate,
                'threshold' => 4.0,
            ];
        }

        $atRiskRate = (float) ($targetsMet['atRiskRatePercent'] ?? 0);
        $atRiskLearners = (int) ($targetsMet['atRiskLearners'] ?? 0);
        if ($atRiskLearners > 0) {
            $alerts[] = [
                'id' => 'at-risk-learners',
                'level' => $atRiskRate >= 10.0 ? 'warning' : 'info',
                'title' => 'At-risk learners detected',
                'message' => "{$atRiskLearners} learner(s) are tagged at risk. Prioritize intervention planning.",
                'metric' => 'atRiskLearners',
                'value' => $atRiskLearners,
                'threshold' => 1,
            ];
        }

        $studentTeacherRatio = (float) ($targetsMet['studentTeacherRatio'] ?? 0);
        if ($studentTeacherRatio > 45) {
            $alerts[] = [
                'id' => 'student-teacher-ratio',
                'level' => 'warning',
                'title' => 'Student-teacher ratio is above recommended range',
                'message' => "Current ratio is {$studentTeacherRatio}:1. Review staffing and load balancing.",
                'metric' => 'studentTeacherRatio',
                'value' => $studentTeacherRatio,
                'threshold' => 45,
            ];
        }

        $pendingSchools = (int) ($targetsMet['pendingSchools'] ?? 0);
        if ($pendingSchools > 0) {
            $alerts[] = [
                'id' => 'pending-school-records',
                'level' => 'info',
                'title' => 'Pending school submissions',
                'message' => "{$pendingSchools} school(s) are still marked pending. Follow up for compliance.",
                'metric' => 'pendingSchools',
                'value' => $pendingSchools,
                'threshold' => 0,
            ];
        }

        if ($alerts === []) {
            $alerts[] = [
                'id' => 'no-critical-alerts',
                'level' => 'success',
                'title' => 'No critical TARGETS-MET alerts',
                'message' => 'Current synchronized indicators are within watch thresholds.',
                'metric' => null,
                'value' => null,
                'threshold' => null,
            ];
        }

        return $alerts;
    }

    private function calculatePercentage(int $numerator, int $denominator): float
    {
        if ($denominator <= 0) {
            return 0.0;
        }

        return round(($numerator / $denominator) * 100, 2);
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

    private function buildNotModifiedResponse(string $etag, string $scope, string $scopeKey, int $recordCount, ?Carbon $latestAt): JsonResponse
    {
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
     * @return array{
     *     recordCount: int,
     *     sectionCount: int,
     *     studentCount: int,
     *     latestAt: ?Carbon
     * }
     */
    private function buildSyncFingerprint(Builder $baseQuery): array
    {
        $schoolProbe = (clone $baseQuery)
            ->selectRaw('COUNT(*) as aggregate_count')
            ->selectRaw('MAX(updated_at) as latest_updated_at')
            ->selectRaw('MAX(submitted_at) as latest_submitted_at')
            ->first();

        $recordCount = (int) ($schoolProbe?->aggregate_count ?? 0);
        $schoolIds = (clone $baseQuery)->pluck('id');

        $sectionCount = 0;
        $studentCount = 0;
        $latestSectionUpdatedAt = null;
        $latestStudentUpdatedAt = null;
        $latestStudentStatusAt = null;

        if ($schoolIds->isNotEmpty()) {
            $sectionProbe = Section::query()
                ->whereIn('school_id', $schoolIds)
                ->selectRaw('COUNT(*) as aggregate_count')
                ->selectRaw('MAX(updated_at) as latest_updated_at')
                ->first();

            $sectionCount = (int) ($sectionProbe?->aggregate_count ?? 0);
            $latestSectionUpdatedAt = $sectionProbe?->latest_updated_at;

            $studentProbe = Student::query()
                ->whereIn('school_id', $schoolIds)
                ->selectRaw('COUNT(*) as aggregate_count')
                ->selectRaw('MAX(updated_at) as latest_updated_at')
                ->selectRaw('MAX(last_status_at) as latest_status_changed_at')
                ->first();

            $studentCount = (int) ($studentProbe?->aggregate_count ?? 0);
            $latestStudentUpdatedAt = $studentProbe?->latest_updated_at;
            $latestStudentStatusAt = $studentProbe?->latest_status_changed_at;
        }

        $latestAt = $this->resolveLatestTimestamp(
            $schoolProbe?->latest_updated_at,
            $schoolProbe?->latest_submitted_at,
            $latestSectionUpdatedAt,
            $latestStudentUpdatedAt,
            $latestStudentStatusAt,
        );

        return [
            'recordCount' => $recordCount,
            'sectionCount' => $sectionCount,
            'studentCount' => $studentCount,
            'latestAt' => $latestAt,
        ];
    }

    /**
     * @param array{
     *     recordCount: int,
     *     sectionCount: int,
     *     studentCount: int,
     *     latestAt: ?Carbon
     * } $syncFingerprint
     */
    private function buildSyncEtag(string $scope, string $scopeKey, array $syncFingerprint): string
    {
        return sha1(implode('|', [
            $scope,
            $scopeKey,
            (string) $syncFingerprint['recordCount'],
            (string) $syncFingerprint['sectionCount'],
            (string) $syncFingerprint['studentCount'],
            $syncFingerprint['latestAt']?->format('U.u') ?? '0',
        ]));
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
}
