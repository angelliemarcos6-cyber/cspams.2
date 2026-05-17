<?php

namespace Tests\Feature;

use App\Support\Auth\UserRoleResolver;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SchoolHeadDataIntegrityAuditTest extends TestCase
{
    public function test_school_head_data_integrity_audit_passes_when_no_anomalies_exist(): void
    {
        $this->withIntegrityAuditDatabase(function (): void {
            DB::table('schools')->insert([
                ['id' => 10, 'school_code' => '401777', 'name' => 'AMA CC', 'type' => 'private'],
            ]);
            DB::table('academic_years')->insert([
                ['id' => 7, 'name' => '2025-2026'],
            ]);
            DB::table('users')->insert([
                ['id' => 1, 'school_id' => 10, 'account_type' => UserRoleResolver::SCHOOL_HEAD, 'email' => 'head@example.test'],
            ]);
            DB::table('indicator_submissions')->insert([
                [
                    'id' => 100,
                    'school_id' => 10,
                    'academic_year_id' => 7,
                    'reporting_period' => 'ANNUAL',
                    'version' => 1,
                    'status' => 'submitted',
                    'submitted_at' => '2026-05-17 01:00:00',
                    'updated_at' => '2026-05-17 01:00:00',
                    'bmef_file_path' => null,
                    'smea_file_path' => null,
                ],
            ]);
            DB::table('indicator_submission_items')->insert([
                ['indicator_submission_id' => 100],
            ]);
            DB::table('indicator_submission_files')->insert([
                [
                    'indicator_submission_id' => 100,
                    'type' => 'fm_qad_001',
                    'path' => 'uploads/fm-qad-001.pdf',
                    'original_filename' => 'fm-qad-001.pdf',
                ],
            ]);

            $this->artisan('indicators:audit-school-head-data-integrity')
                ->expectsOutputToContain('school_head_null_school_ids: OK')
                ->expectsOutputToContain('duplicate_mutable_submissions: OK')
                ->expectsOutputToContain('No School Head data-integrity anomalies detected.')
                ->assertSuccessful();
        });
    }

    public function test_school_head_data_integrity_audit_reports_ownership_and_submission_anomalies(): void
    {
        $this->withIntegrityAuditDatabase(function (): void {
            DB::table('schools')->insert([
                ['id' => 10, 'school_code' => '401777', 'name' => 'AMA CC', 'type' => 'public'],
                ['id' => 11, 'school_code' => '500001', 'name' => 'Private Academy', 'type' => 'private'],
            ]);
            DB::table('academic_years')->insert([
                ['id' => 7, 'name' => '2025-2026'],
            ]);

            DB::table('users')->insert([
                ['id' => 1, 'school_id' => null, 'account_type' => UserRoleResolver::SCHOOL_HEAD, 'email' => 'null-school@example.test'],
                ['id' => 2, 'school_id' => 999, 'account_type' => UserRoleResolver::SCHOOL_HEAD, 'email' => 'orphan-school@example.test'],
                ['id' => 3, 'school_id' => 10, 'account_type' => UserRoleResolver::SCHOOL_HEAD, 'email' => 'dup-one@example.test'],
                ['id' => 4, 'school_id' => 10, 'account_type' => UserRoleResolver::SCHOOL_HEAD, 'email' => 'dup-two@example.test'],
            ]);

            DB::table('indicator_submissions')->insert([
                [
                    'id' => 100,
                    'school_id' => 10,
                    'academic_year_id' => 7,
                    'reporting_period' => 'ANNUAL',
                    'version' => 1,
                    'status' => 'draft',
                    'submitted_at' => null,
                    'reviewed_at' => null,
                    'updated_at' => '2026-05-17 01:00:00',
                    'bmef_file_path' => null,
                    'smea_file_path' => null,
                ],
                [
                    'id' => 101,
                    'school_id' => 10,
                    'academic_year_id' => 7,
                    'reporting_period' => 'ANNUAL',
                    'version' => 2,
                    'status' => 'returned',
                    'submitted_at' => null,
                    'reviewed_at' => null,
                    'updated_at' => '2026-05-17 02:00:00',
                    'bmef_file_path' => null,
                    'smea_file_path' => null,
                ],
                [
                    'id' => 102,
                    'school_id' => 10,
                    'academic_year_id' => 7,
                    'reporting_period' => 'ANNUAL',
                    'version' => 3,
                    'status' => 'submitted',
                    'submitted_at' => '2026-05-17 03:00:00',
                    'reviewed_at' => null,
                    'updated_at' => '2026-05-17 03:00:00',
                    'bmef_file_path' => null,
                    'smea_file_path' => null,
                ],
                [
                    'id' => 103,
                    'school_id' => 11,
                    'academic_year_id' => 7,
                    'reporting_period' => 'ANNUAL',
                    'version' => 1,
                    'status' => 'submitted',
                    'submitted_at' => '2026-05-17 04:00:00',
                    'reviewed_at' => null,
                    'updated_at' => '2026-05-17 04:00:00',
                    'bmef_file_path' => 'legacy/bmef.pdf',
                    'smea_file_path' => null,
                ],
                [
                    'id' => 104,
                    'school_id' => 10,
                    'academic_year_id' => 999,
                    'reporting_period' => 'ANNUAL',
                    'version' => 1,
                    'status' => 'submitted',
                    'submitted_at' => '2026-05-17 05:00:00',
                    'reviewed_at' => null,
                    'updated_at' => '2026-05-17 05:00:00',
                    'bmef_file_path' => null,
                    'smea_file_path' => null,
                ],
            ]);

            DB::table('indicator_submission_files')->insert([
                [
                    'indicator_submission_id' => 102,
                    'type' => 'fm_qad_001',
                    'path' => 'uploads/fm-qad-001.pdf',
                    'original_filename' => 'fm-qad-001.pdf',
                ],
                [
                    'indicator_submission_id' => 102,
                    'type' => 'bmef',
                    'path' => '',
                    'original_filename' => 'bmef.pdf',
                ],
            ]);

            $this->artisan('indicators:audit-school-head-data-integrity')
                ->expectsOutputToContain('school_head_null_school_ids: 1 issue(s)')
                ->expectsOutputToContain('school_head_orphan_school_ids: 1 issue(s)')
                ->expectsOutputToContain('duplicate_school_head_accounts_per_school: 1 issue(s)')
                ->expectsOutputToContain('duplicate_mutable_submissions: 1 issue(s)')
                ->expectsOutputToContain('finalized_submissions_without_indicator_rows: 3 issue(s)')
                ->expectsOutputToContain('school_type_package_mismatches: 2 issue(s)')
                ->expectsOutputToContain('legacy_core_file_vs_normalized_row_mismatches: 1 issue(s)')
                ->expectsOutputToContain('malformed_normalized_file_rows: 1 issue(s)')
                ->expectsOutputToContain('indicator_submissions_orphan_academic_year_ids: 1 issue(s)')
                ->expectsOutputToContain('School Head data-integrity anomalies detected.')
                ->assertExitCode(1);
        });
    }

    private function withIntegrityAuditDatabase(callable $callback): void
    {
        $originalDefault = (string) config('database.default');

        config([
            'database.connections.integrity_audit_test' => [
                'driver' => 'sqlite',
                'database' => ':memory:',
                'prefix' => '',
                'foreign_key_constraints' => false,
            ],
            'database.default' => 'integrity_audit_test',
        ]);

        DB::setDefaultConnection('integrity_audit_test');
        DB::purge('integrity_audit_test');
        DB::reconnect('integrity_audit_test');

        Schema::connection('integrity_audit_test')->create('schools', static function (Blueprint $table): void {
            $table->increments('id');
            $table->string('school_code')->nullable();
            $table->string('name')->nullable();
            $table->string('type')->nullable();
        });

        Schema::connection('integrity_audit_test')->create('academic_years', static function (Blueprint $table): void {
            $table->increments('id');
            $table->string('name')->nullable();
        });

        Schema::connection('integrity_audit_test')->create('users', static function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('school_id')->nullable();
            $table->string('account_type', 32)->nullable();
            $table->string('email')->nullable();
        });

        Schema::connection('integrity_audit_test')->create('indicator_submissions', static function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('school_id')->nullable();
            $table->unsignedInteger('academic_year_id')->nullable();
            $table->string('reporting_period')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->string('status')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->string('bmef_file_path')->nullable();
            $table->string('smea_file_path')->nullable();
        });

        Schema::connection('integrity_audit_test')->create('indicator_submission_items', static function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('indicator_submission_id')->nullable();
        });

        Schema::connection('integrity_audit_test')->create('indicator_submission_files', static function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedInteger('indicator_submission_id')->nullable();
            $table->string('type', 64);
            $table->string('path')->nullable();
            $table->string('original_filename')->nullable();
        });

        try {
            $callback();
        } finally {
            config(['database.default' => $originalDefault]);
            DB::setDefaultConnection($originalDefault);
            DB::purge('integrity_audit_test');
        }
    }
}
