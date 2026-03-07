<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sf1_submissions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->string('reporting_period')->nullable()->index();
            $table->unsignedInteger('version')->default(1);
            $table->string('status')->default('draft')->index();
            $table->json('payload');
            $table->foreignId('generated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('generated_at')->nullable();
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('validated_at')->nullable();
            $table->text('validation_notes')->nullable();
            $table->timestamps();

            $table->index(['school_id', 'academic_year_id', 'status']);
            $table->index(['school_id', 'academic_year_id', 'reporting_period', 'version'], 'sf1_version_scope_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sf1_submissions');
    }
};
