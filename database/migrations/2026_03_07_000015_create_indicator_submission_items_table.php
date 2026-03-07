<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('indicator_submission_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('indicator_submission_id')->constrained()->cascadeOnDelete();
            $table->foreignId('performance_metric_id')->constrained()->cascadeOnDelete();
            $table->decimal('target_value', 10, 2);
            $table->decimal('actual_value', 10, 2);
            $table->decimal('variance_value', 10, 2);
            $table->string('compliance_status')->index();
            $table->text('remarks')->nullable();
            $table->timestamps();

            $table->unique(
                ['indicator_submission_id', 'performance_metric_id'],
                'indicator_submission_metric_unique',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('indicator_submission_items');
    }
};
