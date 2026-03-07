<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\UpsertSchoolRecordRequest;
use App\Http\Resources\SchoolRecordResource;
use App\Models\School;
use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use Carbon\Carbon;
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

        $syncProbe = (clone $baseQuery)
            ->selectRaw('COUNT(*) as aggregate_count')
            ->selectRaw('MAX(updated_at) as latest_updated_at')
            ->selectRaw('MAX(submitted_at) as latest_submitted_at')
            ->first();

        $recordCount = (int) ($syncProbe?->aggregate_count ?? 0);
        $latestAt = $this->resolveLatestTimestamp(
            $syncProbe?->latest_updated_at,
            $syncProbe?->latest_submitted_at,
        );

        $etag = sha1(implode('|', [
            $scope,
            $scopeKey,
            (string) $recordCount,
            $latestAt?->format('U.u') ?? '0',
        ]));

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

        $syncedAt = now()->toISOString();

        $resource = SchoolRecordResource::collection($records)->additional([
            'meta' => [
                'syncedAt' => $syncedAt,
                'scope' => $scope,
                'scopeKey' => $scopeKey,
                'recordCount' => $records->count(),
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

    private function buildMutationResponse(School $school, User $user): JsonResponse
    {
        $syncMeta = $this->buildSyncMetadataForUser($user);
        $syncedAt = now()->toISOString();

        $response = response()->json([
            'data' => (new SchoolRecordResource($school->load('submittedBy:id,name')))->resolve(),
            'meta' => [
                'syncedAt' => $syncedAt,
                'scope' => $syncMeta['scope'],
                'scopeKey' => $syncMeta['scopeKey'],
                'recordCount' => $syncMeta['recordCount'],
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

        $syncProbe = (clone $baseQuery)
            ->selectRaw('COUNT(*) as aggregate_count')
            ->selectRaw('MAX(updated_at) as latest_updated_at')
            ->selectRaw('MAX(submitted_at) as latest_submitted_at')
            ->first();

        $recordCount = (int) ($syncProbe?->aggregate_count ?? 0);
        $latestAt = $this->resolveLatestTimestamp(
            $syncProbe?->latest_updated_at,
            $syncProbe?->latest_submitted_at,
        );

        $etag = sha1(implode('|', [
            $scope,
            $scopeKey,
            (string) $recordCount,
            $latestAt?->format('U.u') ?? '0',
        ]));

        return [
            'scope' => $scope,
            'scopeKey' => $scopeKey,
            'recordCount' => $recordCount,
            'latestAt' => $latestAt,
            'etag' => $etag,
        ];
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

    private function resolveLatestTimestamp(?string $updatedAt, ?string $submittedAt): ?Carbon
    {
        $timestamps = [];
        if ($updatedAt) {
            $timestamps[] = Carbon::parse($updatedAt);
        }
        if ($submittedAt) {
            $timestamps[] = Carbon::parse($submittedAt);
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
