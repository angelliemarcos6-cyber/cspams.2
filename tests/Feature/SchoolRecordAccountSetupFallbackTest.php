<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class SchoolRecordAccountSetupFallbackTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_school_head_dashboard_records_still_load_when_account_setup_tokens_table_is_missing(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()
            ->with('school')
            ->where('email', 'schoolhead1@cspams.local')
            ->firstOrFail();

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);

        Schema::dropIfExists('account_setup_tokens');

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
        ]);

        $login->assertOk();
        $token = (string) $login->json('token');
        $this->assertNotSame('', $token);

        $records = $this->withToken($token)->getJson('/api/dashboard/records');
        $records->assertOk()
            ->assertJsonPath('meta.scope', 'school');
    }
}
