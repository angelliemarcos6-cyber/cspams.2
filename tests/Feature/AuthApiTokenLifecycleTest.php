<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class AuthApiTokenLifecycleTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_bearer_tokens_include_expiry_metadata_and_refresh_rotation_revokes_old_token(): void
    {
        $this->seed();
        config()->set('sanctum.expiration', 30);
        config()->set('sanctum.refresh_before', 5);

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'monitor')
            ->assertJsonPath('tokenType', 'Bearer');

        $token = (string) $login->json('token');
        $expiresAt = (string) $login->json('expiresAt');
        $refreshAfter = (string) $login->json('refreshAfter');
        $this->assertNotSame('', $token);
        $this->assertNotSame('', $expiresAt);
        $this->assertNotSame('', $refreshAfter);
        $this->assertNotFalse(strtotime($expiresAt));
        $this->assertNotFalse(strtotime($refreshAfter));
        $this->assertLessThan(strtotime($expiresAt), strtotime($refreshAfter));

        $refresh = $this->withToken($token)->postJson('/api/auth/refresh');
        $refresh->assertOk()
            ->assertJsonPath('user.role', 'monitor')
            ->assertJsonPath('tokenType', 'Bearer');

        $newToken = (string) $refresh->json('token');
        $this->assertNotSame('', $newToken);
        $this->assertNotSame($token, $newToken);

        $oldTokenRequest = $this->withToken($token)->getJson('/api/auth/me');
        $oldTokenRequest->assertStatus(Response::HTTP_UNAUTHORIZED);

        $newTokenRequest = $this->withToken($newToken)->getJson('/api/auth/me');
        $newTokenRequest->assertOk()
            ->assertJsonPath('user.role', 'monitor');
    }

    public function test_expired_bearer_tokens_are_rejected_by_protected_routes(): void
    {
        $this->seed();
        config()->set('sanctum.expiration', 1);

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => $this->demoPasswordForLogin('monitor', 'monitor@cspams.local'),
        ]);

        $login->assertOk();
        $token = (string) $login->json('token');
        $this->assertNotSame('', $token);

        $this->travel(2)->minutes();

        $expiredRequest = $this->withToken($token)->getJson('/api/dashboard/records');
        $expiredRequest->assertStatus(Response::HTTP_UNAUTHORIZED);
    }

    public function test_token_refresh_requires_personal_access_token_for_stateful_sessions(): void
    {
        $this->seed();

        $this->actingAs(\App\Models\User::query()->where('email', 'monitor@cspams.local')->firstOrFail());

        $response = $this->postJson('/api/auth/refresh');

        $response
            ->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY)
            ->assertJsonPath('message', 'Token refresh is only available for bearer-token clients.');
    }
}
