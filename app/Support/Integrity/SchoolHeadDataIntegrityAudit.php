<?php

namespace App\Support\Integrity;

use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\FormSubmissionStatus;
use App\Support\Indicators\SubmissionFileDefinition;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SchoolHeadDataIntegrityAudit
{
    /**
     * @return array{
     *   counts: array<string, int>,
     *   anomalies: array<string, list<array<string, mixed>>>,
     *   warnings: list<string>,
     *   has_anomalies: bool
     * }
     */
    public function run(): array
    {
        $warnings = [];
        $anomalies = [];

        $hasUsersTable = Schema::hasTable('users');
        $hasSchoolsTable = Schema::hasTable('schools');
        $hasAcademicYearsTable = Schema::hasTable('academic_years');
        $hasIndicatorSubmissionsTable = Schema::hasTable('indicator_submissions');
        $hasIndicatorSubmissionItemsTable = Schema::hasTable('indicator_submission_items');
        $hasIndicatorSubmissionFilesTable = Schema::hasTable('indicator_submission_files');

        if (! $hasUsersTable) {
            $warnings[] = 'users table is unavailable.';
        }
        if (! $hasSchoolsTable) {
            $warnings[] = 'schools table is unavailable.';
        }
        if (! $hasAcademicYearsTable) {
            $warnings[] = 'academic_years table is unavailable.';
        }
        if (! $hasIndicatorSubmissionsTable) {
            $warnings[] = 'indicator_submissions table is unavailable.';
        }

        $counts = [
            'school_head_users' => $hasUsersTable ? $this->schoolHeadUserQuery()->count() : 0,
            'indicator_submissions' => $hasIndicatorSubmissionsTable ? (int) DB::table('indicator_submissions')->count() : 0,
            'indicator_submission_files' => $hasIndicatorSubmissionFilesTable ? (int) DB::table('indicator_submission_files')->count() : 0,
        ];

        if ($hasUsersTable) {
            $anomalies['school_head_null_school_ids'] = $this->collectSchoolHeadNullSchoolIds();
            $anomalies['school_head_orphan_school_ids'] = $hasSchoolsTable
                ? $this->collectSchoolHeadOrphanSchoolIds()
                : [];
            $anomalies['duplicate_school_head_accounts_per_school'] = $this->collectDuplicateSchoolHeadAccountsPerSchool();
        }

        if ($hasIndicatorSubmissionsTable) {
            $anomalies['indicator_submissions_null_school_ids'] = $this->collectIndicatorSubmissionNullSchoolIds();
            $anomalies['indicator_submissions_orphan_school_ids'] = $hasSchoolsTable
                ? $this->collectIndicatorSubmissionOrphanSchoolIds()
                : [];
            $anomalies['indicator_submissions_orphan_academic_year_ids'] = $hasAcademicYearsTable
                ? $this->collectIndicatorSubmissionOrphanAcademicYearIds()
                : [];
            $anomalies['duplicate_mutable_submissions'] = $this->collectDuplicateMutableSubmissions();
            $anomalies['finalized_submissions_without_indicator_rows'] = $hasIndicatorSubmissionItemsTable
                ? $this->collectFinalizedSubmissionsWithoutIndicatorRows()
                : [];

            $fileAudit = $this->collectSubmissionFileAuditAnomalies(
                $hasSchoolsTable,
                $hasIndicatorSubmissionFilesTable,
            );
            $anomalies['legacy_core_file_vs_normalized_row_mismatches'] = $fileAudit['legacy_core_file_vs_normalized_row_mismatches'];
            $anomalies['school_type_package_mismatches'] = $fileAudit['school_type_package_mismatches'];
            $anomalies['malformed_normalized_file_rows'] = $fileAudit['malformed_normalized_file_rows'];
        }

        $normalizedAnomalies = [];
        foreach ($anomalies as $key => $rows) {
            $normalizedAnomalies[$key] = array_values($rows);
        }

        return [
            'counts' => $counts,
            'anomalies' => $normalizedAnomalies,
            'warnings' => $warnings,
            'has_anomalies' => collect($normalizedAnomalies)->contains(
                static fn (array $rows): bool => $rows !== [],
            ),
        ];
    }

    private function schoolHeadUserQuery()
    {
        if (! Schema::hasTable('users')) {
            return DB::table('users')->whereRaw('1 = 0');
        }

        $query = DB::table('users');

        if (Schema::hasColumn('users', 'account_type')) {
            return $query->where('account_type', UserRoleResolver::SCHOOL_HEAD);
        }

        if (Schema::hasTable('roles') && Schema::hasTable('model_has_roles')) {
            $roleId = DB::table('roles')
                ->where('name', UserRoleResolver::SCHOOL_HEAD)
                ->value('id');

            if ($roleId === null) {
                return $query->whereRaw('1 = 0');
            }

            $userIds = DB::table('model_has_roles')
                ->where('role_id', $roleId)
                ->where('model_type', 'App\\Models\\User')
                ->pluck('model_id')
                ->map(static fn (mixed $id): int => (int) $id)
                ->values()
                ->all();

            if ($userIds === []) {
                return $query->whereRaw('1 = 0');
            }

            return $query->whereIn('id', $userIds);
        }

        return $query->whereRaw('1 = 0');
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function collectSchoolHeadNullSchoolIds(): array
    {
        return $this->schoolHeadUserQuery()
            ->whereNull('school_id')
            ->orderBy('id')
            ->limit(25)
            ->get(['id', 'email'])
            ->map(static fn (object $row): array => [
                'user_id' => (int) $row->id,
                'email' => (string) ($row->email ?? ''),
            ])
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function collectSchoolHeadOrphanSchoolIds(): array
    {
        return $this->schoolHeadUserQuery()
            ->leftJoin('schools', 'schools.id', '=', 'users.school_id')
            ->whereNotNull('users.school_id')
            ->whereNull('schools.id')
            ->orderBy('users.id')
            ->limit(25)
            ->get(['users.id', 'users.email', 'users.school_id'])
            ->map(static fn (object $row): array => [
                'user_id' => (int) $row->id,
                'email' => (string) ($row->email ?? ''),
                'school_id' => (int) $row->school_id,
            ])
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function collectDuplicateSchoolHeadAccountsPerSchool(): array
    {
        return $this->schoolHeadUserQuery()
            ->select('school_id', DB::raw('COUNT(*) as total'))
            ->whereNotNull('school_id')
            ->groupBy('school_id')
            ->havingRaw('COUNT(*) > 1')
            ->orderBy('school_id')
            ->limit(25)
            ->get()
            ->map(static fn (object $row): array => [
                'school_id' => (int) $row->school_id,
                'total' => (int) $row->total,
            ])
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function collectIndicatorSubmissionNullSchoolIds(): array
    {
        return DB::table('indicator_submissions')
            ->whereNull('school_id')
            ->orderBy('id')
            ->limit(25)
            ->get(['id', 'academic_year_id', 'status'])
            ->map(static fn (object $row): array => [
                'submission_id' => (int) $row->id,
                'academic_year_id' => $row->academic_year_id !== null ? (int) $row->academic_year_id : null,
                'status' => (string) ($row->status ?? ''),
            ])
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function collectIndicatorSubmissionOrphanSchoolIds(): array
    {
        return DB::table('indicator_submissions')
            ->leftJoin('schools', 'schools.id', '=', 'indicator_submissions.school_id')
            ->whereNotNull('indicator_submissions.school_id')
            ->whereNull('schools.id')
            ->orderBy('indicator_submissions.id')
            ->limit(25)
            ->get(['indicator_submissions.id', 'indicator_submissions.school_id', 'indicator_submissions.academic_year_id', 'indicator_submissions.status'])
            ->map(static fn (object $row): array => [
                'submission_id' => (int) $row->id,
                'school_id' => (int) $row->school_id,
                'academic_year_id' => $row->academic_year_id !== null ? (int) $row->academic_year_id : null,
                'status' => (string) ($row->status ?? ''),
            ])
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function collectIndicatorSubmissionOrphanAcademicYearIds(): array
    {
        return DB::table('indicator_submissions')
            ->leftJoin('academic_years', 'academic_years.id', '=', 'indicator_submissions.academic_year_id')
            ->whereNull('academic_years.id')
            ->orderBy('indicator_submissions.id')
            ->limit(25)
            ->get(['indicator_submissions.id', 'indicator_submissions.school_id', 'indicator_submissions.academic_year_id', 'indicator_submissions.status'])
            ->map(static fn (object $row): array => [
                'submission_id' => (int) $row->id,
                'school_id' => $row->school_id !== null ? (int) $row->school_id : null,
                'academic_year_id' => $row->academic_year_id !== null ? (int) $row->academic_year_id : null,
                'status' => (string) ($row->status ?? ''),
            ])
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function collectDuplicateMutableSubmissions(): array
    {
        $mutableStatuses = [
            FormSubmissionStatus::DRAFT->value,
            FormSubmissionStatus::RETURNED->value,
        ];

        return DB::table('indicator_submissions')
            ->select(
                'school_id',
                'academic_year_id',
                'reporting_period',
                DB::raw('COUNT(*) as total')
            )
            ->whereIn('status', $mutableStatuses)
            ->groupBy('school_id', 'academic_year_id', 'reporting_period')
            ->havingRaw('COUNT(*) > 1')
            ->orderBy('school_id')
            ->orderBy('academic_year_id')
            ->orderBy('reporting_period')
            ->limit(25)
            ->get()
            ->map(static fn (object $row): array => [
                'school_id' => $row->school_id !== null ? (int) $row->school_id : null,
                'academic_year_id' => $row->academic_year_id !== null ? (int) $row->academic_year_id : null,
                'reporting_period' => $row->reporting_period,
                'total' => (int) $row->total,
            ])
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function collectFinalizedSubmissionsWithoutIndicatorRows(): array
    {
        $finalizedStatuses = [
            FormSubmissionStatus::SUBMITTED->value,
            FormSubmissionStatus::VALIDATED->value,
        ];

        return DB::table('indicator_submissions')
            ->leftJoin('indicator_submission_items', 'indicator_submission_items.indicator_submission_id', '=', 'indicator_submissions.id')
            ->whereIn('indicator_submissions.status', $finalizedStatuses)
            ->groupBy(
                'indicator_submissions.id',
                'indicator_submissions.school_id',
                'indicator_submissions.academic_year_id',
                'indicator_submissions.status'
            )
            ->havingRaw('COUNT(indicator_submission_items.id) = 0')
            ->orderBy('indicator_submissions.id')
            ->limit(25)
            ->get([
                'indicator_submissions.id',
                'indicator_submissions.school_id',
                'indicator_submissions.academic_year_id',
                'indicator_submissions.status',
                DB::raw('COUNT(indicator_submission_items.id) as item_count'),
            ])
            ->map(static fn (object $row): array => [
                'submission_id' => (int) $row->id,
                'school_id' => $row->school_id !== null ? (int) $row->school_id : null,
                'academic_year_id' => $row->academic_year_id !== null ? (int) $row->academic_year_id : null,
                'status' => (string) ($row->status ?? ''),
                'item_count' => (int) $row->item_count,
            ])
            ->all();
    }

    /**
     * @return array{
     *   legacy_core_file_vs_normalized_row_mismatches: list<array<string, mixed>>,
     *   school_type_package_mismatches: list<array<string, mixed>>,
     *   malformed_normalized_file_rows: list<array<string, mixed>>
     * }
     */
    private function collectSubmissionFileAuditAnomalies(
        bool $hasSchoolsTable,
        bool $hasIndicatorSubmissionFilesTable,
    ): array {
        if (! $hasSchoolsTable) {
            return [
                'legacy_core_file_vs_normalized_row_mismatches' => [],
                'school_type_package_mismatches' => [],
                'malformed_normalized_file_rows' => [],
            ];
        }

        $submissions = DB::table('indicator_submissions')
            ->join('schools', 'schools.id', '=', 'indicator_submissions.school_id')
            ->select([
                'indicator_submissions.id',
                'indicator_submissions.school_id',
                'indicator_submissions.academic_year_id',
                'indicator_submissions.bmef_file_path',
                'indicator_submissions.smea_file_path',
                'schools.type as school_type',
            ])
            ->orderBy('indicator_submissions.id')
            ->get();

        $rowsBySubmissionId = collect();
        if ($hasIndicatorSubmissionFilesTable) {
            $rowsBySubmissionId = DB::table('indicator_submission_files')
                ->orderBy('indicator_submission_id')
                ->orderBy('type')
                ->get(['indicator_submission_id', 'type', 'path', 'original_filename'])
                ->groupBy('indicator_submission_id');
        }

        $legacyCoreMismatches = [];
        $schoolTypeMismatches = [];
        $malformedRows = [];

        foreach ($submissions as $submission) {
            $submissionId = (int) $submission->id;
            /** @var Collection<int, object> $normalizedRows */
            $normalizedRows = $rowsBySubmissionId->get($submissionId, collect());
            $normalizedTypes = $normalizedRows
                ->map(static fn (object $row): string => (string) $row->type)
                ->values()
                ->all();
            $schoolType = strtolower(trim((string) ($submission->school_type ?? '')));
            $legacyCoreTypes = array_values(array_filter([
                is_string($submission->bmef_file_path) && trim($submission->bmef_file_path) !== '' ? 'bmef' : null,
                is_string($submission->smea_file_path) && trim($submission->smea_file_path) !== '' ? 'smea' : null,
            ]));

            foreach ($normalizedRows as $row) {
                $type = (string) $row->type;

                if (in_array($type, SubmissionFileDefinition::coreTypes(), true)) {
                    $legacyCoreMismatches[] = [
                        'submission_id' => $submissionId,
                        'type' => $type,
                        'reason' => 'core file type should use legacy submission columns, not normalized rows',
                    ];
                }

                if (trim((string) ($row->path ?? '')) === '') {
                    $malformedRows[] = [
                        'submission_id' => $submissionId,
                        'type' => $type,
                        'reason' => 'normalized submission file row is missing path',
                    ];
                }
            }

            if ($schoolType === 'private' && $legacyCoreTypes !== []) {
                $schoolTypeMismatches[] = [
                    'submission_id' => $submissionId,
                    'school_id' => (int) $submission->school_id,
                    'school_type' => $schoolType,
                    'uploaded_types' => implode(', ', $legacyCoreTypes),
                    'reason' => 'private school submission contains public-only core files',
                ];
            }

            $privateFileTypes = array_values(array_filter(
                $normalizedTypes,
                static fn (string $type): bool => in_array($type, SubmissionFileDefinition::nonCoreTypes(), true),
            ));
            if ($schoolType !== 'private' && $privateFileTypes !== []) {
                $schoolTypeMismatches[] = [
                    'submission_id' => $submissionId,
                    'school_id' => (int) $submission->school_id,
                    'school_type' => $schoolType !== '' ? $schoolType : 'unknown',
                    'uploaded_types' => implode(', ', $privateFileTypes),
                    'reason' => 'public school submission contains private-only FM-QAD files',
                ];
            }
        }

        return [
            'legacy_core_file_vs_normalized_row_mismatches' => array_slice($legacyCoreMismatches, 0, 25),
            'school_type_package_mismatches' => array_slice($schoolTypeMismatches, 0, 25),
            'malformed_normalized_file_rows' => array_slice($malformedRows, 0, 25),
        ];
    }
}
