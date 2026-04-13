<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('learner_cases', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('lrn', 20);
            $table->string('name');
            $table->string('grade_section');
            $table->string('issue_type');
            $table->string('severity');
            $table->longText('case_notes');
            $table->string('status');
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index('lrn');
            $table->index('status');
            $table->index('severity');
            $table->index('school_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('learner_cases');
    }
};
