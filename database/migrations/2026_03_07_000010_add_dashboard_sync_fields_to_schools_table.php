<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schools', function (Blueprint $table): void {
            $table->unsignedInteger('reported_student_count')
                ->default(0)
                ->after('status');
            $table->unsignedInteger('reported_teacher_count')
                ->default(0)
                ->after('reported_student_count');
            $table->foreignId('submitted_by')
                ->nullable()
                ->after('reported_teacher_count')
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamp('submitted_at')
                ->nullable()
                ->after('submitted_by');
        });
    }

    public function down(): void
    {
        Schema::table('schools', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('submitted_by');
            $table->dropColumn('submitted_at');
            $table->dropColumn('reported_teacher_count');
            $table->dropColumn('reported_student_count');
        });
    }
};
