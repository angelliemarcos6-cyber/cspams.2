<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\LearnerCaseResource;
use App\Models\LearnerCase;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class LearnerCaseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        Gate::forUser($user)->authorize('viewAny', LearnerCase::class);

        $isMonitor = UserRoleResolver::has($user, UserRoleResolver::MONITOR);
        $query = LearnerCase::query()
            ->with([
                'school:id,school_code,name',
                'academicYear:id,name,is_current',
                'createdBy:id,name,email',
            ])
            ->orderByRaw($this->severityOrderSql())
            ->orderByDesc('updated_at')
            ->orderByDesc('id');

        if (! $isMonitor) {
            if (! $user->school_id) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where('school_id', $user->school_id);
            }
        }

        $severityFilter = strtolower(trim((string) $request->query('severity', '')));
        if ($severityFilter !== '') {
            if (! in_array($severityFilter, LearnerCase::severityValues(), true)) {
                return response()->json([
                    'message' => 'Invalid severity filter.',
                    'errors' => [
                        'severity' => ['Severity filter must be one of: low, medium, high.'],
                    ],
                ], Response::HTTP_UNPROCESSABLE_ENTITY);
            }

            $query->where('severity', $severityFilter);
        }

        $perPage = $this->resolvePerPage($request);
        $records = $query->paginate($perPage)->appends($request->query());

        return response()->json([
            'data' => LearnerCaseResource::collection(collect($records->items()))->resolve(),
            'meta' => [
                'currentPage' => $records->currentPage(),
                'lastPage' => $records->lastPage(),
                'perPage' => $records->perPage(),
                'total' => $records->total(),
                'from' => $records->firstItem(),
                'to' => $records->lastItem(),
                'hasMorePages' => $records->hasMorePages(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        Gate::forUser($user)->authorize('create', LearnerCase::class);

        $validated = $this->validatePayload($request);

        $learnerCase = new LearnerCase();
        $learnerCase->fill($validated);
        $learnerCase->school_id = (int) $user->school_id;
        $learnerCase->created_by = (int) $user->id;
        $learnerCase->resolved_at = ($validated['status'] ?? null) === 'resolved'
            ? now()
            : null;
        $learnerCase->save();

        $learnerCase->load([
            'school:id,school_code,name',
            'academicYear:id,name,is_current',
            'createdBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new LearnerCaseResource($learnerCase))->resolve(),
        ], Response::HTTP_CREATED);
    }

    public function show(Request $request, LearnerCase $learnerCase): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        Gate::forUser($user)->authorize('view', $learnerCase);

        $learnerCase->load([
            'school:id,school_code,name',
            'academicYear:id,name,is_current',
            'createdBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new LearnerCaseResource($learnerCase))->resolve(),
        ]);
    }

    public function update(Request $request, LearnerCase $learnerCase): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        Gate::forUser($user)->authorize('update', $learnerCase);

        $validated = $this->validatePayload($request, $request->isMethod('patch'));
        $requestedStatus = array_key_exists('status', $validated)
            ? (string) $validated['status']
            : null;

        $learnerCase->fill($validated);

        if ($requestedStatus === 'resolved') {
            $learnerCase->resolve();
        } elseif ($requestedStatus === 'monitoring') {
            $learnerCase->markAsMonitoring();
        } else {
            if ($requestedStatus === 'open') {
                $learnerCase->resolved_at = null;
            }

            $learnerCase->save();
        }

        $learnerCase->load([
            'school:id,school_code,name',
            'academicYear:id,name,is_current',
            'createdBy:id,name,email',
        ]);

        return response()->json([
            'data' => (new LearnerCaseResource($learnerCase))->resolve(),
        ]);
    }

    public function destroy(Request $request, LearnerCase $learnerCase): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        Gate::forUser($user)->authorize('delete', $learnerCase);

        $deletedId = (string) $learnerCase->id;
        $learnerCase->delete();

        return response()->json([
            'data' => [
                'id' => $deletedId,
                'deleted' => true,
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'academic_year_id' => [$required, 'integer', 'exists:academic_years,id'],
            'lrn' => [$required, 'string', 'max:20'],
            'name' => [$required, 'string', 'max:255'],
            'grade_section' => [$required, 'string', 'max:255'],
            'issue_type' => [$required, Rule::in(LearnerCase::issueTypeValues())],
            'severity' => [$required, Rule::in(LearnerCase::severityValues())],
            'case_notes' => [$required, 'string'],
            'status' => [$required, Rule::in(LearnerCase::statusValues())],
        ]);
    }

    private function resolvePerPage(Request $request, int $default = 25, int $max = 100): int
    {
        $perPage = $request->integer('per_page');
        if ($perPage <= 0) {
            return $default;
        }

        return min($perPage, $max);
    }

    private function severityOrderSql(): string
    {
        return "CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END";
    }
}
