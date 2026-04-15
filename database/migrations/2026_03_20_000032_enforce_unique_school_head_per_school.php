<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'account_type')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->string('account_type', 32)
                    ->nullable()
                    ->after('school_id');
            });
        }

        if (Schema::hasTable('users')) {
            $schoolHeadUserIds = null;
            if (Schema::hasTable('roles') && Schema::hasTable('model_has_roles')) {
                $roleId = DB::table('roles')
                    ->where('name', 'school_head')
                    ->value('id');

                if ($roleId !== null) {
                    $schoolHeadUserIds = DB::table('model_has_roles')
                        ->where('role_id', $roleId)
                        ->where('model_type', 'App\\Models\\User')
                        ->pluck('model_id')
                        ->map(static fn (mixed $id): int => (int) $id)
                        ->values()
                        ->all();
                }
            }

            if (is_array($schoolHeadUserIds) && count($schoolHeadUserIds) > 0) {
                DB::table('users')
                    ->whereIn('id', $schoolHeadUserIds)
                    ->update(['account_type' => 'school_head']);
            } else {
                DB::table('users')
                    ->whereNotNull('school_id')
                    ->update(['account_type' => 'school_head']);
            }
        }

        $this->assertNoDuplicateSchoolHeads();

        Schema::table('users', function (Blueprint $table): void {
            $table->unique(['school_id', 'account_type']);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique(['school_id', 'account_type']);
        });

        if (Schema::hasColumn('users', 'account_type')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropColumn('account_type');
            });
        }
    }

    private function assertNoDuplicateSchoolHeads(): void
    {
        if (! Schema::hasTable('users') || ! Schema::hasColumn('users', 'account_type')) {
            return;
        }

        $duplicateSchoolIds = DB::table('users')
            ->select('school_id')
            ->whereNotNull('school_id')
            ->where('account_type', 'school_head')
            ->groupBy('school_id')
            ->havingRaw('COUNT(*) > 1')
            ->limit(10)
            ->pluck('school_id')
            ->filter(static fn (mixed $value): bool => is_scalar($value) && (string) $value !== '')
            ->map(static fn (mixed $value): string => (string) $value)
            ->values();

        if ($duplicateSchoolIds->isNotEmpty()) {
            throw new RuntimeException(
                'Cannot enforce unique School Head accounts per school. '
                . 'Resolve duplicate School Head records first for school_id(s): '
                . $duplicateSchoolIds->implode(', ')
            );
        }
    }
};
