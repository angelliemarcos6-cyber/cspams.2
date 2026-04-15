<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table): void {
            $table->dropUnique('students_lrn_unique');
            $table->unique(['school_id', 'lrn'], 'students_school_lrn_unique');
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table): void {
            $table->dropUnique('students_school_lrn_unique');
            $table->unique('lrn', 'students_lrn_unique');
        });
    }
};
