<?php

use App\Support\Domain\AccountStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('account_status', 32)
                ->default(AccountStatus::ACTIVE->value)
                ->after('password_changed_at');

            $table->index('account_status', 'users_account_status_index');
        });

        DB::table('users')
            ->whereNull('account_status')
            ->orWhere('account_status', '')
            ->update(['account_status' => AccountStatus::ACTIVE->value]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex('users_account_status_index');
            $table->dropColumn('account_status');
        });
    }
};
