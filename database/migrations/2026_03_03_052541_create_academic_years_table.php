<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('academic_years', function (Blueprint $table) {
            $table->id();

            $table->string('name')->unique(); // e.g. "2025-2026"
            $table->date('starts_at')->nullable();
            $table->date('ends_at')->nullable();

            $table->boolean('is_current')->default(false);

            $table->timestamps();
        });

        // Postgres: ensure only ONE academic year can be marked current at a time
        // (partial unique index where is_current = true)
        DB::statement("CREATE UNIQUE INDEX academic_years_one_current_idx ON academic_years (is_current) WHERE is_current = true");
    }

    public function down(): void
    {
        // drop index first (safe for postgres)
        DB::statement("DROP INDEX IF EXISTS academic_years_one_current_idx");

        Schema::dropIfExists('academic_years');
    }
};
