<?php

namespace App\Http\Controllers\Api;

use App\Events\CspamsUpdateBroadcast;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\UpsertTeacherRecordRequest;
use App\Http\Resources\TeacherRecordResource;
use App\Models\Student;
use App\Models\Teacher;
use App\Models\User;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Symfony\Component\HttpFoundation\Response;

class TeacherRecordController extends Controller
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

        $query = Teacher::query()
            ->with('school:id,school_code,name')
            ->orderByDesc('updated_at')
            ->orderByDesc('id');

        if ($isSchoolHead) {
            if (! $user->school_id) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where('school_id', $user->school_id);
            }
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

        $sex = trim((string) $request->query('sex', ''));
        if ($sex !== '' && in_array(strtolower($sex), ['male', 'female'], true)) {
            $query->where('sex', strtolower($sex));
        }

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function (Builder $builder) use ($search): void {
                $like = '%' . $search . '%';
                $builder
                    ->where('name', 'like', $like)
                    ->orWhere('sex', 'like', $like)
                    ->orWhereHas('school', function (Builder $schoolQuery) use ($like): void {
                        $schoolQuery
                            ->where('school_code', 'like', $like)
                            ->orWhere('name', 'like', $like);
                    });
            });
        }

        $perPage = $this->resolvePerPage($request);
        $teachers = $query->paginate($perPage)->appends($request->query());
        $teacherRows = collect($teachers->items());

        return response()->json([
            'data' => TeacherRecordResource::collection($teacherRows)->resolve(),
            'meta' => [
                'syncedAt' => now()->toISOString(),
                'scope' => $isSchoolHead ? 'school' : 'division',
                'recordCount' => $teachers->total(),
                'currentPage' => $teachers->currentPage(),
                'lastPage' => $teachers->lastPage(),
                'perPage' => $teachers->perPage(),
                'total' => $teachers->total(),
                'from' => $teachers->firstItem(),
                'to' => $teachers->lastItem(),
                'hasMorePages' => $teachers->hasMorePages(),
            ],
        ]);
    }

    public function store(UpsertTeacherRecordRequest $request): JsonResponse
    {
        $user = $this->requireSchoolHead($request);
        if (! $user->school_id) {
            return response()->json(
                ['message' => 'Your account is not linked to any school.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $teacher = new Teacher();
        $teacher->school_id = $user->school_id;

        $this->applyPayload($teacher, $request);

        event(new CspamsUpdateBroadcast([
            'entity' => 'teachers',
            'eventType' => 'teachers.created',
            'teacherId' => (string) $teacher->id,
            'schoolId' => (string) $teacher->school_id,
        ]));

        return response()->json([
            'data' => (new TeacherRecordResource($teacher->load('school:id,school_code,name')))->resolve(),
            'meta' => [
                'syncedAt' => now()->toISOString(),
                'scope' => 'school',
            ],
        ], Response::HTTP_CREATED);
    }

    public function update(UpsertTeacherRecordRequest $request, Teacher $teacher): JsonResponse
    {
        $user = $this->requireSchoolHead($request);

        if ((int) $user->school_id !== (int) $teacher->school_id) {
            return response()->json(
                ['message' => 'You can only update teacher records assigned to your school.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $previousName = trim((string) $teacher->name);
        $this->applyPayload($teacher, $request);
        $nextName = trim((string) $teacher->name);
        $reassignedStudents = 0;

        if ($previousName !== '' && strcasecmp($previousName, $nextName) !== 0) {
            $reassignedStudents = Student::query()
                ->where('school_id', $teacher->school_id)
                ->whereRaw('LOWER(TRIM(teacher_name)) = ?', [strtolower($previousName)])
                ->update([
                    'teacher_name' => $nextName,
                    'updated_at' => now(),
                ]);

            if ($reassignedStudents > 0) {
                event(new CspamsUpdateBroadcast([
                    'entity' => 'students',
                    'eventType' => 'students.teacher_reassigned',
                    'schoolId' => (string) $teacher->school_id,
                    'teacherId' => (string) $teacher->id,
                    'updatedCount' => $reassignedStudents,
                ]));
            }
        }

        event(new CspamsUpdateBroadcast([
            'entity' => 'teachers',
            'eventType' => 'teachers.updated',
            'teacherId' => (string) $teacher->id,
            'schoolId' => (string) $teacher->school_id,
            'updatedStudentAssignments' => $reassignedStudents,
        ]));

        return response()->json([
            'data' => (new TeacherRecordResource($teacher->load('school:id,school_code,name')))->resolve(),
            'meta' => [
                'syncedAt' => now()->toISOString(),
                'scope' => 'school',
                'updatedStudentAssignments' => $reassignedStudents,
            ],
        ]);
    }

    public function destroy(Request $request, Teacher $teacher): JsonResponse
    {
        $user = $this->requireSchoolHead($request);

        if ((int) $user->school_id !== (int) $teacher->school_id) {
            return response()->json(
                ['message' => 'You can only delete teacher records assigned to your school.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $assignedStudents = $this->countAssignedStudents($teacher);
        if ($assignedStudents > 0) {
            return response()->json(
                ['message' => "Cannot delete this teacher. {$assignedStudents} student assignment(s) still reference this teacher."],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $teacher->delete();

        event(new CspamsUpdateBroadcast([
            'entity' => 'teachers',
            'eventType' => 'teachers.deleted',
            'teacherId' => (string) $teacher->id,
            'schoolId' => (string) $teacher->school_id,
        ]));

        return response()->json([
            'data' => [
                'id' => (string) $teacher->id,
            ],
            'meta' => [
                'syncedAt' => now()->toISOString(),
                'scope' => 'school',
            ],
        ]);
    }

    private function countAssignedStudents(Teacher $teacher): int
    {
        $teacherName = trim((string) $teacher->name);
        if ($teacherName === '') {
            return 0;
        }

        return Student::query()
            ->where('school_id', $teacher->school_id)
            ->whereRaw('LOWER(TRIM(teacher_name)) = ?', [strtolower($teacherName)])
            ->count();
    }

    private function requireSchoolHead(Request $request): User
    {
        $user = ApiUserResolver::fromRequest($request);
        abort_if(! $user, Response::HTTP_UNAUTHORIZED, 'Unauthenticated.');
        abort_if(
            ! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD),
            Response::HTTP_FORBIDDEN,
            'Only School Heads can modify teacher records.',
        );

        return $user;
    }

    private function applyPayload(Teacher $teacher, UpsertTeacherRecordRequest $request): void
    {
        $teacher->fill([
            'name' => trim($request->string('name')->toString()),
            'sex' => $request->input('sex'),
        ]);

        $teacher->save();
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
