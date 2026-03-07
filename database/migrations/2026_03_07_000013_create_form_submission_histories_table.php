<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('form_submission_histories', function (Blueprint $table): void {
            $table->id();
            $table->string('form_type')->index();
            $table->unsignedBigInteger('submission_id')->index();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->string('action')->index();
            $table->string('from_status')->nullable();
            $table->string('to_status');
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['form_type', 'submission_id', 'created_at'], 'form_history_lookup_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('form_submission_histories');
    }
};
