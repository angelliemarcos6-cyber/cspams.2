<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('account_setup_tokens')) {
            Schema::create('account_setup_tokens', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('issued_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->text('token_hash');
                $table->text('token_secret_ciphertext')->nullable();
                $table->timestamp('expires_at');
                $table->timestamp('expired_at')->nullable();
                $table->timestamp('used_at')->nullable();
                $table->string('issued_ip', 45)->nullable();
                $table->text('issued_user_agent')->nullable();
                $table->string('used_ip', 45)->nullable();
                $table->text('used_user_agent')->nullable();
                $table->string('delivery_status', 32)->nullable();
                $table->text('delivery_message')->nullable();
                $table->timestamp('delivery_last_attempt_at')->nullable();
                $table->timestamps();

                $table->index(['user_id', 'expires_at'], 'account_setup_tokens_user_expiry_index');
                $table->index(['user_id', 'expired_at'], 'account_setup_tokens_user_expired_index');
            });

            return;
        }

        Schema::table('account_setup_tokens', function (Blueprint $table): void {
            if (! Schema::hasColumn('account_setup_tokens', 'token_secret_ciphertext')) {
                $table->text('token_secret_ciphertext')->nullable()->after('token_hash');
            }

            if (! Schema::hasColumn('account_setup_tokens', 'expired_at')) {
                $table->timestamp('expired_at')->nullable()->after('expires_at');
            }

            if (! Schema::hasColumn('account_setup_tokens', 'delivery_status')) {
                $table->string('delivery_status', 32)->nullable()->after('used_user_agent');
            }

            if (! Schema::hasColumn('account_setup_tokens', 'delivery_message')) {
                $table->text('delivery_message')->nullable()->after('delivery_status');
            }

            if (! Schema::hasColumn('account_setup_tokens', 'delivery_last_attempt_at')) {
                $table->timestamp('delivery_last_attempt_at')->nullable()->after('delivery_message');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('account_setup_tokens')) {
            return;
        }

        Schema::table('account_setup_tokens', function (Blueprint $table): void {
            if (Schema::hasColumn('account_setup_tokens', 'delivery_last_attempt_at')) {
                $table->dropColumn('delivery_last_attempt_at');
            }

            if (Schema::hasColumn('account_setup_tokens', 'delivery_message')) {
                $table->dropColumn('delivery_message');
            }

            if (Schema::hasColumn('account_setup_tokens', 'delivery_status')) {
                $table->dropColumn('delivery_status');
            }

            if (Schema::hasColumn('account_setup_tokens', 'expired_at')) {
                $table->dropColumn('expired_at');
            }

            if (Schema::hasColumn('account_setup_tokens', 'token_secret_ciphertext')) {
                $table->dropColumn('token_secret_ciphertext');
            }
        });
    }
};
