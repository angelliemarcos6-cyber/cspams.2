<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('flagged_at')->nullable()->after('account_status');
            $table->foreignId('flagged_by_user_id')
                ->nullable()
                ->after('flagged_at')
                ->constrained('users')
                ->nullOnDelete();
            $table->text('flagged_reason')->nullable()->after('flagged_by_user_id');
        });

        Schema::create('account_setup_tokens', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('issued_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('token_hash');
            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->string('issued_ip', 45)->nullable();
            $table->text('issued_user_agent')->nullable();
            $table->string('used_ip', 45)->nullable();
            $table->text('used_user_agent')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'expires_at'], 'account_setup_tokens_user_expiry_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_setup_tokens');

        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('flagged_by_user_id');
            $table->dropColumn([
                'flagged_at',
                'flagged_reason',
            ]);
        });
    }
};
