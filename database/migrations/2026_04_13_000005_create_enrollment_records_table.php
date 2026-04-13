<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('enrollment_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_year_id')->constrained();

            // Numbers reported by school head
            $table->integer('total_enrolled');
            $table->integer('dropouts')->default(0);
            $table->integer('transferees_in')->default(0);
            $table->integer('transferees_out')->default(0);
            $table->integer('completers')->default(0);
            $table->integer('retained')->default(0);

            // Computed values (auto-calculated on save)
            $table->decimal('retention_rate', 5, 2)->nullable();
            $table->decimal('dropout_rate', 5, 2)->nullable();

            // Submission tracking
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('submitted_by')->nullable()->constrained('users');

            $table->timestamps();

            $table->unique(['school_id', 'academic_year_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('enrollment_records');
    }
};
