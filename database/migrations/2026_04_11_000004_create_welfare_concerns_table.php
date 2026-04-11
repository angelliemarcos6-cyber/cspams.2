<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('welfare_concerns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->foreignId('flagged_by')->constrained('users');
            $table->timestamp('flagged_at')->useCurrent();

            // Student context (no LRN, no name stored)
            $table->string('grade_level'); // e.g., "Grade 5"
            $table->string('section'); // e.g., "Masigasig"

            // Concern categorization
            $table->enum('category', [
                'child_protection',
                'financial_difficulty',
                'dropout_risk',
                'irregular_attendance',
                'family_situation',
                'health_medical',
                'bullying',
                'other',
            ])->default('other');

            // Concern details
            $table->text('description');
            $table->json('metadata')->nullable(); // Store extra fields if needed

            // Status workflow
            $table->enum('status', ['open', 'in_progress', 'resolved'])
                ->default('open');
            $table->timestamp('acknowledged_at')->nullable();
            $table->foreignId('acknowledged_by')->nullable()->constrained('users');
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users');

            // Audit
            $table->timestamps();
            $table->softDeletes();

            // Indices
            $table->index(['school_id', 'status']);
            $table->index('category');
            $table->index('flagged_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('welfare_concerns');
    }
};
