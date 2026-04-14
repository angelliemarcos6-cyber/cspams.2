<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('verified_by_user_id')
                ->nullable()
                ->after('account_status')
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamp('verified_at')
                ->nullable()
                ->after('verified_by_user_id');
            $table->text('verification_notes')
                ->nullable()
                ->after('verified_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('verified_by_user_id');
            $table->dropColumn([
                'verified_at',
                'verification_notes',
            ]);
        });
    }
};
