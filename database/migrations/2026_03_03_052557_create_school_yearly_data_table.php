<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('school_yearly_data', function (Blueprint $table) {
            $table->id();

            $table->foreignId('school_id')
            ->constrained('schools')
            ->restrictOnDelete();

            $table->foreignId('academic_year_id')
            ->constrained('academic_years')
            ->restrictOnDelete();

            // flexible payload for TARGETS-MET (Postgres)
            $table->jsonb('targets_met')->default(DB::raw("'{}'::jsonb"));

            $table->string('status')->default('draft'); // draft|submitted|approved
            $table->foreignId('submitted_by')
            ->nullable()
            ->constrained('users')
            ->nullOnDelete();
            $table->timestampTz('submitted_at')->nullable();

            $table->timestamps();

            $table->unique(['school_id', 'academic_year_id'], 'school_yearly_unique');
            $table->index(['academic_year_id', 'school_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('school_yearly_data');
    }
};
