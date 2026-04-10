<?php

use App\Models\AccountSetupToken;
use App\Models\AuditLog;
use App\Models\User;
use App\Notifications\SchoolHeadSetupLinkExpiredNotification;
use App\Providers\AppServiceProvider;
use App\Support\Auth\SchoolHeadAccountLifecycleService;
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

Artisan::command('indicators:sync-year-window', function (): void {
    $result = app(RollingIndicatorYearWindow::class)->sync();

    $this->info('Indicator school-year window synchronized.');
    $this->line('Years: ' . implode(', ', $result['years']));
    $this->line('Metric schemas updated: ' . $result['metricsUpdated']);
    $this->line('Submission matrix rows pruned: ' . $result['itemsUpdated']);
})->purpose('Synchronize rolling 5-year indicator matrix window and purge out-of-window values.');

Schedule::command('indicators:sync-year-window')
    ->dailyAt('00:05');

Artisan::command('cspams:expire-setup-links', function (): int {
    if (! Schema::hasTable('account_setup_tokens')) {
        $this->error('Account setup token storage is unavailable. Run database migrations first.');

        return self::FAILURE;
    }

    $now = now();
    $expiredCount = 0;
    $notifiedCount = 0;

    AccountSetupToken::query()
        ->with(['user.school:id,school_code,name', 'issuedBy:id,name,email'])
        ->whereNull('used_at')
        ->whereNull('expired_at')
        ->whereNotNull('expires_at')
        ->where('expires_at', '<=', $now)
        ->orderBy('id')
        ->chunkById(100, function ($tokens) use ($now, &$expiredCount, &$notifiedCount): void {
            foreach ($tokens as $token) {
                /** @var AccountSetupToken $token */
                $token->forceFill([
                    'expired_at' => $now,
                ])->save();

                $schoolName = (string) ($token->user?->school?->name ?? 'Unknown school');
                $schoolCode = (string) ($token->user?->school?->school_code ?? '');
                $schoolHeadEmail = (string) ($token->user?->email ?? '');

                if ($token->issuedBy instanceof User) {
                    $token->issuedBy->notify(
                        new SchoolHeadSetupLinkExpiredNotification(
                            $schoolName,
                            $schoolCode,
                            $schoolHeadEmail,
                        ),
                    );
                    $notifiedCount++;
                }

                AuditLog::query()->create([
                    'user_id' => $token->issued_by_user_id,
                    'action' => 'account.setup_link_expired',
                    'auditable_type' => User::class,
                    'auditable_id' => $token->user_id,
                    'metadata' => [
                        'category' => 'account_management',
                        'outcome' => 'success',
                        'target_user_id' => $token->user_id,
                        'target_email' => $schoolHeadEmail !== '' ? $schoolHeadEmail : null,
                        'target_role' => UserRoleResolver::SCHOOL_HEAD,
                        'school_code' => $schoolCode !== '' ? $schoolCode : null,
                        'school_name' => $schoolName,
                        'setup_token_id' => $token->id,
                        'expires_at' => $token->expires_at?->toISOString(),
                        'expired_at' => $token->expired_at?->toISOString(),
                        'monitor_notified' => $token->issuedBy instanceof User,
                    ],
                    'created_at' => $now,
                ]);

                $expiredCount++;
            }
        });

    $this->info("Expired {$expiredCount} setup link(s).");
    $this->line("Monitors notified: {$notifiedCount}");

    return self::SUCCESS;
})->purpose('Mark expired School Head setup links and notify monitors for reissue follow-up.');

Schedule::command('cspams:expire-setup-links')
    ->dailyAt('00:10');

Artisan::command('accounts:sync-school-head-account-type', function (): void {
    if (! Schema::hasTable('users') || ! Schema::hasColumn('users', 'account_type')) {
        $this->error('School Head account_type storage is unavailable. Run database migrations first.');
        return;
    }

    if (! Schema::hasTable('roles') || ! Schema::hasTable('model_has_roles')) {
        $this->error('Role tables are unavailable. Run database migrations first.');
        return;
    }

    /** @var SchoolHeadAccountLifecycleService $lifecycle */
    $lifecycle = app(SchoolHeadAccountLifecycleService::class);
    $candidates = $lifecycle->schoolHeadCandidatesQuery()
        ->whereNotNull('school_id')
        ->with('roles')
        ->orderBy('id')
        ->get();

    if ($candidates->isEmpty()) {
        $this->info('No School Head users found. Nothing to update.');
        return;
    }

    $duplicateSchoolIds = $candidates
        ->pluck('school_id')
        ->filter(static fn (mixed $value): bool => $value !== null && (string) $value !== '')
        ->countBy()
        ->filter(static fn (int $count): bool => $count > 1)
        ->keys()
        ->map(static fn (mixed $value): string => (string) $value)
        ->values();

    if ($duplicateSchoolIds->isNotEmpty()) {
        $this->warn(
            'Duplicate School Head account candidates detected for school_id(s): '
            . $duplicateSchoolIds->implode(', ')
        );
        $this->line('Those records will be skipped so the repair remains safe.');
    }

    $roleRepairs = 0;
    $accountTypeRepairs = 0;
    $skipped = 0;

    foreach ($candidates as $candidate) {
        /** @var User $candidate */
        if ($duplicateSchoolIds->contains((string) $candidate->school_id)) {
            $skipped++;
            continue;
        }

        $result = $lifecycle->synchronizeSchoolHeadIdentity($candidate);
        if (! $result['supported']) {
            $skipped++;
            continue;
        }

        if ($result['roleRepaired']) {
            $roleRepairs++;
        }

        if ($result['accountTypeRepaired']) {
            $accountTypeRepairs++;
        }
    }

    $this->info('School Head role/account_type markers synchronized.');
    $this->line('Role repairs: ' . $roleRepairs);
    $this->line('account_type repairs: ' . $accountTypeRepairs);
    $this->line('Skipped records: ' . $skipped);
})->purpose('Repair School Head role/account_type drift using role-first synchronization.');

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
