<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('delete_record_flagged_at')->nullable()->after('flagged_reason');
            $table->foreignId('delete_record_flagged_by_user_id')
                ->nullable()
                ->after('delete_record_flagged_at')
                ->constrained('users')
                ->nullOnDelete();
            $table->text('delete_record_flag_reason')->nullable()->after('delete_record_flagged_by_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('delete_record_flagged_by_user_id');
            $table->dropColumn([
                'delete_record_flagged_at',
                'delete_record_flag_reason',
            ]);
        });
    }
};

