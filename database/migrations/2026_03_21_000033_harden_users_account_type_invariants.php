<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('users') || ! Schema::hasColumn('users', 'account_type')) {
            return;
        }

        $this->assertNoDuplicateSchoolLinkedAccounts();

        DB::table('users')
            ->whereNotNull('school_id')
            ->where(function ($query): void {
                $query->whereNull('account_type')
                    ->orWhere('account_type', '<>', 'school_head');
            })
            ->update(['account_type' => 'school_head']);

        DB::table('users')
            ->whereNull('account_type')
            ->orWhere('account_type', '')
            ->update(['account_type' => 'monitor']);

        Schema::table('users', function (Blueprint $table): void {
            $table->string('account_type', 32)
                ->default('monitor')
                ->nullable(false)
                ->change();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('users') || ! Schema::hasColumn('users', 'account_type')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->string('account_type', 32)
                ->nullable()
                ->default(null)
                ->change();
        });
    }

    private function assertNoDuplicateSchoolLinkedAccounts(): void
    {
        $duplicateSchoolIds = DB::table('users')
            ->select('school_id')
            ->whereNotNull('school_id')
            ->groupBy('school_id')
            ->havingRaw('COUNT(*) > 1')
            ->limit(10)
            ->pluck('school_id')
            ->filter(static fn (mixed $value): bool => is_scalar($value) && (string) $value !== '')
            ->map(static fn (mixed $value): string => (string) $value)
            ->values();

        if ($duplicateSchoolIds->isNotEmpty()) {
            throw new RuntimeException(
                'Cannot harden account_type invariants. '
                . 'Resolve duplicate school-linked user records first for school_id(s): '
                . $duplicateSchoolIds->implode(', ')
            );
        }
    }
};

