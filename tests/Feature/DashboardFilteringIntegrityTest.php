<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class DashboardFilteringIntegrityTest extends TestCase
{
    use RefreshDatabase;
    use InteractsWithSeededCredentials;

    public function test_monitor_student_filters_return_consistent_results(): void
    {
        $this->seed();

        $monitorToken = $this->loginToken('monitor', 'cspamsmonitor@gmail.com');

        $all = $this->withToken($monitorToken)->getJson('/api/dashboard/students');
        $all->assertOk();
        $this->assertNotEmpty($all->json('data'));

        $first = $all->json('data.0');
        $schoolCode = (string) ($first['school']['schoolCode'] ?? '');
        $status = (string) ($first['status'] ?? '');
        $lrn = (string) ($first['lrn'] ?? '');
        $studentId = (string) ($first['id'] ?? '');

        $this->assertNotSame('', $schoolCode);
        $this->assertNotSame('', $status);
        $this->assertNotSame('', $lrn);
        $this->assertNotSame('', $studentId);

        $bySchool = $this->withToken($monitorToken)->getJson('/api/dashboard/students?schoolCode=' . urlencode($schoolCode));
        $bySchool->assertOk();
        foreach ((array) $bySchool->json('data') as $row) {
            $this->assertSame($schoolCode, data_get($row, 'school.schoolCode'));
        }

        $bySchoolAndStatus = $this->withToken($monitorToken)->getJson(
            '/api/dashboard/students?schoolCode=' . urlencode($schoolCode) . '&status=' . urlencode($status),
        );
        $bySchoolAndStatus->assertOk();
        foreach ((array) $bySchoolAndStatus->json('data') as $row) {
            $this->assertSame($schoolCode, data_get($row, 'school.schoolCode'));
            $this->assertSame($status, (string) data_get($row, 'status'));
        }

        $bySearch = $this->withToken($monitorToken)->getJson('/api/dashboard/students?search=' . urlencode($lrn));
        $bySearch->assertOk();
        $foundIds = collect((array) $bySearch->json('data'))->pluck('id')->all();
        $this->assertContains($studentId, $foundIds);
    }

    public function test_school_head_scope_cannot_be_bypassed_by_filter_params(): void
    {
        $this->seed();

        /** @var User $schoolHead */
        $schoolHead = User::query()->where('email', 'schoolhead1@cspams.local')->firstOrFail();
        /** @var User $otherSchoolHead */
        $otherSchoolHead = User::query()->where('email', 'schoolhead2@cspams.local')->firstOrFail();
        $otherSchoolHead->loadMissing('school');

        $token = $this->loginToken('school_head', $this->schoolHeadLogin($schoolHead));
        $otherSchoolCode = (string) $otherSchoolHead->school?->school_code;

        $response = $this->withToken($token)->getJson('/api/dashboard/students?schoolCode=' . urlencode($otherSchoolCode));
        $response->assertStatus(Response::HTTP_OK);

        foreach ((array) $response->json('data') as $row) {
            $this->assertNotSame($otherSchoolCode, data_get($row, 'school.schoolCode'));
        }
    }

    public function test_search_treats_sql_like_wildcards_as_literal_characters(): void
    {
        $this->seed();

        $monitorToken = $this->loginToken('monitor', 'cspamsmonitor@gmail.com');

        $studentResponse = $this->withToken($monitorToken)->getJson('/api/dashboard/students?search=' . urlencode('%'));
        $studentResponse->assertOk()
            ->assertJsonCount(0, 'data');

        $teacherResponse = $this->withToken($monitorToken)->getJson('/api/dashboard/teachers?search=' . urlencode('_'));
        $teacherResponse->assertOk()
            ->assertJsonCount(0, 'data');
    }

    private function loginToken(string $role, string $login): string
    {
        $response = $this->postJson('/api/auth/login', [
            'role' => $role,
            'login' => $login,
            'password' => $this->demoPasswordForLogin($role, $login),
        ]);

        $response->assertOk();

        return (string) $response->json('token');
    }

    private function schoolHeadLogin(User $user): string
    {
        $user->loadMissing('school');

        return (string) $user->school?->school_code;
    }
}

