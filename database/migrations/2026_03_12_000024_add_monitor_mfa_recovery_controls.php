<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->json('mfa_backup_codes')->nullable()->after('password_changed_at');
            $table->timestamp('mfa_backup_codes_generated_at')->nullable()->after('mfa_backup_codes');
        });

        Schema::create('monitor_mfa_reset_tickets', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('requested_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 32)->default('pending')->index();
            $table->text('reason')->nullable();
            $table->text('approval_token_hash')->nullable();
            $table->timestamp('approval_token_expires_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('expires_at');
            $table->string('requested_ip', 45)->nullable();
            $table->text('requested_user_agent')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status'], 'monitor_mfa_reset_tickets_user_status_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monitor_mfa_reset_tickets');

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'mfa_backup_codes',
                'mfa_backup_codes_generated_at',
            ]);
        });
    }
};
