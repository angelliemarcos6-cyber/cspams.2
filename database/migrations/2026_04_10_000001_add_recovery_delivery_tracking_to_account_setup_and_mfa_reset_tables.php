<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('account_setup_tokens', function (Blueprint $table): void {
            $table->text('token_secret_ciphertext')->nullable()->after('token_hash');
            $table->timestamp('expired_at')->nullable()->after('expires_at');
            $table->string('delivery_status', 32)->nullable()->after('used_user_agent');
            $table->text('delivery_message')->nullable()->after('delivery_status');
            $table->timestamp('delivery_last_attempt_at')->nullable()->after('delivery_message');

            $table->index(['user_id', 'expired_at'], 'account_setup_tokens_user_expired_index');
        });

        Schema::table('monitor_mfa_reset_tickets', function (Blueprint $table): void {
            $table->text('approval_token_ciphertext')->nullable()->after('approval_token_hash');
            $table->string('delivery_status', 32)->nullable()->after('approval_token_expires_at');
            $table->text('delivery_message')->nullable()->after('delivery_status');
            $table->timestamp('delivery_last_attempt_at')->nullable()->after('delivery_message');
        });
    }

    public function down(): void
    {
        Schema::table('monitor_mfa_reset_tickets', function (Blueprint $table): void {
            $table->dropColumn([
                'approval_token_ciphertext',
                'delivery_status',
                'delivery_message',
                'delivery_last_attempt_at',
            ]);
        });

        Schema::table('account_setup_tokens', function (Blueprint $table): void {
            $table->dropIndex('account_setup_tokens_user_expired_index');
            $table->dropColumn([
                'token_secret_ciphertext',
                'expired_at',
                'delivery_status',
                'delivery_message',
                'delivery_last_attempt_at',
            ]);
        });
    }
};
