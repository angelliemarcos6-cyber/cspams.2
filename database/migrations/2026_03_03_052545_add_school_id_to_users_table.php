<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'school_id')) {
                $table->foreignId('school_id')
                ->nullable()
                ->constrained('schools')
                ->nullOnDelete();
                // NOTE: ->after('id') is MySQL-specific-ish; Postgres ignores it.
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'school_id')) {
                $table->dropConstrainedForeignId('school_id');
            }
        });
    }
};
