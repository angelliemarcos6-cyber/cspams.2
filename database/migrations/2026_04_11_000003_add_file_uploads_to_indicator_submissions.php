<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('indicator_submissions', function (Blueprint $table): void {
            if (!Schema::hasColumn('indicator_submissions', 'form_data')) {
                $table->json('form_data')->nullable()->after('notes');
            }

            if (!Schema::hasColumn('indicator_submissions', 'targets_met_file_path')) {
                $table->string('targets_met_file_path')->nullable()->after('form_data');
            }

            if (!Schema::hasColumn('indicator_submissions', 'targets_met_original_filename')) {
                $table->string('targets_met_original_filename')->nullable();
            }

            if (!Schema::hasColumn('indicator_submissions', 'targets_met_uploaded_at')) {
                $table->timestamp('targets_met_uploaded_at')->nullable();
            }

            if (!Schema::hasColumn('indicator_submissions', 'smea_file_path')) {
                $table->string('smea_file_path')->nullable();
            }

            if (!Schema::hasColumn('indicator_submissions', 'smea_original_filename')) {
                $table->string('smea_original_filename')->nullable();
            }

            if (!Schema::hasColumn('indicator_submissions', 'smea_uploaded_at')) {
                $table->timestamp('smea_uploaded_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('indicator_submissions', function (Blueprint $table): void {
            $columns = [
                'targets_met_file_path',
                'targets_met_original_filename',
                'targets_met_uploaded_at',
                'smea_file_path',
                'smea_original_filename',
                'smea_uploaded_at',
            ];

            $existingColumns = array_values(array_filter(
                $columns,
                static fn (string $column): bool => Schema::hasColumn('indicator_submissions', $column),
            ));

            if ($existingColumns !== []) {
                $table->dropColumn($existingColumns);
            }
        });
    }
};
