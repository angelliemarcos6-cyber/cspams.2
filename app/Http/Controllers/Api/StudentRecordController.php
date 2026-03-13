<?php

namespace App\Http\Controllers\Api;

use App\Events\CspamsUpdateBroadcast;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\UpsertStudentRecordRequest;
use App\Http\Resources\StudentRecordResource;
use App\Models\AcademicYear;
use App\Models\Student;
use App\Models\StudentStatusLog;
use App\Models\User;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;
use App\Support\Indicators\RollingIndicatorYearWindow;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Symfony\Component\HttpFoundation\Response;

class StudentRecordController extends Controller
{
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

        $this->syncRollingAcademicYears();
        [$academicYearFilterMode, $academicYearFilterId] = $this->resolveAcademicYearFilter($request);
        $academicYearScope = $academicYearFilterMode === 'all'
            ? 'academic-year:all'
            : 'academic-year:' . ($academicYearFilterId ?? 'none');

        $scope = $isSchoolHead ? 'school' : 'division';
        $scopeKey = $isSchoolHead
            ? ($user->school_id ? 'school:' . $user->school_id : 'school:unassigned')
            : 'division:all';
        $scopeKey .= '|' . $academicYearScope;

        $query = Student::query()
            ->with(['school:id,school_code,name', 'section:id,name', 'academicYear:id,name,is_current'])
            ->orderByDesc('updated_at')
            ->orderByDesc('id');

