<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_performance_records', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('performance_metric_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_year_id')->constrained()->cascadeOnDelete();
            $table->string('period')->index();
            $table->decimal('value', 8, 2);
            $table->text('remarks')->nullable();
            $table->foreignId('encoded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();

            $table->unique([
                'student_id',
                'performance_metric_id',
                'academic_year_id',
                'period',
            ], 'student_metric_period_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('student_performance_records');
    }
};
