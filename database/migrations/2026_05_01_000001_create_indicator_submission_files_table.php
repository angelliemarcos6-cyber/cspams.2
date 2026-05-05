<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('indicator_submission_files', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('indicator_submission_id')
                ->constrained('indicator_submissions')
                ->cascadeOnDelete();
            $table->string('type', 64);
            $table->string('path');
            $table->string('original_filename')->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->timestamp('uploaded_at')->nullable();
            $table->timestamps();

            $table->unique(['indicator_submission_id', 'type'], 'indicator_submission_files_submission_type_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('indicator_submission_files');
    }
};
