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
