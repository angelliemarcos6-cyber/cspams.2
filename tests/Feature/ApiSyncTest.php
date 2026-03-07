<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class ApiSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_monitor_login_and_conditional_sync_work(): void
    {
        $this->seed();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'monitor',
            'login' => 'monitor@cspams.local',
            'password' => 'password123',
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'monitor');

        $token = (string) $login->json('token');
        $this->assertNotSame('', $token);

        $records = $this->withToken($token)->getJson('/api/dashboard/records');

        $records->assertOk()
            ->assertJsonPath('meta.scope', 'division')
            ->assertHeader('X-Sync-Scope', 'division');

        $this->assertGreaterThanOrEqual(3, count($records->json('data', [])));

        $etag = (string) $records->headers->get('X-Sync-Etag');
        $this->assertNotSame('', $etag);

        $notModified = $this->withToken($token)
            ->withHeaders(['If-None-Match' => trim($etag, '"')])
            ->getJson('/api/dashboard/records');

        $notModified->assertStatus(Response::HTTP_NOT_MODIFIED)
            ->assertHeader('X-Sync-Scope', 'division');
    }

    public function test_school_head_is_scope_limited_and_cannot_edit_other_schools(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var User $otherHead */
        $otherHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();

        $login = $this->postJson('/api/auth/login', [
            'role' => 'school_head',
            'login' => $schoolHead->email,
            'password' => 'password123',
        ]);

        $login->assertOk()
            ->assertJsonPath('user.role', 'school_head');

        $token = (string) $login->json('token');

        $records = $this->withToken($token)->getJson('/api/dashboard/records');

        $records->assertOk()
            ->assertJsonPath('meta.scope', 'school')
            ->assertHeader('X-Sync-Scope', 'school')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', (string) $schoolHead->school_id);

        $forbidden = $this->withToken($token)->putJson('/api/dashboard/records/' . $otherHead->school_id, [
            'schoolName' => 'Unauthorized Update Attempt',
            'studentCount' => 1200,
            'teacherCount' => 55,
            'region' => 'Region II',
            'status' => 'active',
        ]);

        $forbidden->assertStatus(Response::HTTP_FORBIDDEN);
    }
}
