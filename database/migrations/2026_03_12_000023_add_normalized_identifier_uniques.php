<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->assertNoCaseInsensitiveDuplicates();

        Schema::table('users', function (Blueprint $table): void {
            $table->string('email_normalized', 255)->default('');
        });

        Schema::table('schools', function (Blueprint $table): void {
            $table->string('school_code_normalized', 255)->default('');
        });

        DB::table('users')->update([
            'email' => DB::raw('LOWER(TRIM(email))'),
            'email_normalized' => DB::raw('LOWER(TRIM(email))'),
        ]);

        DB::table('schools')->update([
            'school_code' => DB::raw('TRIM(school_code)'),
            'school_code_normalized' => DB::raw('LOWER(TRIM(school_code))'),
        ]);

        Schema::table('users', function (Blueprint $table): void {
            $table->unique('email_normalized', 'users_email_normalized_unique');
        });

        Schema::table('schools', function (Blueprint $table): void {
            $table->unique('school_code_normalized', 'schools_school_code_normalized_unique');
        });
    }

    public function down(): void
    {
        Schema::table('schools', function (Blueprint $table): void {
            $table->dropUnique('schools_school_code_normalized_unique');
            $table->dropColumn('school_code_normalized');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique('users_email_normalized_unique');
            $table->dropColumn('email_normalized');
        });
    }

    private function assertNoCaseInsensitiveDuplicates(): void
    {
        $duplicateEmails = DB::table('users')
            ->selectRaw('LOWER(TRIM(email)) as normalized_identifier')
            ->groupByRaw('LOWER(TRIM(email))')
            ->havingRaw('COUNT(*) > 1')
            ->limit(5)
            ->pluck('normalized_identifier')
            ->filter(static fn (mixed $value): bool => is_string($value) && $value !== '')
            ->values();

        if ($duplicateEmails->isNotEmpty()) {
            throw new RuntimeException(
                'Cannot apply case-insensitive unique constraint for users.email. '
                . 'Resolve duplicates first: ' . $duplicateEmails->implode(', ')
            );
        }

        $duplicateSchoolCodes = DB::table('schools')
            ->selectRaw('LOWER(TRIM(school_code)) as normalized_identifier')
            ->groupByRaw('LOWER(TRIM(school_code))')
            ->havingRaw('COUNT(*) > 1')
            ->limit(5)
            ->pluck('normalized_identifier')
            ->filter(static fn (mixed $value): bool => is_string($value) && $value !== '')
            ->values();

        if ($duplicateSchoolCodes->isNotEmpty()) {
            throw new RuntimeException(
                'Cannot apply case-insensitive unique constraint for schools.school_code. '
                . 'Resolve duplicates first: ' . $duplicateSchoolCodes->implode(', ')
            );
        }
    }
};
