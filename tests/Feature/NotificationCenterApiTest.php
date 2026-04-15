<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class NotificationCenterApiTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithSeededCredentials;

    public function test_school_head_can_list_and_mark_notifications_as_read(): void
    {
        $this->seed();

        $monitorToken = $this->loginToken('monitor', 'monitor@cspams.local');

        /** @var School $school */
        $school = School::query()->where('school_code', '900001')->firstOrFail();
        /** @var User $schoolHead */
        $schoolHead = User::query()->where('school_id', $school->id)->firstOrFail();
        $schoolHeadToken = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));

        $this->withToken($monitorToken)->postJson("/api/dashboard/records/{$school->id}/send-reminder", [
            'notes' => 'Test reminder for notifications center.',
        ])->assertOk();

        $listed = $this->withToken($schoolHeadToken)->getJson('/api/notifications');
        $listed->assertOk()
            ->assertJsonPath('meta.unreadCount', fn (int $value): bool => $value >= 1)
            ->assertJsonPath('data.0.eventType', 'reminder_sent');

        $notificationId = (string) $listed->json('data.0.id');

        $marked = $this->withToken($schoolHeadToken)->postJson("/api/notifications/{$notificationId}/read");
        $marked->assertOk()
            ->assertJsonPath('data.id', $notificationId)
            ->assertJsonPath('data.readAt', fn (?string $value): bool => $value !== null);

        $this->withToken($schoolHeadToken)->postJson('/api/notifications/read-all')
            ->assertStatus(Response::HTTP_OK);
    }

    private function loginToken(string $role, string $login): string
    {
        $loginResponse = $this->postJson('/api/auth/login', [
            'role' => $role,
            'login' => $login,
            'password' => $this->demoPasswordForLogin($role, $login),
        ]);

        $loginResponse->assertOk();

        return (string) $loginResponse->json('token');
    }

    private function schoolHeadLogin(User $user): string
    {
        $user->loadMissing('school');

        return (string) $user->school?->school_code;
    }
}
