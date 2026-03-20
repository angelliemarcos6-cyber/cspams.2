<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SchoolHeadUniquenessMigrationTest extends TestCase
{
    public function test_uniqueness_migration_fails_with_clear_duplicate_school_ids(): void
    {
        $originalDefault = (string) config('database.default');

        config([
            'database.connections.migration_test' => [
                'driver' => 'sqlite',
                'database' => ':memory:',
                'prefix' => '',
                'foreign_key_constraints' => true,
            ],
            'database.default' => 'migration_test',
        ]);

        DB::setDefaultConnection('migration_test');
        DB::purge('migration_test');
        DB::reconnect('migration_test');

        Schema::connection('migration_test')->create('users', static function (Blueprint $table): void {
            $table->increments('id');
            $table->unsignedBigInteger('school_id')->nullable();
            $table->string('email')->nullable();
        });

        DB::connection('migration_test')->table('users')->insert([
            ['school_id' => 42, 'email' => 'head.one@example.com'],
            ['school_id' => 42, 'email' => 'head.two@example.com'],
        ]);

        $migration = require base_path('database/migrations/2026_03_20_000032_enforce_unique_school_head_per_school.php');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('school_id(s): 42');

        try {
            $migration->up();
        } finally {
            config(['database.default' => $originalDefault]);
            DB::setDefaultConnection($originalDefault);
            DB::purge('migration_test');
        }
    }
}

