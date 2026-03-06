<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sections', function (Blueprint $table) {
            $table->id();

            $table->foreignId('school_id')
            ->constrained('schools')
            ->restrictOnDelete();

            $table->foreignId('academic_year_id')
            ->constrained('academic_years')
            ->restrictOnDelete();

            $table->unsignedSmallInteger('grade_level'); // 1..12
            $table->string('name');                      // e.g. "A", "Einstein", "ICT-11"
            $table->string('track')->nullable();         // SHS strand/track if needed
            $table->string('adviser_name')->nullable();

            $table->timestamps();

            // Prevent duplicate section names within the same school + year + grade
            $table->unique(
                ['school_id', 'academic_year_id', 'grade_level', 'name'],
                'sections_unique_scope'
            );

            $table->index(['school_id', 'academic_year_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sections');
    }
};
