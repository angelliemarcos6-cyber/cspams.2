<?php

namespace Tests\Feature;

use App\Support\Auth\UserRoleResolver;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SchoolHeadOperationalReadinessTest extends TestCase
{
    public function test_duplicate_school_head_audit_reports_duplicate_school_ids(): void
    {
        $this->withAuditDatabase(function (): void {
            DB::table('users')->insert([
                ['school_id' => 42, 'account_type' => UserRoleResolver::SCHOOL_HEAD, 'email' => 'head.one@example.test'],
                ['school_id' => 42, 'account_type' => UserRoleResolver::SCHOOL_HEAD, 'email' => 'head.two@example.test'],
            ]);

            $this->artisan('accounts:audit-school-head-duplicates')
                ->expectsOutputToContain('Duplicate School Head accounts detected.')
                ->expectsOutputToContain('school_id=42 total=2')
                ->assertExitCode(1);
        });
    }

    public function test_duplicate_school_head_audit_passes_when_duplicates_are_absent(): void
    {
        $this->withAuditDatabase(function (): void {
            DB::table('users')->insert([
                ['school_id' => 84, 'account_type' => UserRoleResolver::SCHOOL_HEAD, 'email' => 'single.head@example.test'],
            ]);

            $this->artisan('accounts:audit-school-head-duplicates')
                ->expectsOutputToContain('No duplicate School Head accounts detected.')
                ->assertSuccessful();
        });
    }

    public function test_verification_delivery_check_flags_simulated_mail_and_test_code(): void
    {
        config()->set('mail.default', 'log');
        config()->set('mail.from.address', 'hello@example.com');
        config()->set('auth_mfa.monitor.enabled', true);
        config()->set('auth_mfa.monitor.test_code', '123456');
        config()->set('queue.default', 'database');
        config()->set('auth_mfa.monitor.queue_connection', null);

        $this->artisan('app:check-verification-delivery')
            ->expectsOutputToContain('Verification delivery is not production-ready:')
            ->expectsOutputToContain("MAIL_MAILER='log' only simulates delivery.")
            ->expectsOutputToContain('MAIL_FROM_ADDRESS must be a real sender address.')
            ->expectsOutputToContain('CSPAMS_MONITOR_MFA_TEST_CODE must be empty for real verification.')
            ->assertExitCode(1);
    }

    public function test_verification_delivery_check_passes_for_real_smtp_configuration(): void
    {
        config()->set('mail.default', 'smtp');
        config()->set('mail.from.address', 'no-reply@cspams.local');
        config()->set('mail.mailers.smtp.host', 'smtp.mail.test');
        config()->set('mail.mailers.smtp.username', 'smtp-user');
        config()->set('mail.mailers.smtp.password', 'smtp-pass');
        config()->set('auth_mfa.monitor.enabled', true);
        config()->set('auth_mfa.monitor.test_code', null);
        config()->set('queue.default', 'database');
        config()->set('auth_mfa.monitor.queue_connection', null);

        $this->artisan('app:check-verification-delivery')
            ->expectsOutputToContain('Verification delivery is configured for real inbox delivery.')
            ->assertSuccessful();
    }

    private function withAuditDatabase(callable $callback): void
    {
        $originalDefault = (string) config('database.default');

        config([
            'database.connections.audit_test' => [
                'driver' => 'sqlite',
                'database' => ':memory:',
                'prefix' => '',
                'foreign_key_constraints' => true,
            ],
            'database.default' => 'audit_test',
        ]);

        DB::setDefaultConnection('audit_test');
        DB::purge('audit_test');
        DB::reconnect('audit_test');

        Schema::connection('audit_test')->create('users', static function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedBigInteger('school_id')->nullable();
            $table->string('account_type', 32)->nullable();
            $table->string('email')->nullable();
        });

        try {
            $callback();
        } finally {
            config(['database.default' => $originalDefault]);
            DB::setDefaultConnection($originalDefault);
            DB::purge('audit_test');
        }
    }
}
