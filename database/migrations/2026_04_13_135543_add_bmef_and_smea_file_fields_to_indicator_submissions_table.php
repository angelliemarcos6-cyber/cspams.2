<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('indicator_submissions', function (Blueprint $table): void {
            if (! Schema::hasColumn('indicator_submissions', 'bmef_file_path')) {
                $table->string('bmef_file_path')->nullable()->index();
            }

            if (! Schema::hasColumn('indicator_submissions', 'bmef_original_filename')) {
                $table->string('bmef_original_filename')->nullable();
            }

            if (! Schema::hasColumn('indicator_submissions', 'bmef_uploaded_at')) {
                $table->timestamp('bmef_uploaded_at')->nullable();
            }

            if (! Schema::hasColumn('indicator_submissions', 'bmef_file_size')) {
                $table->unsignedBigInteger('bmef_file_size')->nullable();
            }

            if (! Schema::hasColumn('indicator_submissions', 'smea_file_path')) {
                $table->string('smea_file_path')->nullable()->index();
            }

            if (! Schema::hasColumn('indicator_submissions', 'smea_original_filename')) {
                $table->string('smea_original_filename')->nullable();
            }

            if (! Schema::hasColumn('indicator_submissions', 'smea_uploaded_at')) {
                $table->timestamp('smea_uploaded_at')->nullable();
            }

            if (! Schema::hasColumn('indicator_submissions', 'smea_file_size')) {
                $table->unsignedBigInteger('smea_file_size')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('indicator_submissions', function (Blueprint $table): void {
            if (Schema::hasColumn('indicator_submissions', 'bmef_file_size')) {
                $table->dropColumn('bmef_file_size');
            }

            if (Schema::hasColumn('indicator_submissions', 'bmef_uploaded_at')) {
                $table->dropColumn('bmef_uploaded_at');
            }

            if (Schema::hasColumn('indicator_submissions', 'bmef_original_filename')) {
                $table->dropColumn('bmef_original_filename');
            }

            if (Schema::hasColumn('indicator_submissions', 'bmef_file_path')) {
                $table->dropColumn('bmef_file_path');
            }

            if (Schema::hasColumn('indicator_submissions', 'smea_file_size')) {
                $table->dropColumn('smea_file_size');
            }

            if (Schema::hasColumn('indicator_submissions', 'smea_uploaded_at')) {
                $table->dropColumn('smea_uploaded_at');
            }

            if (Schema::hasColumn('indicator_submissions', 'smea_original_filename')) {
                $table->dropColumn('smea_original_filename');
            }

            if (Schema::hasColumn('indicator_submissions', 'smea_file_path')) {
                $table->dropColumn('smea_file_path');
            }
        });
    }
};
