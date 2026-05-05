<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class AuthLoginInputNormalizationTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_school_head_login_accepts_role_alias_and_trimmed_school_code(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);

        $response = $this->postJson('/api/auth/login', [
            'role' => 'SCHOOL HEAD',
            'login' => '  ' . $schoolCode . '  ',
            'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
        ]);

        $response->assertStatus(Response::HTTP_OK)
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.schoolCode', $schoolCode);
    }

    public function test_monitor_login_accepts_role_alias_and_trimmed_email(): void
    {
        $this->seed();

        $response = $this->postJson('/api/auth/login', [
            'role' => 'Division Monitor',
            'login' => '  CSPAMSMONITOR@GMAIL.COM  ',
            'password' => $this->demoPasswordForLogin('monitor', 'cspamsmonitor@gmail.com'),
        ]);

        $response->assertStatus(Response::HTTP_OK)
            ->assertJsonPath('user.role', 'monitor')
            ->assertJsonPath('user.email', 'cspamsmonitor@gmail.com');
    }

    public function test_school_head_login_accepts_email_identifier(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        $schoolHead->loadMissing('school');

        $schoolCode = (string) $schoolHead->school?->school_code;
        $this->assertNotSame('', $schoolCode);

        $response = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => '  SCHOOLHEAD1@CSPAMS.LOCAL  ',
            'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
        ]);

        $response->assertStatus(Response::HTTP_OK)
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.email', 'schoolhead1@cspams.local');
    }
}

