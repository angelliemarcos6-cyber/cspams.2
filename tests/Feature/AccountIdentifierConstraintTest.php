<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AccountIdentifierConstraintTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_email_is_normalized_and_persisted_for_identifier_matching(): void
    {
        $user = User::query()->create([
            'name' => 'Division Monitor',
            'email' => 'Monitor.Account@CSPAMS.local ',
            'password' => Hash::make('password'),
        ]);

        $this->assertSame('monitor.account@cspams.local', $user->email);
        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'email' => 'monitor.account@cspams.local',
            'email_normalized' => 'monitor.account@cspams.local',
        ]);
    }

    public function test_users_email_identifier_is_unique_case_insensitive_at_database_level(): void
    {
        DB::table('users')->insert([
            'name' => 'First Monitor',
            'email' => 'first.cspamsmonitor@gmail.com',
            'email_normalized' => 'first.cspamsmonitor@gmail.com',
            'password' => Hash::make('password'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->expectException(QueryException::class);

        DB::table('users')->insert([
            'name' => 'Second Monitor',
            'email' => 'FIRST.CSPAMSMONITOR@GMAIL.COM',
            'email_normalized' => 'first.cspamsmonitor@gmail.com',
            'password' => Hash::make('password'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_school_code_identifier_is_unique_case_insensitive_at_database_level(): void
    {
        School::query()->create([
            'school_code' => '123456',
            'name' => 'Alpha School',
            'district' => 'District 1',
            'region' => 'Region II',
            'type' => 'public',
            'status' => 'active',
        ]);

        $this->expectException(QueryException::class);

        DB::table('schools')->insert([
            'school_code' => '123456',
            'school_code_normalized' => '123456',
            'name' => 'Beta School',
            'district' => 'District 2',
            'region' => 'Region II',
            'type' => 'public',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}

