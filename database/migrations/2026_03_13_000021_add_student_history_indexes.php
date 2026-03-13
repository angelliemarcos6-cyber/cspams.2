<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('student_status_logs', function (Blueprint $table): void {
            $table->index(
                ['student_id', 'changed_at', 'id'],
                'student_status_logs_student_changed_id_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::table('student_status_logs', function (Blueprint $table): void {
            $table->dropIndex('student_status_logs_student_changed_id_idx');
        });
    }
};
