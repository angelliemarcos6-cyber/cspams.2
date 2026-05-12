<?php

use App\Providers\AppServiceProvider;
use App\Support\Auth\UserRoleResolver;
use App\Support\Indicators\RollingIndicatorYearWindow;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Schema;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('cspams:sync-rolling-years', function (): int {
    $result = app(RollingIndicatorYearWindow::class)->sync();

    $this->info('Indicator school-year window synchronized.');
    $this->line('Years: ' . implode(', ', $result['years']));
    $this->line('Metric schemas updated: ' . $result['metricsUpdated']);
    $this->line('Submission matrix rows pruned: ' . $result['itemsUpdated']);
    return self::SUCCESS;
})->purpose('Synchronize rolling academic-year windows and purge out-of-window indicator data.');

Artisan::command('indicators:sync-year-window', function (): int {
    return $this->call('cspams:sync-rolling-years');
})->purpose('Alias for cspams:sync-rolling-years.');

Schedule::command('cspams:sync-rolling-years')
    ->dailyAt('00:05');

Artisan::command('accounts:sync-school-head-account-type', function (): void {
    if (! Schema::hasTable('users') || ! Schema::hasColumn('users', 'account_type')) {
        $this->error('School Head account_type storage is unavailable. Run database migrations first.');
        return;
    }

    if (! Schema::hasTable('roles') || ! Schema::hasTable('model_has_roles')) {
        $this->error('Role tables are unavailable. Run database migrations first.');
        return;
    }

    $roleId = DB::table('roles')
        ->where('name', UserRoleResolver::SCHOOL_HEAD)
        ->value('id');

    if ($roleId === null) {
        $this->warn('No school_head role found. Seed roles and permissions first.');
        return;
    }

    $userIds = DB::table('model_has_roles')
        ->where('role_id', $roleId)
        ->where('model_type', 'App\\Models\\User')
        ->pluck('model_id')
        ->map(static fn (mixed $id): int => (int) $id)
        ->values()
        ->all();

    if ($userIds === []) {
        $this->info('No School Head users found. Nothing to update.');
        return;
    }

    $duplicateSchoolIds = DB::table('users')
        ->select('school_id')
        ->whereIn('id', $userIds)
        ->whereNotNull('school_id')
        ->groupBy('school_id')
        ->havingRaw('COUNT(*) > 1')
        ->limit(10)
        ->pluck('school_id')
        ->filter(static fn (mixed $value): bool => is_scalar($value) && (string) $value !== '')
        ->map(static fn (mixed $value): string => (string) $value)
        ->values();

    if ($duplicateSchoolIds->isNotEmpty()) {
        $this->error(
            'Duplicate School Head role assignments detected for school_id(s): '
            . $duplicateSchoolIds->implode(', ')
        );
        $this->line('Resolve duplicates first, then re-run this command.');
        return;
    }

    $updated = DB::table('users')
        ->whereIn('id', $userIds)
        ->update(['account_type' => UserRoleResolver::SCHOOL_HEAD]);

    $this->info('School Head account_type synchronized.');
    $this->line('Updated users: ' . $updated);
})->purpose('Backfill users.account_type for School Head accounts based on role assignments.');

