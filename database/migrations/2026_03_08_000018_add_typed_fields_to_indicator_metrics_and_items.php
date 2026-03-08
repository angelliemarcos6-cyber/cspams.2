<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('performance_metrics', function (Blueprint $table): void {
            $table->string('framework', 30)
                ->default('targets_met')
                ->after('category')
                ->index();
            $table->string('data_type', 30)
                ->default('number')
                ->after('framework')
                ->index();
            $table->json('input_schema')
                ->nullable()
                ->after('description');
            $table->string('unit', 30)
                ->nullable()
                ->after('input_schema');
            $table->unsignedInteger('sort_order')
                ->default(0)
                ->after('unit')
                ->index();
        });

        Schema::table('indicator_submission_items', function (Blueprint $table): void {
            $table->json('target_typed_value')
                ->nullable()
                ->after('target_value');
            $table->json('actual_typed_value')
                ->nullable()
                ->after('actual_value');
            $table->string('target_display')
                ->nullable()
                ->after('variance_value');
            $table->string('actual_display')
                ->nullable()
                ->after('target_display');
        });
    }

    public function down(): void
    {
        Schema::table('indicator_submission_items', function (Blueprint $table): void {
            $table->dropColumn([
                'target_typed_value',
                'actual_typed_value',
                'target_display',
                'actual_display',
            ]);
        });

        Schema::table('performance_metrics', function (Blueprint $table): void {
            $table->dropIndex(['framework']);
            $table->dropIndex(['data_type']);
            $table->dropIndex(['sort_order']);
            $table->dropColumn([
                'framework',
                'data_type',
                'input_schema',
                'unit',
                'sort_order',
            ]);
        });
    }
};
