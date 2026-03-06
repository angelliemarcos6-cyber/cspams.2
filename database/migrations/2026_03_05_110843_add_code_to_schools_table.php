<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private string $table = 'schools';
    private string $column = 'code';
    private string $uniqueIndex = 'schools_code_unique';

    public function up(): void
    {
        // 1) Add column if missing
        if (! Schema::hasColumn($this->table, $this->column)) {
            Schema::table($this->table, function (Blueprint $table) {
                // Keep as string for possible leading zeros
                $table->string('code', 20)->nullable();
            });
        }

        // 2) Add unique index if missing
        if (! $this->indexExists($this->table, $this->uniqueIndex)) {
            Schema::table($this->table, function (Blueprint $table) {
                $table->unique($this->column, $this->uniqueIndex);
            });
        }
    }

    public function down(): void
    {
        // Drop unique index (best-effort)
        if ($this->indexExists($this->table, $this->uniqueIndex)) {
            Schema::table($this->table, function (Blueprint $table) {
                $table->dropUnique($this->uniqueIndex);
            });
        }

        // Drop column if it exists
        if (Schema::hasColumn($this->table, $this->column)) {
            Schema::table($this->table, function (Blueprint $table) {
                $table->dropColumn($this->column);
            });
        }
    }

    private function indexExists(string $table, string $indexName): bool
    {
        $driver = DB::getDriverName();

        return match ($driver) {
            // PostgreSQL (your error SQLSTATE[42701] indicates pgsql)
            'pgsql' => (bool) DB::selectOne(
                "select 1 from pg_indexes where schemaname = current_schema() and tablename = ? and indexname = ? limit 1",
                                            [$table, $indexName]
            ),

            // MySQL / MariaDB
            'mysql' => (bool) DB::selectOne(
                "select 1
                from information_schema.statistics
                where table_schema = database()
            and table_name = ?
            and index_name = ?
            limit 1",
            [$table, $indexName]
            ),

            // SQLite
            'sqlite' => collect(DB::select("pragma index_list('$table')"))
            ->contains(fn ($row) => ($row->name ?? null) === $indexName),

            // SQL Server
            'sqlsrv' => (bool) DB::selectOne(
                "select 1
                from sys.indexes i
                join sys.objects o on o.object_id = i.object_id
                where o.name = ? and i.name = ?",
                [$table, $indexName]
            ),

            // Fallback: assume unknown -> not found (migration will try to create)
            default => false,
        };
    }
};
