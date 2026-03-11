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

        $query = Student::query()
            ->with(['school:id,school_code,name', 'section:id,name'])
            ->orderByDesc('updated_at')
            ->orderByDesc('id');

        if ($isSchoolHead) {
            if (! $user->school_id) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where('school_id', $user->school_id);
            }
        }

        $status = trim((string) $request->query('status', ''));
        if ($status !== '' && StudentStatus::tryFrom($status)) {
            $query->where('status', $status);
        }

        $schoolCode = trim((string) $request->query('schoolCode', ''));
        if ($schoolCode !== '' && $isMonitor) {
            $query->whereHas('school', function (Builder $builder) use ($schoolCode): void {
                $builder->whereRaw('UPPER(school_code) = ?', [strtoupper($schoolCode)]);
            });
        }

        $schoolCodes = $this->parseSchoolCodes($request);
        if ($schoolCodes->isNotEmpty() && $isMonitor) {
            $query->whereHas('school', function (Builder $builder) use ($schoolCodes): void {
                $builder->whereIn('school_code', $schoolCodes->all());
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
        $students = $query->paginate($perPage)->appends($request->query());
        $studentRows = collect($students->items());

        return response()->json([
            'data' => StudentRecordResource::collection($studentRows)->resolve(),
            'meta' => [
                'syncedAt' => now()->toISOString(),
                'scope' => $isSchoolHead ? 'school' : 'division',
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
            'data' => (new StudentRecordResource($student->load(['school:id,school_code,name', 'section:id,name'])))->resolve(),
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
            'data' => (new StudentRecordResource($student->load(['school:id,school_code,name', 'section:id,name'])))->resolve(),
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
            ->map(static fn (string $value): string => strtoupper(trim($value)))
            ->filter(static fn (string $value): bool => $value !== '')
            ->values();
    }
}
