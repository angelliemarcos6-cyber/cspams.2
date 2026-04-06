<?php

namespace App\Http\Controllers\Api;

use App\Events\CspamsUpdateBroadcast;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\UpsertStudentRecordRequest;
use App\Http\Resources\StudentRecordResource;
use App\Http\Resources\StudentStatusHistoryResource;
use App\Models\AcademicYear;
use App\Models\School;
use App\Models\Student;
use App\Models\StudentStatusLog;
use App\Models\User;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use App\Support\Database\BuildsEscapedLikePatterns;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;
use App\Support\Indicators\RollingIndicatorYearWindow;
use Carbon\Carbon;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class StudentRecordController extends Controller
{
    use BuildsEscapedLikePatterns;

    private const ROLLING_YEAR_SYNC_CACHE_KEY = 'cspams.students.rolling_year_window.last_sync';
    private const ROLLING_YEAR_SYNC_TTL_MINUTES = 30;
    private const ROLLING_YEAR_SYNC_LOCK_KEY = 'cspams.students.rolling_year_window.sync_lock';
    private const ROLLING_YEAR_SYNC_LOCK_TTL_SECONDS = 25;

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
            ->select([
                'id',
                'school_id',
                'section_id',
                'academic_year_id',
                'lrn',
                'first_name',
                'middle_name',
                'last_name',
                'sex',
                'birth_date',
                'status',
                'risk_level',
                'tracked_from_level',
                'current_level',
                'section_name',
                'teacher_name',
                'last_status_at',
                'created_at',
                'updated_at',
            ])
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

        $teacherName = trim((string) $request->query('teacherName', ''));
        if ($teacherName !== '') {
            $query->whereRaw('LOWER(TRIM(teacher_name)) = ?', [strtolower($teacherName)]);
        }

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function (Builder $builder) use ($search, $isMonitor): void {
                $this->whereLikeContains($builder, 'lrn', $search);
                $this->whereLikeContains($builder, 'first_name', $search, 'or');
                $this->whereLikeContains($builder, 'middle_name', $search, 'or');
                $this->whereLikeContains($builder, 'last_name', $search, 'or');
                $this->whereLikeContains($builder, 'current_level', $search, 'or');
                $this->whereLikeContains($builder, 'section_name', $search, 'or');
                $this->whereLikeContains($builder, 'teacher_name', $search, 'or');

                if ($isMonitor) {
                    $builder->orWhereHas('school', function (Builder $schoolQuery) use ($search): void {
                        $this->whereLikeContains($schoolQuery, 'school_code', $search);
                        $this->whereLikeContains($schoolQuery, 'name', $search, 'or');
                    });
                }
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

        if (($errorResponse = $this->persistStudentWithArchivedLrnRecovery($student, $request, $user)) instanceof JsonResponse) {
            return $errorResponse;
        }

        $this->incrementSchoolStudentCount((int) $student->school_id);

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
                'schoolId' => (string) $student->school_id,
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

        if (($errorResponse = $this->persistStudentWithArchivedLrnRecovery($student, $request, $user)) instanceof JsonResponse) {
            return $errorResponse;
        }

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
                'schoolId' => (string) $student->school_id,
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

        $studentId = (int) $student->id;
        $schoolId = (int) $student->school_id;

        try {
            $deletedCount = DB::transaction(function () use ($studentId, $schoolId): int {
                $studentToDelete = Student::query()
                    ->whereKey($studentId)
                    ->where('school_id', $schoolId)
                    ->lockForUpdate()
                    ->first();

                if (! $studentToDelete) {
                    return 0;
                }

                $this->prepareStudentsForArchive(collect([$studentToDelete]));

                return Student::query()
                    ->whereKey($studentId)
                    ->where('school_id', $schoolId)
                    ->delete();

            });
        } catch (QueryException $exception) {
            report($exception);

            return response()->json(
                ['message' => 'Unable to delete student record right now. Please try again.'],
                Response::HTTP_CONFLICT,
            );
        }

        if ($deletedCount <= 0) {
            return response()->json(
                ['message' => 'Student record was already removed.'],
                Response::HTTP_NOT_FOUND,
            );
        }

        $this->decrementSchoolStudentCount($schoolId, $deletedCount);

        event(new CspamsUpdateBroadcast([
            'entity' => 'students',
            'eventType' => 'students.deleted',
            'studentId' => (string) $student->id,
            'schoolId' => (string) $schoolId,
            'deletedCount' => $deletedCount,
        ]));

        return response()->json([
            'data' => [
                'id' => (string) $student->id,
                'schoolId' => (string) $schoolId,
                'deleted' => true,
                'deletedCount' => $deletedCount,
            ],
            'meta' => [
                'syncedAt' => now()->toISOString(),
                'schoolId' => (string) $schoolId,
                'deletedCount' => $deletedCount,
            ],
        ]);
    }

    public function history(Request $request, Student $student): JsonResponse
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

        if ($isSchoolHead && (int) $user->school_id !== (int) $student->school_id) {
            return response()->json(
                ['message' => 'You can only view student history assigned to your school.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $scope = $isSchoolHead ? 'school' : 'division';
        $scopeKey = $isSchoolHead
            ? ($user->school_id ? 'school:' . $user->school_id : 'school:unassigned')
            : 'division:all';
        $scopeKey .= '|student:' . $student->id;

        $perPage = $this->resolvePerPage($request, 12, 50);
        $page = max(1, $request->integer('page', 1));

        $historyQuery = StudentStatusLog::query()
            ->select([
                'id',
                'student_id',
                'from_status',
                'to_status',
                'changed_by',
                'notes',
                'changed_at',
            ])
            ->where('student_id', $student->id)
            ->orderByDesc('changed_at')
            ->orderByDesc('id');

        $historyProbe = (clone $historyQuery)
            ->reorder()
            ->selectRaw('COUNT(*) as aggregate_count')
            ->selectRaw('MAX(changed_at) as latest_changed_at')
            ->first();
        $recordCount = (int) ($historyProbe?->aggregate_count ?? 0);
        $latestAt = $this->resolveLatestTimestamp($historyProbe?->latest_changed_at);
        $etag = $this->buildSyncEtag($scope, $scopeKey, $page, $perPage, $recordCount, $latestAt);

        $incomingEtag = trim((string) $request->header('If-None-Match'));
        if ($incomingEtag !== '' && trim($incomingEtag, '"') === $etag) {
            return $this->buildNotModifiedResponse(
                $etag,
                $scope,
                $scopeKey,
                $recordCount,
                $latestAt,
            );
        }

        $history = $historyQuery
            ->with(['user:id,name,email'])
            ->paginate($perPage)
            ->appends($request->query());
        $historyRows = collect($history->items());
        $syncedAt = now()->toISOString();

        $response = response()->json([
            'data' => StudentStatusHistoryResource::collection($historyRows)->resolve(),
            'meta' => [
                'syncedAt' => $syncedAt,
                'scope' => $scope,
                'scopeKey' => $scopeKey,
                'studentId' => (string) $student->id,
                'studentLrn' => (string) $student->lrn,
                'recordCount' => $history->total(),
                'currentPage' => $history->currentPage(),
                'lastPage' => $history->lastPage(),
                'perPage' => $history->perPage(),
                'total' => $history->total(),
                'from' => $history->firstItem(),
                'to' => $history->lastItem(),
                'hasMorePages' => $history->hasMorePages(),
            ],
        ]);

        return $this->applySyncHeaders(
            $response,
            $etag,
            $scope,
            $scopeKey,
            $recordCount,
            $latestAt,
            $syncedAt,
        );
    }

    public function batchDestroy(Request $request): JsonResponse
    {
        $user = $this->requireSchoolHead($request);

        $rawIds = $request->input('ids', []);
        if (! is_array($rawIds)) {
            return response()->json(
                ['message' => 'Invalid batch delete payload.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $requestedIds = collect($rawIds)
            ->map(static function (mixed $value): int {
                if (is_int($value)) {
                    return $value;
                }

                if (is_string($value) && ctype_digit(trim($value))) {
                    return (int) trim($value);
                }

                return 0;
            })
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->values();

        if ($requestedIds->isEmpty()) {
            return response()->json(
                ['message' => 'Select at least one student record to delete.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $unauthorizedAccess = Student::query()
            ->whereIn('id', $requestedIds->all())
            ->where('school_id', '!=', $user->school_id)
            ->exists();
        if ($unauthorizedAccess) {
            return response()->json(
                ['message' => 'You can only delete student records assigned to your school.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        try {
            $deletableIds = DB::transaction(function () use ($requestedIds, $user): Collection {
                $students = Student::query()
                    ->where('school_id', $user->school_id)
                    ->whereIn('id', $requestedIds->all())
                    ->lockForUpdate()
                    ->get();

                if ($students->isEmpty()) {
                    return collect();
                }

                $this->prepareStudentsForArchive($students);
                Student::query()
                    ->whereIn('id', $students->pluck('id')->all())
                    ->delete();

                return $students
                    ->pluck('id')
                    ->map(static fn (mixed $id): int => (int) $id)
                    ->filter(static fn (int $id): bool => $id > 0)
                    ->values();
            });
        } catch (QueryException $exception) {
            report($exception);

            return response()->json(
                ['message' => 'Unable to delete selected student records right now. Please try again.'],
                Response::HTTP_CONFLICT,
            );
        }

        if ($deletableIds->isNotEmpty()) {
            $this->decrementSchoolStudentCount((int) $user->school_id, $deletableIds->count());

            event(new CspamsUpdateBroadcast([
                'entity' => 'students',
                'eventType' => 'students.batch_deleted',
                'schoolId' => (string) $user->school_id,
                'deletedCount' => $deletableIds->count(),
            ]));
        }

        $missingIds = $requestedIds
            ->diff($deletableIds)
            ->map(static fn (int $id): string => (string) $id)
            ->values();

        return response()->json([
            'data' => [
                'deletedIds' => $deletableIds->map(static fn (int $id): string => (string) $id)->values(),
                'missingIds' => $missingIds,
                'requestedCount' => $requestedIds->count(),
            ],
            'meta' => [
                'syncedAt' => now()->toISOString(),
                'schoolId' => (string) $user->school_id,
                'deletedCount' => $deletableIds->count(),
                'missingCount' => $missingIds->count(),
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
        abort_if(
            ! $user->school_id,
            Response::HTTP_UNPROCESSABLE_ENTITY,
            'Your account is not linked to any school.',
        );

        return $user;
    }

    private function releaseArchivedStudentLrn(string $lrn, int $schoolId): int
    {
        if ($lrn === '' || $schoolId <= 0) {
            return 0;
        }

        $archivedStudents = Student::withTrashed()
            ->where('lrn', $lrn)
            ->where('school_id', $schoolId)
            ->whereNotNull('deleted_at')
            ->lockForUpdate()
            ->get();

        $this->prepareStudentsForArchive($archivedStudents);

        return $archivedStudents->count();
    }

    private function persistStudentWithArchivedLrnRecovery(
        Student $student,
        UpsertStudentRecordRequest $request,
        User $user,
    ): ?JsonResponse {
        $lrn = trim($request->string('lrn')->toString());
        $schoolId = (int) $student->school_id;

        try {
            $this->applyPayload($student, $request, $user);

            return null;
        } catch (QueryException $exception) {
            if (! $this->isSchoolScopedLrnConstraintViolation($exception)) {
                throw $exception;
            }

            return DB::transaction(function () use ($lrn, $schoolId, $student, $request, $user): ?JsonResponse {
                // Legacy soft-deleted rows can still hold the unique LRN. Release the LRN without deleting history.
                $releasedArchivedRows = $this->releaseArchivedStudentLrn($lrn, $schoolId);
                if ($releasedArchivedRows > 0) {
                    try {
                        $this->applyPayload($student, $request, $user);

                        return null;
                    } catch (QueryException $retryException) {
                        if (! $this->isSchoolScopedLrnConstraintViolation($retryException)) {
                            throw $retryException;
                        }
                    }
                }

                return $this->buildLrnConflictResponse();
            });
        }
    }

    private function syncSchoolStudentCount(int $schoolId): void
    {
        if ($schoolId <= 0) {
            return;
        }

        $studentCount = Student::query()
            ->where('school_id', $schoolId)
            ->count();

        School::query()
            ->whereKey($schoolId)
            ->update(['reported_student_count' => $studentCount]);
    }

    private function incrementSchoolStudentCount(int $schoolId, int $incrementBy = 1): void
    {
        if ($schoolId <= 0 || $incrementBy <= 0) {
            return;
        }

        School::query()
            ->whereKey($schoolId)
            ->increment('reported_student_count', $incrementBy);
    }

    private function decrementSchoolStudentCount(int $schoolId, int $decrementBy = 1): void
    {
        if ($schoolId <= 0 || $decrementBy <= 0) {
            return;
        }

        $affected = School::query()
            ->whereKey($schoolId)
            ->where('reported_student_count', '>=', $decrementBy)
            ->decrement('reported_student_count', $decrementBy);

        if ($affected === 0) {
            $this->syncSchoolStudentCount($schoolId);
        }
    }

    private function syncRollingAcademicYears(): void
    {
        if ($this->hasFreshRollingAcademicYearSyncMarker()) {
            return;
        }

        $cacheStore = Cache::getStore();
        if (! ($cacheStore instanceof LockProvider)) {
            $this->runRollingAcademicYearSync();

            return;
        }

        $lock = Cache::lock(self::ROLLING_YEAR_SYNC_LOCK_KEY, self::ROLLING_YEAR_SYNC_LOCK_TTL_SECONDS);
        if (! $lock->get()) {
            return;
        }

        try {
            // Re-check once we own the lock in case another request already synced.
            if ($this->hasFreshRollingAcademicYearSyncMarker()) {
                return;
            }

            $this->runRollingAcademicYearSync();
        } finally {
            $lock->release();
        }
    }

    private function hasFreshRollingAcademicYearSyncMarker(): bool
    {
        $lastSyncedAt = Cache::get(self::ROLLING_YEAR_SYNC_CACHE_KEY);
        if (! is_string($lastSyncedAt)) {
            return false;
        }

        try {
            return Carbon::parse($lastSyncedAt)
                ->greaterThan(now()->subMinutes(self::ROLLING_YEAR_SYNC_TTL_MINUTES));
        } catch (\Throwable) {
            // Invalid cache payload. Treat as stale and run sync.
            return false;
        }
    }

    private function runRollingAcademicYearSync(): void
    {
        app(RollingIndicatorYearWindow::class)->sync();
        Cache::put(
            self::ROLLING_YEAR_SYNC_CACHE_KEY,
            now()->toISOString(),
            now()->addMinutes(self::ROLLING_YEAR_SYNC_TTL_MINUTES),
        );
    }

    private function isSchoolScopedLrnConstraintViolation(QueryException $exception): bool
    {
        $sqlState = (string) ($exception->errorInfo[0] ?? '');
        if ($sqlState !== '23000' && $sqlState !== '23505') {
            return false;
        }

        $message = strtolower($exception->getMessage());

        return str_contains($message, 'students_school_lrn_unique')
            || str_contains($message, 'students.school_id, students.lrn')
            || str_contains($message, 'students.school_id,students.lrn')
            || str_contains($message, 'for key \'students_school_lrn_unique\'');
    }

    private function buildLrnConflictResponse(): JsonResponse
    {
        return response()->json([
            'message' => 'LRN already exists in this school\'s student records.',
            'errors' => [
                'lrn' => ['LRN already exists in this school\'s student records.'],
            ],
        ], Response::HTTP_UNPROCESSABLE_ENTITY);
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

        DB::transaction(function () use ($student, $statusChanged, $previousStatus, $nextStatus, $user): void {
            $student->save();

            if (! $statusChanged && ! $student->wasRecentlyCreated) {
                return;
            }

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
        });
    }

    private function resolvePerPage(Request $request, int $default = 25, int $max = 200): int
    {
        $perPage = $request->integer('per_page');

        if ($perPage <= 0) {
            return $default;
        }

        return min($perPage, $max);
    }

    private function prepareStudentForArchive(Student $student): void
    {
        $this->prepareStudentsForArchive(collect([$student]));
    }

    /**
     * @param Collection<int, Student> $students
     */
    private function prepareStudentsForArchive(Collection $students): void
    {
        if ($students->isEmpty()) {
            return;
        }

        $archivedAt = now();
        $archivedAtKey = $archivedAt->format('U.u');
        $archivedAtTimestamp = $archivedAt->toDateTimeString();

        $students->chunk(200)->each(function (Collection $chunk) use ($archivedAtKey, $archivedAtTimestamp): void {
            $archivedOriginalCases = [];
            $placeholderCases = [];
            $archivedOriginalBindings = [];
            $placeholderBindings = [];
            $ids = [];

            foreach ($chunk as $student) {
                $studentId = (int) $student->id;
                $originalLrn = trim((string) ($student->archived_original_lrn ?? $student->lrn));

                if ($studentId <= 0 || $originalLrn === '') {
                    continue;
                }

                $ids[] = $studentId;
                $archivedOriginalCases[] = 'WHEN ? THEN ?';
                $archivedOriginalBindings[] = $studentId;
                $archivedOriginalBindings[] = $originalLrn;

                $placeholderCases[] = 'WHEN ? THEN ?';
                $placeholderBindings[] = $studentId;
                $placeholderBindings[] = $this->archivedStudentLrnPlaceholderForId(
                    $studentId,
                    $originalLrn,
                    $archivedAtKey,
                );
            }

            if ($ids === []) {
                return;
            }

            $placeholders = implode(', ', array_fill(0, count($ids), '?'));
            $bindings = array_merge(
                $archivedOriginalBindings,
                $placeholderBindings,
                [$archivedAtTimestamp],
                $ids,
            );

            DB::update(
                'UPDATE students SET archived_original_lrn = CASE id '
                . implode(' ', $archivedOriginalCases)
                . ' END, lrn = CASE id '
                . implode(' ', $placeholderCases)
                . ' END, updated_at = ? WHERE id IN (' . $placeholders . ')',
                $bindings,
            );
        });
    }

    private function archivedStudentLrnPlaceholder(Student $student, string $originalLrn): string
    {
        return $this->archivedStudentLrnPlaceholderForId(
            (int) $student->id,
            $originalLrn,
            $student->deleted_at?->format('U.u') ?? now()->format('U.u'),
        );
    }

    private function archivedStudentLrnPlaceholderForId(int $studentId, string $originalLrn, string $archivedAtKey): string
    {
        return 'AR' . strtoupper(substr(
            sha1(implode('|', [
                (string) $studentId,
                trim($originalLrn),
                $archivedAtKey,
            ])),
            0,
            18,
        ));
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
