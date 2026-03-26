<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class AuthApiSmokeTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('auth_mfa.monitor.enabled', true);
        config()->set('auth_mfa.monitor.test_code', '123456');
    }

    public function test_school_head_login_me_and_logout_flow(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->with('school')->firstOrFail();
        $schoolCode = (string) $schoolHead->school?->school_code;

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $this->demoPasswordForLogin('school_head', $schoolCode),
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.schoolCode', $schoolCode)
            ->assertJsonStructure(['token', 'user']);

        $token = (string) $login->json('token');
        $this->assertNotSame('', $token);

        $me = $this->withToken($token)->getJson('/api/auth/me');
        $me->assertOk()
            ->assertJsonPath('user.role', 'school_head');

        $logout = $this->withToken($token)->postJson('/api/auth/logout');
        $logout->assertStatus(Response::HTTP_NO_CONTENT);

        $afterLogout = $this->withToken($token)->getJson('/api/auth/me');
        $afterLogout->assertStatus(Response::HTTP_UNAUTHORIZED);
    }

    public function test_monitor_login_mfa_me_and_logout_flow(): void
    {
        $this->seed();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        ]);

        $login->assertStatus(Response::HTTP_ACCEPTED)
            ->assertJsonPath('requiresMfa', true)
            ->assertJsonPath('mfa.challengeId', fn ($value) => is_string($value) && $value !== '');

        $challengeId = (string) $login->json('mfa.challengeId');

        $verify = $this->postJson('/api/auth/verify-mfa', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'challenge_id' => $challengeId,
            'code' => '123456',
        ]);

        $verify->assertOk()
            ->assertJsonPath('user.role', 'monitor')
            ->assertJsonStructure(['token', 'user']);

        $token = (string) $verify->json('token');
        $this->assertNotSame('', $token);

        $me = $this->withToken($token)->getJson('/api/auth/me');
        $me->assertOk()
            ->assertJsonPath('user.role', 'monitor');

        $logout = $this->withToken($token)->postJson('/api/auth/logout');
        $logout->assertStatus(Response::HTTP_NO_CONTENT);

        $afterLogout = $this->withToken($token)->getJson('/api/auth/me');
        $afterLogout->assertStatus(Response::HTTP_UNAUTHORIZED);
    }
}
