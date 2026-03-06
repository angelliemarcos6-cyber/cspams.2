<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_status_histories', function (Blueprint $table) {
            $table->id();

            $table->foreignId('student_id')
            ->constrained('students')
            ->cascadeOnDelete();

            // Optional context (useful for reporting per year/section)
            $table->foreignId('academic_year_id')
            ->nullable()
            ->constrained('academic_years')
            ->nullOnDelete();

            $table->foreignId('section_id')
            ->nullable()
            ->constrained('sections')
            ->nullOnDelete();

            // Audit-style status change
            $table->string('from_status')->nullable();
            $table->string('to_status');

            // Who changed it (optional)
            $table->foreignId('changed_by')
            ->nullable()
            ->constrained('users')
            ->nullOnDelete();

            // When it changed (timezone-aware)
            $table->timestampTz('changed_at')->useCurrent();

            // Optional notes/reason
            $table->text('notes')->nullable();

            // Keep timestamps consistent with changed_at timezone
            $table->timestampsTz();

            // Indexes
            $table->index(['student_id', 'changed_at']);
            $table->index(['student_id', 'academic_year_id']);
            $table->index(['student_id', 'section_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_status_histories');
    }
};
