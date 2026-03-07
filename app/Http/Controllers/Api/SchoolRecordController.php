<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\UpsertSchoolRecordRequest;
use App\Http\Resources\SchoolRecordResource;
use App\Models\School;
use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\Response;

class SchoolRecordController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $query = School::query()
            ->with('submittedBy:id,name')
            ->withCount('students')
            ->orderByDesc('submitted_at')
            ->orderByDesc('updated_at');

        if (UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)) {
            if (! $user->school_id) {
                return SchoolRecordResource::collection(collect());
            }
            $query->whereKey($user->school_id);
        } elseif (! UserRoleResolver::has($user, UserRoleResolver::MONITOR)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        return SchoolRecordResource::collection($query->get());
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

        return response()->json([
            'record' => (new SchoolRecordResource($school->load('submittedBy:id,name')))->resolve(),
        ]);
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

        return response()->json([
            'record' => (new SchoolRecordResource($school->load('submittedBy:id,name')))->resolve(),
        ]);
    }

    private function requireSchoolHead(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
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
            'name' => $request->string('schoolName')->toString(),
            'region' => $request->string('region')->toString(),
            'status' => $request->string('status')->toString(),
            'reported_student_count' => $request->integer('studentCount'),
            'reported_teacher_count' => $request->integer('teacherCount'),
            'submitted_by' => $user->id,
            'submitted_at' => now(),
        ]);

        if ($request->filled('district')) {
            $school->district = $request->string('district')->toString();
        }

        if ($request->filled('type')) {
            $school->type = $request->string('type')->toString();
        }

        $school->save();
    }
}
