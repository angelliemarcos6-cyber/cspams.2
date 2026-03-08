<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class AuthPasswordResetPolicyTest extends TestCase
{
    use RefreshDatabase;

    public function test_school_head_account_marked_for_reset_must_change_password_before_login(): void
    {
        $this->seed();

        $schoolCode = '103811';
        $temporaryPassword = $this->temporaryPasswordForSchoolCode($schoolCode);
        $newPassword = 'NewSchool@2026!';

        $blockedLogin = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $temporaryPassword,
        ]);

        $blockedLogin->assertStatus(Response::HTTP_FORBIDDEN)
            ->assertJsonPath('requiresPasswordReset', true);

        $reset = $this->postJson('/api/auth/reset-required-password', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'current_password' => $temporaryPassword,
            'new_password' => $newPassword,
            'new_password_confirmation' => $newPassword,
        ]);

        $reset->assertOk()
            ->assertJsonPath('user.mustResetPassword', false);

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolCode,
            'password' => $newPassword,
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'school_head')
            ->assertJsonPath('user.mustResetPassword', false);
    }

    private function temporaryPasswordForSchoolCode(string $schoolCode): string
    {
        $appKey = (string) config('app.key');

        if ($appKey === '') {
            return 'invalid-missing-app-key';
        }

        $fingerprint = strtoupper(substr(hash_hmac('sha256', $schoolCode, $appKey), 0, 10));

        return 'Csp@' . $fingerprint . '!';
    }
}