        if ($isSchoolHead) {
            if (! $user->school_id) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where('school_id', $user->school_id);
            }
        }

        if ($academicYearFilterMode !== 'all') {
            if ($academicYearFilterId) {
                $query->where('academic_year_id', $academicYearFilterId);
            } else {
                $query->whereRaw('1 = 0');
            }
        }

        $status = trim((string) $request->query('status', ''));
        if ($status !== '' && StudentStatus::tryFrom($status)) {
            $query->where('status', $status);
        }

        $schoolCode = trim((string) $request->query('schoolCode', ''));
        if ($schoolCode !== '' && $isMonitor) {
            $query->whereHas('school', function (Builder $builder) use ($schoolCode): void {
                $builder->where('school_code_normalized', strtolower($schoolCode));
            });
        }

        $schoolCodes = $this->parseSchoolCodes($request);
        if ($schoolCodes->isNotEmpty() && $isMonitor) {
            $query->whereHas('school', function (Builder $builder) use ($schoolCodes): void {
                $builder->whereIn('school_code_normalized', $schoolCodes->all());
            });
        }

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function (Builder $builder) use ($search): void {
                $like = '%' . $search . '%';
                $builder
                    ->where('lrn', 'like', $like)
                    ->orWhere('first_name', 'like', $like)
                    ->orWhere('middle_name', 'like', $like)
                    ->orWhere('last_name', 'like', $like)
                    ->orWhere('current_level', 'like', $like)
                    ->orWhere('section_name', 'like', $like)
                    ->orWhere('teacher_name', 'like', $like)
                    ->orWhereHas('school', function (Builder $schoolQuery) use ($like): void {
                        $schoolQuery
                            ->where('school_code', 'like', $like)
                            ->orWhere('name', 'like', $like);
                    });
            });
        }

        $perPage = $this->resolvePerPage($request);
        $page = max(1, $request->integer('page', 1));
        $syncFingerprint = $this->buildSyncFingerprint(clone $query);
        $etag = $this->buildSyncEtag(
            $scope,
            $scopeKey,
            $page,
            $perPage,
            $syncFingerprint['recordCount'],
            $syncFingerprint['latestAt'],
        );

        $incomingEtag = trim((string) $request->header('If-None-Match'));
        if ($incomingEtag !== '' && trim($incomingEtag, '"') === $etag) {
            return $this->buildNotModifiedResponse(
                $etag,
                $scope,
                $scopeKey,
                $syncFingerprint['recordCount'],
                $syncFingerprint['latestAt'],
            );
        }

        $students = $query->paginate($perPage)->appends($request->query());
        $studentRows = collect($students->items());
        $syncedAt = now()->toISOString();
        $activeAcademicYear = $academicYearFilterMode === 'all' || ! $academicYearFilterId
            ? null
            : AcademicYear::query()
                ->select(['id', 'name', 'is_current'])
                ->find($academicYearFilterId);

        $response = response()->json([
            'data' => StudentRecordResource::collection($studentRows)->resolve(),
            'meta' => [
                'syncedAt' => $syncedAt,
                'scope' => $scope,
                'scopeKey' => $scopeKey,
                'academicYearFilter' => $academicYearFilterMode,
                'academicYear' => $activeAcademicYear
                    ? [
                        'id' => (string) $activeAcademicYear->id,
                        'name' => $activeAcademicYear->name,
                        'isCurrent' => (bool) $activeAcademicYear->is_current,
                    ]
                    : null,
                'recordCount' => $students->total(),
                'currentPage' => $students->currentPage(),
                'lastPage' => $students->lastPage(),
                'perPage' => $students->perPage(),
                'total' => $students->total(),
                'from' => $students->firstItem(),
                'to' => $students->lastItem(),
                'hasMorePages' => $students->hasMorePages(),
            ],
        ]);

        return $this->applySyncHeaders(
            $response,
            $etag,
            $scope,
            $scopeKey,
            $syncFingerprint['recordCount'],
            $syncFingerprint['latestAt'],
            $syncedAt,
        );
    }

    public function store(UpsertStudentRecordRequest $request): JsonResponse
    {
        $user = $this->requireSchoolHead($request);
        if (! $user->school_id) {
            return response()->json(
                ['message' => 'Your account is not linked to any school.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $this->syncRollingAcademicYears();
        $academicYearId = $this->resolveAcademicYearId();
        if (! $academicYearId) {
            return response()->json(
                ['message' => 'No academic year is configured. Please create one first.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $student = new Student();
        $student->school_id = $user->school_id;
        $student->academic_year_id = $academicYearId;

        $this->applyPayload($student, $request, $user);

        event(new CspamsUpdateBroadcast([
            'entity' => 'students',
            'eventType' => 'students.created',
            'studentId' => (string) $student->id,
            'schoolId' => (string) $student->school_id,
            'status' => $student->status instanceof StudentStatus ? $student->status->value : (string) $student->status,
        ]));

        return response()->json([
            'data' => (new StudentRecordResource($student->load(['school:id,school_code,name', 'section:id,name', 'academicYear:id,name,is_current'])))->resolve(),
            'meta' => [
                'syncedAt' => now()->toISOString(),
            ],
        ], Response::HTTP_CREATED);
    }

    public function update(UpsertStudentRecordRequest $request, Student $student): JsonResponse
    {
        $user = $this->requireSchoolHead($request);

        if ((int) $user->school_id !== (int) $student->school_id) {
            return response()->json(
                ['message' => 'You can only update student records assigned to your school.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $this->applyPayload($student, $request, $user);

        event(new CspamsUpdateBroadcast([
            'entity' => 'students',
            'eventType' => 'students.updated',
            'studentId' => (string) $student->id,
            'schoolId' => (string) $student->school_id,
            'status' => $student->status instanceof StudentStatus ? $student->status->value : (string) $student->status,
        ]));

        return response()->json([
            'data' => (new StudentRecordResource($student->load(['school:id,school_code,name', 'section:id,name', 'academicYear:id,name,is_current'])))->resolve(),
            'meta' => [
                'syncedAt' => now()->toISOString(),
            ],
        ]);
    }

    public function destroy(Request $request, Student $student): JsonResponse
    {
        $user = $this->requireSchoolHead($request);

        if ((int) $user->school_id !== (int) $student->school_id) {
            return response()->json(
                ['message' => 'You can only delete student records assigned to your school.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $student->delete();

        event(new CspamsUpdateBroadcast([
            'entity' => 'students',
            'eventType' => 'students.deleted',
            'studentId' => (string) $student->id,
            'schoolId' => (string) $student->school_id,
        ]));

        return response()->json([
            'data' => [
                'id' => (string) $student->id,
            ],
            'meta' => [
                'syncedAt' => now()->toISOString(),
            ],
        ]);
    }

    private function requireSchoolHead(Request $request): User
    {
        $user = ApiUserResolver::fromRequest($request);
        abort_if(! $user, Response::HTTP_UNAUTHORIZED, 'Unauthenticated.');
        abort_if(
            ! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD),
            Response::HTTP_FORBIDDEN,
            'Only School Heads can modify student records.',
        );

        return $user;
    }

    private function syncRollingAcademicYears(): void
    {
        app(RollingIndicatorYearWindow::class)->sync();
    }

    /**
     * @return array{0: 'all'|'current'|'specific', 1: ?int}
     */
    private function resolveAcademicYearFilter(Request $request): array
    {
        $rawFilter = trim((string) $request->query('academicYear', $request->query('academicYearId', '')));
        if ($rawFilter === '') {
            return ['current', $this->resolveAcademicYearId()];
        }

        $normalizedFilter = strtolower($rawFilter);
        if (in_array($normalizedFilter, ['all', 'all_records', 'all-records'], true)) {
            return ['all', null];
        }

        if (in_array($normalizedFilter, ['current', 'latest'], true)) {
            return ['current', $this->resolveAcademicYearId()];
        }

        if (ctype_digit($normalizedFilter)) {
            $academicYearId = (int) $normalizedFilter;
            if ($academicYearId > 0) {
                return ['specific', $academicYearId];
            }
        }

        return ['current', $this->resolveAcademicYearId()];
    }

    private function resolveAcademicYearId(): ?int
    {
        $current = AcademicYear::query()
            ->where('is_current', true)
            ->orderByDesc('id')
            ->value('id');

        if ($current) {
            return (int) $current;
        }

        $fallback = AcademicYear::query()
            ->orderByDesc('id')
            ->value('id');

        return $fallback ? (int) $fallback : null;
    }

    private function applyPayload(Student $student, UpsertStudentRecordRequest $request, User $user): void
    {
        $previousStatus = $student->status instanceof StudentStatus
            ? $student->status->value
            : ($student->status ? (string) $student->status : null);
        $nextStatus = $request->string('status')->toString();
        $statusChanged = $previousStatus !== $nextStatus;

        $riskLevelValue = $request->filled('riskLevel')
            ? $request->string('riskLevel')->toString()
            : ($student->risk_level instanceof StudentRiskLevel
                ? $student->risk_level->value
                : (is_string($student->risk_level) && $student->risk_level !== ''
                    ? $student->risk_level
                    : StudentRiskLevel::LOW->value));

        $sectionName = $request->input('section', $student->section_name);
        $currentLevel = $request->input('currentLevel', $student->current_level);
        if (! $currentLevel && is_string($sectionName) && trim($sectionName) !== '') {
            $currentLevel = $sectionName;
        }

        $student->fill([
            'lrn' => trim($request->string('lrn')->toString()),
            'first_name' => trim($request->string('firstName')->toString()),
            'middle_name' => $request->input('middleName', $student->middle_name),
            'last_name' => trim($request->string('lastName')->toString()),
            'sex' => $request->input('sex', $student->sex),
            'birth_date' => $request->input('birthDate', $student->birth_date),
            'status' => $nextStatus,
            'risk_level' => $riskLevelValue,
            'tracked_from_level' => $request->input('trackedFromLevel', $student->tracked_from_level ?? 'Kindergarten'),
            'current_level' => $currentLevel,
            'section_name' => $sectionName,
            'teacher_name' => $request->input('teacher', $student->teacher_name),
        ]);

        if ($statusChanged || ! $student->last_status_at) {
            $student->last_status_at = now();
        }

        $student->save();

        if ($statusChanged || $student->wasRecentlyCreated) {
            StudentStatusLog::query()->create([
                'student_id' => $student->id,
                'from_status' => $previousStatus,
                'to_status' => $nextStatus,
                'changed_by' => $user->id,
                'notes' => $student->wasRecentlyCreated
                    ? 'Student record created by school head.'
                    : 'Student status or profile updated by school head.',
                'changed_at' => now(),
            ]);
        }
    }

    private function resolvePerPage(Request $request, int $default = 25, int $max = 200): int
    {
        $perPage = $request->integer('per_page');

        if ($perPage <= 0) {
            return $default;
        }

        return min($perPage, $max);
    }

    /**
     * @return Collection<int, string>
     */
    private function parseSchoolCodes(Request $request): Collection
    {
        $rawSchoolCodes = trim((string) $request->query('schoolCodes', ''));
        if ($rawSchoolCodes === '') {
            return collect();
        }

        return collect(explode(',', $rawSchoolCodes))
            ->map(static fn (string $value): string => strtolower(trim($value)))
            ->filter(static fn (string $value): bool => $value !== '')
            ->values();
    }

    /**
     * @return array{recordCount: int, latestAt: ?Carbon}
     */
    private function buildSyncFingerprint(Builder $query): array
    {
        $probe = $query
            ->reorder()
            ->selectRaw('COUNT(*) as aggregate_count')
            ->selectRaw('MAX(updated_at) as latest_updated_at')
            ->selectRaw('MAX(last_status_at) as latest_status_changed_at')
            ->first();

        $latestAt = $this->resolveLatestTimestamp(
            $probe?->latest_updated_at,
            $probe?->latest_status_changed_at,
        );

        return [
            'recordCount' => (int) ($probe?->aggregate_count ?? 0),
            'latestAt' => $latestAt,
        ];
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
}
