<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class SqlInjectionGuardTest extends TestCase
{
    use RefreshDatabase;

    public function test_sql_injection_payload_is_blocked_by_api_guard(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => 'SafePassword@2026',
            'probe' => 'UNION SELECT username, password FROM users',
        ]);

        $response->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath('error', 'suspicious_input_detected');
    }

    public function test_normal_payload_is_not_blocked_by_guard(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'normal.user@cspams.local',
            'password' => 'SafePassword@2026',
        ]);

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);
    }
}
