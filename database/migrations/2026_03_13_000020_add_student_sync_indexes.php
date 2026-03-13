<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table): void {
            $table->index(['school_id', 'academic_year_id', 'updated_at', 'id'], 'students_scope_year_updated_idx');
            $table->index(['school_id', 'status', 'updated_at', 'id'], 'students_scope_status_updated_idx');
            $table->index(['academic_year_id', 'updated_at', 'id'], 'students_year_updated_idx');
            $table->index(['deleted_at', 'updated_at', 'id'], 'students_deleted_updated_idx');
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table): void {
            $table->dropIndex('students_scope_year_updated_idx');
            $table->dropIndex('students_scope_status_updated_idx');
            $table->dropIndex('students_year_updated_idx');
            $table->dropIndex('students_deleted_updated_idx');
        });
    }
};