Artisan::command('accounts:audit-school-head-duplicates', function (): int {
    if (! Schema::hasTable('users') || ! Schema::hasColumn('users', 'school_id')) {
        $this->error('School Head account storage is unavailable. Run database migrations first.');
        return self::FAILURE;
    }

    $query = DB::table('users')
        ->select('school_id', DB::raw('COUNT(*) as total'))
        ->whereNotNull('school_id')
        ->groupBy('school_id')
        ->havingRaw('COUNT(*) > 1');

    if (Schema::hasColumn('users', 'account_type')) {
        $query->where('account_type', UserRoleResolver::SCHOOL_HEAD);
    } elseif (Schema::hasTable('roles') && Schema::hasTable('model_has_roles')) {
        $roleId = DB::table('roles')
            ->where('name', UserRoleResolver::SCHOOL_HEAD)
            ->value('id');

        if ($roleId === null) {
            $this->warn('No school_head role found. Seed roles and permissions first.');
            return self::FAILURE;
        }

        $userIds = DB::table('model_has_roles')
            ->where('role_id', $roleId)
            ->where('model_type', 'App\\Models\\User')
            ->pluck('model_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->values()
            ->all();

        if ($userIds === []) {
            $this->info('No School Head users found.');
            return self::SUCCESS;
        }

        $query->whereIn('id', $userIds);
    } else {
        $this->error('Cannot audit School Head duplicates because neither users.account_type nor role tables are available.');
        return self::FAILURE;
    }

    $duplicates = $query
        ->orderBy('school_id')
        ->limit(20)
        ->get();

    if ($duplicates->isEmpty()) {
        $this->info('No duplicate School Head accounts detected.');
        return self::SUCCESS;
    }

    $this->error('Duplicate School Head accounts detected.');

    foreach ($duplicates as $duplicate) {
        $this->line(sprintf(
            '  school_id=%s total=%s',
            (string) $duplicate->school_id,
            (string) $duplicate->total,
        ));
    }

    $this->newLine();
    $this->line('Resolve duplicate School Head records before enforcing one-School-Head-per-school uniqueness.');

    return self::FAILURE;
})->purpose('Audit duplicate School Head accounts grouped by school_id.');

Artisan::command('app:check-production-config', function (): int {
    try {
        app(AppServiceProvider::class)->runProductionConfigurationAudit();
    } catch (\RuntimeException $e) {
        $this->error('Production configuration is UNSAFE:');
        $this->line('  ' . $e->getMessage());
        $this->newLine();
        $this->line('Fix the listed configuration issues and re-run before deploying.');
        return self::FAILURE;
    }

    $this->info('Production configuration looks safe.');

    return self::SUCCESS;
})->purpose('Validate production-safe configuration for the deployed CSPAMS environment.');

Artisan::command('app:check-verification-delivery', function (): int {
    $mailer = strtolower(trim((string) config('mail.default', 'log')));
    $fromAddress = trim((string) config('mail.from.address', ''));
    $testCode = trim((string) config('auth_mfa.monitor.test_code', ''));
    $mfaEnabled = (bool) config('auth_mfa.monitor.enabled', false);
    $configuredQueue = trim((string) config('auth_mfa.monitor.queue_connection', ''));
    $effectiveQueue = strtolower($configuredQueue !== '' ? $configuredQueue : trim((string) config('queue.default', 'database')));
    $issues = [];

    $this->line('Verification delivery status');
    $this->line('  mailer: ' . $mailer);
    $this->line('  mail from: ' . ($fromAddress !== '' ? $fromAddress : '(missing)'));
    $this->line('  monitor MFA enabled: ' . ($mfaEnabled ? 'yes' : 'no'));
    $this->line('  effective queue: ' . $effectiveQueue);
    $this->line('  monitor MFA test code: ' . ($testCode !== '' ? 'configured' : 'empty'));

    if (\App\Support\Mail\MailDelivery::isSimulated()) {
        $issues[] = "MAIL_MAILER='{$mailer}' only simulates delivery.";
    }

    if ($fromAddress === '' || str_ends_with(strtolower($fromAddress), '@example.com')) {
        $issues[] = 'MAIL_FROM_ADDRESS must be a real sender address.';
    }

    if ($testCode !== '') {
        $issues[] = 'CSPAMS_MONITOR_MFA_TEST_CODE must be empty for real verification.';
    }

    if ($mfaEnabled && $effectiveQueue === 'sync') {
        $issues[] = 'QUEUE_CONNECTION must not be sync when monitor MFA email is enabled.';
    }

    if ($mailer === 'resend') {
        $resendKey = trim((string) config('services.resend.key', ''));
        if ($resendKey === '') {
            $issues[] = 'RESEND_KEY (or RESEND_API_KEY) must be configured for MAIL_MAILER=resend.';
        }
    }

    if ($mailer === 'smtp') {
        $host = trim((string) config('mail.mailers.smtp.host', ''));
        $username = trim((string) config('mail.mailers.smtp.username', ''));
        $password = trim((string) config('mail.mailers.smtp.password', ''));

        if ($host === '' || $host === '127.0.0.1') {
            $issues[] = 'MAIL_HOST must be set to a real SMTP host.';
        }

        if ($username === '' || $password === '') {
            $issues[] = 'MAIL_USERNAME and MAIL_PASSWORD must be configured for MAIL_MAILER=smtp.';
        }
    }

    if ($issues === []) {
        $this->newLine();
        $this->info('Verification delivery is configured for real inbox delivery.');
        return self::SUCCESS;
    }

    $this->newLine();
    $this->error('Verification delivery is not production-ready:');
    foreach ($issues as $issue) {
        $this->line('  - ' . $issue);
    }

    return self::FAILURE;
})->purpose('Report whether monitor verification emails are configured for real delivery.');
