<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\InteractsWithSeededCredentials;
use Tests\TestCase;

class SchoolRecordBulkImportTest extends TestCase
{
    use InteractsWithSeededCredentials;
    use RefreshDatabase;

    public function test_bulk_import_rejects_duplicate_school_codes_in_same_batch(): void
    {
        $this->seed();

        $token = $this->loginToken('monitor', 'monitor@cspams.local');

        $response = $this->withToken($token)->postJson('/api/dashboard/records/bulk-import', [
            'rows' => [
                [
                    'schoolId' => '955551',
                    'schoolName' => 'Duplicate One',
                    'level' => 'Secondary',
                    'type' => 'public',
                    'address' => 'District 1',
                    'district' => 'District A',
                    'region' => 'Region II',
                    'status' => 'active',
                    'studentCount' => 400,
                    'teacherCount' => 20,
                ],
                [
                    'schoolId' => '955551',
                    'schoolName' => 'Duplicate Two',
                    'level' => 'Secondary',
                    'type' => 'public',
                    'address' => 'District 2',
                    'district' => 'District B',
                    'region' => 'Region II',
                    'status' => 'active',
                    'studentCount' => 410,
                    'teacherCount' => 21,
                ],
            ],
        ]);

        $response->assertStatus(Response::HTTP_UNPROCESSABLE_ENTITY);

        $errors = (array) $response->json('errors', []);
        $schoolIdErrorKeys = array_values(array_filter(
            array_keys($errors),
            static fn (string $key): bool => str_starts_with($key, 'rows.') && str_ends_with($key, '.schoolId'),
        ));

        $this->assertNotEmpty($schoolIdErrorKeys);

        $messages = [];
        foreach ($schoolIdErrorKeys as $key) {
            $messages = [...$messages, ...((array) ($errors[$key] ?? []))];
        }

        $this->assertContains('Duplicate school code detected in the import batch.', $messages);
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
}
