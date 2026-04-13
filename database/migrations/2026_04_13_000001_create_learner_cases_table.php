<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('learner_cases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->foreignId('flagged_by')->constrained('users');
            $table->timestamp('flagged_at')->useCurrent();

            // Learner identifiers
            $table->string('lrn', 12)->nullable();
            $table->string('learner_name')->nullable();

            // Learner context
            $table->string('grade_level');
            $table->string('section');

            // Concern classification
            $table->enum('issue_type', [
                'financial',
                'abuse',
                'health',
                'attendance',
                'academic',
                'other',
            ])->default('other');

            $table->enum('severity', ['low', 'medium', 'high'])->default('low');

            // Case details
            $table->text('description');
            $table->json('metadata')->nullable();

            // Status workflow
            $table->enum('status', ['open', 'monitoring', 'resolved'])->default('open');
            $table->timestamp('acknowledged_at')->nullable();
            $table->foreignId('acknowledged_by')->nullable()->constrained('users');
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users');

            $table->timestamps();
            $table->softDeletes();

            $table->index(['school_id', 'status']);
            $table->index('severity');
            $table->index('issue_type');
            $table->index('flagged_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('learner_cases');
    }
};
