<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_year_id')->constrained();
            $table->enum('report_type', ['bmef', 'targets_met']);
            $table->enum('status', ['pending', 'submitted', 'approved'])->default('pending');

            // File storage
            $table->text('file_path')->nullable(); // Encrypted path
            $table->string('original_filename')->nullable();
            $table->unsignedBigInteger('file_size')->nullable(); // bytes

            // Submission tracking
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('submitted_by')->nullable()->constrained('users');

            // Approval tracking
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users');

            $table->text('notes')->nullable();

            $table->timestamps();

            $table->unique(['school_id', 'academic_year_id', 'report_type']);
            $table->index(['school_id', 'status']);
            $table->index('report_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_submissions');
    }
};
