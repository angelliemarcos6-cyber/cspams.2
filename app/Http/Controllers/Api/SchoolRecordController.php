<?php

namespace App\Http\Controllers\Api;

use App\Events\CspamsUpdateBroadcast;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\BulkImportSchoolRecordsRequest;
use App\Http\Requests\Api\UpsertSchoolRecordRequest;
use App\Http\Resources\SchoolRecordResource;
use App\Models\AuditLog;
use App\Models\FormSubmissionHistory;
use App\Models\IndicatorSubmission;
use App\Models\School;
use App\Models\Section;
use App\Models\Student;
use App\Models\User;
use App\Notifications\SchoolHeadAccountSetupNotification;
use App\Notifications\SchoolSubmissionReminderNotification;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\SchoolHeadAccountSetupService;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\AccountStatus;
use App\Support\Domain\SchoolStatus;
use App\Support\Mail\MailDelivery;
use Carbon\CarbonImmutable;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class SchoolRecordController extends Controller
{
    public function __construct(
        private readonly SchoolHeadAccountSetupService $schoolHeadAccountSetupService,
    ) {
    }

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
        $requestedPerPage = $request->integer('per_page');
        $shouldPaginate = $request->boolean('paginate') || $requestedPerPage > 0;
        $perPage = $this->resolvePerPage($request);

        $incomingEtag = trim((string) $request->header('If-None-Match'));
        if ($incomingEtag !== '' && trim($incomingEtag, '"') === $etag) {
            return $this->buildNotModifiedResponse($etag, $scope, $scopeKey, $recordCount, $latestAt);
        }

        $query = (clone $baseQuery)
            ->with('submittedBy:id,name')
            ->with(['latestIndicatorSubmission' => function ($query): void {
                $query->select([
                    'id',
                    'indicator_submissions.school_id',
                    'status',
                    'submitted_at',
                    'reviewed_at',
                    'created_at',
                    'updated_at',
                ]);
            }])
            ->with(['schoolHeadAccounts' => function ($query): void {
                $columns = [
                    'id',
                    'name',
                    'email',
                    'email_verified_at',
                    'must_reset_password',
                    'last_login_at',
                    'account_status',
                    'school_id',
                    'flagged_at',
                    'flagged_reason',
                ];

                if (Schema::hasColumn('users', 'delete_record_flagged_at')) {
                    $columns[] = 'delete_record_flagged_at';
                    $columns[] = 'delete_record_flag_reason';
                }

                $query->select($columns);

                if (Schema::hasTable('account_setup_tokens')) {
                    $query->with('latestAccountSetupToken');
                }
            }])
            ->withCount('students')
            ->orderByDesc('submitted_at')
            ->orderByDesc('updated_at');

        $records = collect();
        $paginationMeta = null;

        if ($shouldPaginate) {
            $paginator = $query->paginate($perPage)->appends($request->query());
            $records = collect($paginator->items());
            $paginationMeta = [
                'currentPage' => $paginator->currentPage(),
                'lastPage' => $paginator->lastPage(),
                'perPage' => $paginator->perPage(),
                'total' => $paginator->total(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
                'hasMorePages' => $paginator->hasMorePages(),
            ];
        } else {
            $records = $query->get();
        }

        $targetsMet = $this->buildTargetsMetSummary(clone $baseQuery);
        $syncAlerts = $this->buildSyncAlerts($targetsMet);
        $syncedAt = now()->toISOString();

        $resource = SchoolRecordResource::collection($records)->additional([
            'meta' => [
                'syncedAt' => $syncedAt,
                'scope' => $scope,
                'scopeKey' => $scopeKey,
                'recordCount' => $recordCount,
                'pagination' => $paginationMeta,
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
        $user = $this->requireAuthenticatedUser($request);

        if (UserRoleResolver::has($user, UserRoleResolver::MONITOR)) {
            return $this->storeAsMonitor($request, $user);
        }

        if (! UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD)) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

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
        $user = $this->requireAuthenticatedUser($request);
        $isMonitor = UserRoleResolver::has($user, UserRoleResolver::MONITOR);
        $isSchoolHead = UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);

        if (! $isMonitor && ! $isSchoolHead) {
            return response()->json(['message' => 'Forbidden.'], Response::HTTP_FORBIDDEN);
        }

        if ($isSchoolHead && ! $isMonitor && (int) $user->school_id !== (int) $school->id) {
            return response()->json(
                ['message' => 'You can only update your assigned school record.'],
                Response::HTTP_FORBIDDEN,
            );
        }

        $this->applyPayload($school, $request, $user);

        return $this->buildMutationResponse($school, $user);
    }

    public function destroy(Request $request, School $school): JsonResponse
    {
        $user = $this->requireMonitor($request);
        $deletePreview = $this->buildDeletePreview($school);

        $deletedRecord = [
            'id' => (string) $school->id,
            'schoolId' => $school->school_code,
            'schoolName' => $school->name,
            'dependencies' => $deletePreview,
        ];

        $school->delete();

        $syncMeta = $this->buildSyncMetadataForUser($user);
        $targetsMetBundle = $this->buildTargetsMetAndAlertsForUser($user);
        $syncedAt = now()->toISOString();

        $response = response()->json([
            'data' => $deletedRecord,
            'meta' => [
                'syncedAt' => $syncedAt,
                'scope' => $syncMeta['scope'],
                'scopeKey' => $syncMeta['scopeKey'],
                'recordCount' => $syncMeta['recordCount'],
                'targetsMet' => $targetsMetBundle['targetsMet'],
                'alerts' => $targetsMetBundle['alerts'],
            ],
        ]);

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_records.deleted',
            'schoolId' => (string) $school->id,
            'alertsCount' => count($targetsMetBundle['alerts']),
            'pendingSchools' => (int) ($targetsMetBundle['targetsMet']['pendingSchools'] ?? 0),
        ]));

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

    public function deletePreview(Request $request, School $school): JsonResponse
    {
        $this->requireMonitor($request);

        return response()->json([
            'data' => [
                'id' => (string) $school->id,
                'schoolId' => (string) $school->school_code,
                'schoolName' => (string) $school->name,
                'dependencies' => $this->buildDeletePreview($school),
            ],
        ]);
    }

    public function archived(Request $request): JsonResponse
    {
        $this->requireMonitor($request);

        $records = School::onlyTrashed()
            ->with('submittedBy:id,name')
            ->with(['schoolHeadAccounts' => function ($query): void {
                $query->select([
                    'id',
                    'name',
                    'email',
                    'email_verified_at',
                    'must_reset_password',
                    'last_login_at',
                    'account_status',
                    'school_id',
                    'flagged_at',
                    'flagged_reason',
                ]);

                if (Schema::hasTable('account_setup_tokens')) {
                    $query->with('latestAccountSetupToken');
                }
            }])
            ->withCount('students')
            ->orderByDesc('deleted_at')
            ->get();

        return response()->json([
            'data' => SchoolRecordResource::collection($records)->resolve(),
            'meta' => [
                'count' => $records->count(),
            ],
        ]);
    }

    public function restore(Request $request, string $school): JsonResponse
    {
        $user = $this->requireMonitor($request);

        $record = School::withTrashed()->find($school);
        if (! $record || ! $record->trashed()) {
            return response()->json(
                ['message' => 'Archived school record not found.'],
                Response::HTTP_NOT_FOUND,
            );
        }

        $record->restore();

        return $this->buildMutationResponse($record, $user);
    }

    public function sendReminder(Request $request, School $school): JsonResponse
    {
        $monitor = $this->requireMonitor($request);
        $notes = trim((string) $request->input('notes', ''));

        if (strlen($notes) > 500) {
            return response()->json(
                ['message' => 'Reminder note must be 500 characters or less.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $schoolHeads = $school
            ->schoolHeadAccounts()
            ->with('roles')
            ->get();

        if ($schoolHeads->isEmpty()) {
            return response()->json(
                ['message' => 'No School Head account is linked to this school.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        foreach ($schoolHeads as $schoolHead) {
            $schoolHead->notify(
                new SchoolSubmissionReminderNotification(
                    $school,
                    $monitor,
                    $notes !== '' ? $notes : null,
                ),
            );
        }

        AuditLog::query()->create([
            'user_id' => $monitor->id,
            'action' => 'school.reminder_sent',
            'auditable_type' => School::class,
            'auditable_id' => $school->id,
            'metadata' => [
                'school_id' => (string) $school->id,
                'school_code' => (string) $school->school_code,
                'school_name' => (string) $school->name,
                'recipient_count' => $schoolHeads->count(),
                'recipient_emails' => $schoolHeads->pluck('email')->values()->all(),
                'notes' => $notes !== '' ? $notes : null,
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        $remindedAt = now()->toISOString();

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_records.reminder_sent',
            'schoolId' => (string) $school->id,
            'schoolCode' => (string) $school->school_code,
            'schoolName' => (string) $school->name,
            'recipientCount' => $schoolHeads->count(),
            'remindedAt' => $remindedAt,
        ]));

        return response()->json([
            'data' => [
                'schoolId' => (string) $school->school_code,
                'schoolName' => (string) $school->name,
                'recipientCount' => $schoolHeads->count(),
                'recipientEmails' => $schoolHeads->pluck('email')->values(),
                'remindedAt' => $remindedAt,
            ],
        ]);
    }

    public function bulkImport(BulkImportSchoolRecordsRequest $request): JsonResponse
    {
        $user = $this->requireMonitor($request);

        /** @var array<int, array<string, mixed>> $rows */
        $rows = $request->validated('rows', []);
        $updateExisting = $request->boolean('options.updateExisting', true);
        $restoreArchived = $request->boolean('options.restoreArchived', true);

        $created = 0;
        $updated = 0;
        $restored = 0;
        $skipped = 0;
        $failed = 0;
        $results = [];

        foreach ($rows as $index => $row) {
            try {
                $schoolCode = $this->normalizeSchoolCode((string) ($row['schoolId'] ?? ''));
                $school = School::withTrashed()
                    ->whereRaw('UPPER(school_code) = ?', [$schoolCode])
                    ->first();

                $action = 'created';
                if ($school) {
                    if ($school->trashed()) {
                        if (! $restoreArchived) {
                            $skipped++;
                            $results[] = [
                                'row' => $index + 1,
                                'schoolId' => $schoolCode,
                                'action' => 'skipped',
                                'message' => 'School is archived and restore is disabled.',
                            ];
                            continue;
                        }

                        $school->restore();
                        $restored++;
                        $action = 'restored';
                    } elseif (! $updateExisting) {
                        $skipped++;
                        $results[] = [
                            'row' => $index + 1,
                            'schoolId' => $schoolCode,
                            'action' => 'skipped',
                            'message' => 'School already exists and update is disabled.',
                        ];
                        continue;
                    } else {
                        $updated++;
                        $action = 'updated';
                    }
                } else {
                    $school = new School();
                    $created++;
                }

                $this->applyArrayPayload($school, $row, $user);

                $results[] = [
                    'row' => $index + 1,
                    'schoolId' => $schoolCode,
                    'schoolName' => (string) $school->name,
                    'action' => $action,
                ];
            } catch (\Throwable $exception) {
                $failed++;
                $results[] = [
                    'row' => $index + 1,
                    'schoolId' => (string) ($row['schoolId'] ?? 'N/A'),
                    'action' => 'failed',
                    'message' => $exception->getMessage(),
                ];
            }
        }

        $syncMeta = $this->buildSyncMetadataForUser($user);
        $targetsMetBundle = $this->buildTargetsMetAndAlertsForUser($user);
        $syncedAt = now()->toISOString();

        $response = response()->json([
            'data' => [
                'created' => $created,
                'updated' => $updated,
                'restored' => $restored,
                'skipped' => $skipped,
                'failed' => $failed,
                'results' => $results,
            ],
            'meta' => [
                'syncedAt' => $syncedAt,
                'scope' => $syncMeta['scope'],
                'scopeKey' => $syncMeta['scopeKey'],
                'recordCount' => $syncMeta['recordCount'],
                'targetsMet' => $targetsMetBundle['targetsMet'],
                'alerts' => $targetsMetBundle['alerts'],
            ],
        ]);

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_records.bulk_imported',
            'created' => $created,
            'updated' => $updated,
            'restored' => $restored,
            'failed' => $failed,
            'alertsCount' => count($targetsMetBundle['alerts']),
        ]));

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

    private function requireAuthenticatedUser(Request $request): User
    {
        $user = ApiUserResolver::fromRequest($request);
        abort_if(! $user, Response::HTTP_UNAUTHORIZED, 'Unauthenticated.');

        return $user;
    }

    private function requireMonitor(Request $request): User
    {
        $user = $this->requireAuthenticatedUser($request);
        abort_if(
            ! UserRoleResolver::has($user, UserRoleResolver::MONITOR),
            Response::HTTP_FORBIDDEN,
            'Only Division Monitors can modify division school records.',
        );

        return $user;
    }

    private function storeAsMonitor(UpsertSchoolRecordRequest $request, User $user): JsonResponse
    {
        $schoolCode = $this->normalizeSchoolCode($request->string('schoolId')->toString());
        $existing = School::withTrashed()
            ->whereRaw('UPPER(school_code) = ?', [$schoolCode])
            ->first();

        if ($existing && ! $existing->trashed()) {
            throw ValidationException::withMessages([
                'schoolId' => 'School code already exists in active records.',
            ]);
        }

        $school = $existing ?? new School();
        if ($existing?->trashed()) {
            $existing->restore();
        }

        $school->school_code = $schoolCode;

        $this->applyPayload($school, $request, $user);

        $schoolHeadAccountMeta = $this->createSchoolHeadAccountIfRequested($school, $request);

        return $this->buildMutationResponse(
            $school,
            $user,
            $schoolHeadAccountMeta ? ['schoolHeadAccount' => $schoolHeadAccountMeta] : [],
        );
    }

    private function applyPayload(School $school, UpsertSchoolRecordRequest $request, User $user): void
    {
        $currentStatus = is_string($school->status) && $school->status !== ''
            ? $school->status
            : SchoolStatus::ACTIVE->value;

        $school->fill([
            'status' => $request->filled('status')
                ? $request->string('status')->toString()
                : $currentStatus,
            'submitted_by' => $user->id,
            'submitted_at' => now(),
        ]);

        if ($request->has('teacherCount')) {
            $school->reported_teacher_count = $request->integer('teacherCount');
        } elseif (! $school->exists && $school->reported_teacher_count === null) {
            $school->reported_teacher_count = 0;
        }

        $isSchoolHead = UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD);

        // School identity fields are division-managed. School Heads can submit
        // compliance counts/status, but cannot rewrite profile metadata.
        if (! $isSchoolHead) {
            if ($request->filled('schoolId')) {
                $school->school_code = $this->normalizeSchoolCode($request->string('schoolId')->toString());
            }

            if ($request->filled('schoolName')) {
                $school->name = $request->string('schoolName')->toString();
            }

            if ($request->filled('level')) {
                $school->level = $request->string('level')->toString();
            }

            if ($request->filled('type')) {
                $school->type = strtolower($request->string('type')->toString());
            }

            if ($request->filled('address')) {
                $school->address = $request->string('address')->toString();
                if (! $request->filled('district')) {
                    $school->district = $this->deriveDistrictFromAddress($school->address);
                }
            }

            if ($request->filled('district')) {
                $school->district = $request->string('district')->toString();
            }

            if ($request->filled('region')) {
                $school->region = $request->string('region')->toString();
            } elseif ($request->filled('address')) {
                $school->region = $this->deriveRegionFromAddress($school->address);
            }
        }

        $school->save();
        $this->syncSchoolStudentCount($school);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function applyArrayPayload(School $school, array $payload, User $user): void
    {
        $schoolCode = $this->normalizeSchoolCode((string) ($payload['schoolId'] ?? ''));
        $schoolName = trim((string) ($payload['schoolName'] ?? ''));
        $level = trim((string) ($payload['level'] ?? ''));
        $type = strtolower(trim((string) ($payload['type'] ?? 'public')));
        $address = trim((string) ($payload['address'] ?? ''));
        $district = trim((string) ($payload['district'] ?? ''));
        $region = trim((string) ($payload['region'] ?? ''));
        $status = trim((string) ($payload['status'] ?? 'active'));

        $school->school_code = $schoolCode;
        $school->name = $schoolName;
        $school->level = $level;
        $school->type = $type;
        $school->address = $address;
        $school->district = $district !== '' ? $district : $this->deriveDistrictFromAddress($address);
        $school->region = $region !== '' ? $region : $this->deriveRegionFromAddress($address);
        $school->status = $status;
        $school->reported_teacher_count = (int) ($payload['teacherCount'] ?? 0);
        $school->submitted_by = $user->id;
        $school->submitted_at = now();
        $school->save();
        $this->syncSchoolStudentCount($school);
    }

    private function createSchoolHeadAccountIfRequested(School $school, UpsertSchoolRecordRequest $request): ?array
    {
        if (! $request->filled('schoolHeadAccount')) {
            return null;
        }

        $monitor = $this->requireAuthenticatedUser($request);
        if (! UserRoleResolver::has($monitor, UserRoleResolver::MONITOR)) {
            return null;
        }

        /** @var array{name?: string, email?: string}|null $payload */
        $payload = $request->input('schoolHeadAccount');
        if (! is_array($payload)) {
            return null;
        }

        $name = trim((string) ($payload['name'] ?? ''));
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        if ($name === '' || $email === '') {
            return null;
        }

        if (! $this->schoolHeadAccountSetupService->storageAvailable()) {
            abort(
                Response::HTTP_SERVICE_UNAVAILABLE,
                'Account setup token storage is unavailable. Run database migrations first.',
            );
        }

        if (User::query()->where('email_normalized', $email)->exists()) {
            throw ValidationException::withMessages([
                'schoolHeadAccount.email' => 'A user account with this email already exists.',
            ]);
        }

        $duplicateQuery = User::query()->where('school_id', $school->id);
        if (Schema::hasColumn('users', 'account_type')) {
            $duplicateQuery->where('account_type', UserRoleResolver::SCHOOL_HEAD);
        } else {
            $aliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);
            $duplicateQuery->whereHas('roles', static function ($builder) use ($aliases): void {
                $builder->whereIn('name', $aliases);
            });
        }

        if ($duplicateQuery->exists()) {
            throw ValidationException::withMessages([
                'schoolHeadAccount' => 'A School Head account is already linked to this school. Update it instead of creating a new one.',
            ]);
        }

        $account = new User();
        $account->name = $name;
        $account->email = $email;
        $account->password = Hash::make(Str::password(40));
        $account->must_reset_password = true;
        $account->password_changed_at = null;
        $account->account_status = AccountStatus::PENDING_SETUP->value;
        $account->school_id = $school->id;
        if (Schema::hasColumn('users', 'account_type')) {
            $account->account_type = UserRoleResolver::SCHOOL_HEAD;
        }
        $account->save();
        $account->assignRole(UserRoleResolver::SCHOOL_HEAD);

        $issuedSetup = $this->schoolHeadAccountSetupService->issue(
            $account,
            $monitor,
            $request->ip(),
            $request->userAgent(),
        );

        $deliveryStatus = 'sent';
        $deliveryMessage = 'Setup link sent to the School Head email.';

        if (MailDelivery::isSimulated()) {
            $deliveryStatus = MailDelivery::simulatedStatus();
            $deliveryMessage = MailDelivery::simulatedMessage('Setup link was generated, but will not reach real inboxes.');
        }
        try {
            $account->notify(
                new SchoolHeadAccountSetupNotification(
                    $school,
                    $issuedSetup['setupUrl'],
                    CarbonImmutable::parse($issuedSetup['expiresAt']),
                ),
            );
        } catch (\Throwable $exception) {
            report($exception);
            $deliveryStatus = 'failed';
            $deliveryMessage = 'Setup link email delivery failed. Please try again or contact an administrator.';
        }

        AuditLog::query()->create([
            'user_id' => $monitor->id,
            'action' => 'account.setup_link_issued',
            'auditable_type' => User::class,
            'auditable_id' => $account->id,
            'metadata' => [
                'category' => 'account_management',
                'outcome' => 'success',
                'target_user_id' => $account->id,
                'target_email' => $account->email,
                'target_role' => UserRoleResolver::SCHOOL_HEAD,
                'account_status' => $account->accountStatus()->value,
                'school_id' => (string) $school->id,
                'school_code' => (string) $school->school_code,
                'setup_link_expires_at' => $issuedSetup['expiresAt'],
                'delivery_status' => $deliveryStatus,
                'delivery_message' => $deliveryMessage,
                'reason' => 'account_created',
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'created_at' => now(),
        ]);

        return [
            'id' => (string) $account->id,
            'name' => $account->name,
            'email' => $account->email,
            'mustResetPassword' => true,
            'accountStatus' => $account->accountStatus()->value,
            'setupLinkExpiresAt' => $issuedSetup['expiresAt'],
            'setupLinkDelivery' => $deliveryStatus,
            'setupLinkDeliveryMessage' => $deliveryMessage,
        ];
    }

    private function normalizeSchoolCode(string $value): string
    {
        $normalized = trim($value);

        if (preg_match('/^\d{6}$/', $normalized) !== 1) {
            throw ValidationException::withMessages([
                'schoolId' => 'School code must be exactly 6 digits.',
            ]);
        }

        return $normalized;
    }

    private function deriveDistrictFromAddress(string $address): string
    {
        $segments = array_values(
            array_filter(
                array_map(static fn (string $segment): string => trim($segment), explode(',', $address)),
                static fn (string $segment): bool => $segment !== '',
            ),
        );

        return $segments[0] ?? 'N/A';
    }

    private function deriveRegionFromAddress(string $address): string
    {
        $segments = array_values(
            array_filter(
                array_map(static fn (string $segment): string => trim($segment), explode(',', $address)),
                static fn (string $segment): bool => $segment !== '',
            ),
        );

        if (count($segments) >= 2) {
            return implode(', ', array_slice($segments, -2));
        }

        return $segments[0] ?? 'N/A';
    }

    /**
     * @param array<string, mixed> $extraMeta
     */
    private function buildMutationResponse(School $school, User $user, array $extraMeta = []): JsonResponse
    {
        $syncMeta = $this->buildSyncMetadataForUser($user);
        $targetsMetBundle = $this->buildTargetsMetAndAlertsForUser($user);
        $syncedAt = now()->toISOString();

        $response = response()->json([
            'data' => (new SchoolRecordResource($school->load([
                'submittedBy:id,name',
                'latestIndicatorSubmission' => function ($query): void {
                    $query->select([
                        'id',
                        'indicator_submissions.school_id',
                        'status',
                        'submitted_at',
                        'reviewed_at',
                        'created_at',
                        'updated_at',
                    ]);
                },
                'schoolHeadAccounts' => function ($query): void {
                    $query->select([
                        'id',
                        'name',
                        'email',
                        'email_verified_at',
                        'must_reset_password',
                        'last_login_at',
                        'account_status',
                        'school_id',
                        'flagged_at',
                        'flagged_reason',
                    ]);

                    if (Schema::hasTable('account_setup_tokens')) {
                        $query->with('latestAccountSetupToken');
                    }
                },
            ])))->resolve(),
            'meta' => array_merge([
                'syncedAt' => $syncedAt,
                'scope' => $syncMeta['scope'],
                'scopeKey' => $syncMeta['scopeKey'],
                'recordCount' => $syncMeta['recordCount'],
                'targetsMet' => $targetsMetBundle['targetsMet'],
                'alerts' => $targetsMetBundle['alerts'],
            ], $extraMeta),
        ]);

        event(new CspamsUpdateBroadcast([
            'entity' => 'dashboard',
            'eventType' => 'school_records.updated',
            'schoolId' => (string) $school->id,
            'status' => (string) $school->status,
            'alertsCount' => count($targetsMetBundle['alerts']),
            'pendingSchools' => (int) ($targetsMetBundle['targetsMet']['pendingSchools'] ?? 0),
        ]));

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
     *     students: int,
     *     sections: int,
     *     indicatorSubmissions: int,
     *     histories: int,
     *     linkedUsers: int
     * }
     */
    private function buildDeletePreview(School $school): array
    {
        return [
            'students' => Student::query()->where('school_id', $school->id)->count(),
            'sections' => Section::query()->where('school_id', $school->id)->count(),
            'indicatorSubmissions' => $school->indicatorSubmissions()->count(),
            'histories' => FormSubmissionHistory::query()->where('school_id', $school->id)->count(),
            'linkedUsers' => User::query()->where('school_id', $school->id)->count(),
        ];
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
        $reportedStudents = $trackedLearners;

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

    private function syncSchoolStudentCount(School $school): void
    {
        if (! $school->exists) {
            return;
        }

        $studentCount = Student::query()
            ->where('school_id', $school->id)
            ->count();

        if ((int) $school->reported_student_count === $studentCount) {
            return;
        }

        $school->reported_student_count = $studentCount;
        $school->saveQuietly();
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
     *     indicatorSubmissionCount: int,
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
        $indicatorSubmissionCount = 0;
        $latestSectionUpdatedAt = null;
        $latestStudentUpdatedAt = null;
        $latestStudentStatusAt = null;
        $latestIndicatorUpdatedAt = null;
        $latestIndicatorSubmittedAt = null;
        $latestIndicatorReviewedAt = null;

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

            $indicatorProbe = IndicatorSubmission::query()
                ->whereIn('school_id', $schoolIds)
                ->selectRaw('COUNT(*) as aggregate_count')
                ->selectRaw('MAX(updated_at) as latest_updated_at')
                ->selectRaw('MAX(submitted_at) as latest_submitted_at')
                ->selectRaw('MAX(reviewed_at) as latest_reviewed_at')
                ->first();

            $indicatorSubmissionCount = (int) ($indicatorProbe?->aggregate_count ?? 0);
            $latestIndicatorUpdatedAt = $indicatorProbe?->latest_updated_at;
            $latestIndicatorSubmittedAt = $indicatorProbe?->latest_submitted_at;
            $latestIndicatorReviewedAt = $indicatorProbe?->latest_reviewed_at;
        }

        $latestAt = $this->resolveLatestTimestamp(
            $schoolProbe?->latest_updated_at,
            $schoolProbe?->latest_submitted_at,
            $latestSectionUpdatedAt,
            $latestStudentUpdatedAt,
            $latestStudentStatusAt,
            $latestIndicatorUpdatedAt,
            $latestIndicatorSubmittedAt,
            $latestIndicatorReviewedAt,
        );

        return [
            'recordCount' => $recordCount,
            'sectionCount' => $sectionCount,
            'studentCount' => $studentCount,
            'indicatorSubmissionCount' => $indicatorSubmissionCount,
            'latestAt' => $latestAt,
        ];
    }

    /**
     * @param array{
     *     recordCount: int,
     *     sectionCount: int,
     *     studentCount: int,
     *     indicatorSubmissionCount: int,
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
            (string) $syncFingerprint['indicatorSubmissionCount'],
            $syncFingerprint['latestAt']?->format('U.u') ?? '0',
        ]));
    }

    private function resolvePerPage(Request $request, int $default = 50, int $max = 200): int
    {
        $perPage = $request->integer('per_page');

        if ($perPage <= 0) {
            return $default;
        }

        return min($perPage, $max);
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
