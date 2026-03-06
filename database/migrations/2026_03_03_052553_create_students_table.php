<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('students', function (Blueprint $table) {
            $table->id();

            $table->foreignId('school_id')
            ->constrained('schools')
            ->restrictOnDelete();

            // LRN is the student's primary identifier (entered by School Head)
            $table->string('lrn', 20)->unique();

            $table->string('last_name');
            $table->string('first_name');
            $table->string('middle_name')->nullable();
            $table->string('sex', 10)->nullable();
            $table->date('birthdate')->nullable();

            // current snapshot (fast filtering in dashboards)
            $table->string('current_status')->default('active'); // active|dropped|transferred|graduated|etc

            $table->foreignId('current_academic_year_id')
            ->nullable()
            ->constrained('academic_years')
            ->nullOnDelete();

            $table->foreignId('current_section_id')
            ->nullable()
            ->constrained('sections')
            ->nullOnDelete();

            $table->timestamps();

            $table->index(['school_id', 'current_status']);
            $table->index(['school_id', 'current_academic_year_id']);
            $table->index(['school_id', 'current_section_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('students');
    }
};
