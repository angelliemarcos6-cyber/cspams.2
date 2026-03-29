<?php

namespace Database\Seeders;

use App\Models\School;
use App\Models\User;
use App\Support\Auth\SchoolHeadAccountSetupService;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\AccountStatus;
use App\Support\Domain\SchoolStatus;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class SantiagoCitySchoolAccountsSeeder extends Seeder
{
    private ?bool $syncSeedPasswords = null;

    public function run(): void
    {
        /** @var SchoolHeadAccountSetupService $setupService */
        $setupService = app(SchoolHeadAccountSetupService::class);
        $requiresSetupLinkFlow = $this->requiresSetupLinkFlow();

        foreach ($this->schools() as $entry) {
            $school = School::query()->updateOrCreate(
                ['school_code' => $entry['school_code']],
                [
                    'name' => $entry['name'],
                    'level' => $entry['level'],
                    'district' => $entry['address'],
                    'address' => $entry['address'],
                    'region' => 'Santiago City, Isabela',
                    'type' => strtolower($entry['type']),
                    'status' => SchoolStatus::ACTIVE->value,
                    'reported_student_count' => 0,
                    'reported_teacher_count' => 0,
                ],
            );

            $schoolHead = User::query()->firstOrNew(['email' => $this->schoolHeadEmail($entry['school_code'])]);
            $schoolHeadWasRecentlyCreated = ! $schoolHead->exists;
            $shouldRefreshSetup = $schoolHeadWasRecentlyCreated || $this->shouldSyncSeedPasswords();

            $schoolHead->name = 'School Head - ' . $entry['name'];
            $schoolHead->school_id = $school->id;
            $schoolHead->account_type = UserRoleResolver::SCHOOL_HEAD;
            if ($shouldRefreshSetup) {
                $schoolHead->account_status = $requiresSetupLinkFlow
                    ? AccountStatus::PENDING_SETUP->value
                    : AccountStatus::ACTIVE->value;
            }

            if ($shouldRefreshSetup) {
                if ($requiresSetupLinkFlow) {
                    $schoolHead->password = Hash::make(Str::password(40));
                    $schoolHead->must_reset_password = true;
                    $schoolHead->password_changed_at = null;
                    $schoolHead->email_verified_at = null;
                    $schoolHead->verified_by_user_id = null;
                    $schoolHead->verified_at = null;
                    $schoolHead->verification_notes = null;
                } else {
                    $schoolHead->password = Hash::make($this->seedTempPassword());
                    $schoolHead->must_reset_password = false;
                    $schoolHead->password_changed_at = now();
                    $schoolHead->email_verified_at = now();
                    $schoolHead->verified_by_user_id = null;
                    $schoolHead->verified_at = now();
                    $schoolHead->verification_notes = 'Seeded direct-access school head account.';
                }
            }

            $schoolHead->save();
            $schoolHead->syncRoles([UserRoleResolver::SCHOOL_HEAD]);

            if ($shouldRefreshSetup && $requiresSetupLinkFlow) {
                $setupService->issue($schoolHead);
            }

            $school->update([
                'submitted_by' => $schoolHead->id,
                'submitted_at' => now(),
            ]);
        }
    }

    private function schoolHeadEmail(string $schoolCode): string
    {
        $normalized = strtolower((string) preg_replace('/[^a-z0-9]+/i', '-', $schoolCode));
        $normalized = trim($normalized, '-');

        return 'schoolhead.' . $normalized . '@cspams.local';
    }

    private function shouldSyncSeedPasswords(): bool
    {
        if ($this->syncSeedPasswords !== null) {
            return $this->syncSeedPasswords;
        }

        $raw = strtolower(trim((string) env('CSPAMS_SYNC_SEEDED_PASSWORDS', 'true')));
        $this->syncSeedPasswords = ! in_array($raw, ['0', 'false', 'off', 'no'], true);

        return $this->syncSeedPasswords;
    }

    private function requiresSetupLinkFlow(): bool
    {
        if (app()->environment('testing')) {
            return true;
        }

        $raw = strtolower(trim((string) env('CSPAMS_REQUIRE_SETUP_LINK_FOR_SEEDED_SCHOOL_HEADS', 'true')));

        return ! in_array($raw, ['0', 'false', 'off', 'no'], true);
    }

    private function seedTempPassword(): string
    {
        $configured = trim((string) env('CSPAMS_SEED_TEMP_PASSWORD'));
        if ($configured !== '') {
            return $configured;
        }

        $appKey = (string) config('app.key');
        if ($appKey === '') {
            return 'Seed@' . Str::upper(Str::random(10)) . '!';
        }

        $fingerprint = strtoupper(substr(hash_hmac('sha256', 'seed-temp-password', $appKey), 0, 10));

        return 'Seed@' . $fingerprint . '!';
    }

    /**
     * @return array<int, array{school_code: string, name: string, level: string, address: string, type: string}>
     */
    private function schools(): array
    {
        return [
            ['school_code' => '103811', 'name' => 'Baptista Village Elementary School', 'level' => 'Elementary', 'address' => 'Baptista Village, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103812', 'name' => 'Batal Elementary School', 'level' => 'Elementary', 'address' => 'Batal, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103813', 'name' => 'Divisoria Elementary School', 'level' => 'Elementary', 'address' => 'Divisoria, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103814', 'name' => 'Luna Elementary School', 'level' => 'Elementary', 'address' => 'Luna, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103815', 'name' => 'Mabini Elementary School', 'level' => 'Elementary', 'address' => 'Mabini, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103816', 'name' => 'Malini Elementary School', 'level' => 'Elementary', 'address' => 'Malini, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103818', 'name' => 'Naggasican Elementary School', 'level' => 'Elementary', 'address' => 'Naggasican, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103819', 'name' => 'Sagana Elementary School', 'level' => 'Elementary', 'address' => 'Sagana, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103820', 'name' => 'San Andres Elementary School', 'level' => 'Elementary', 'address' => 'San Andres, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103821', 'name' => 'San Isidro Elementary School', 'level' => 'Elementary', 'address' => 'San Isidro, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103822', 'name' => 'Santa Rosa Elementary School', 'level' => 'Elementary', 'address' => 'Santa Rosa, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103823', 'name' => 'Villasis Elementary School', 'level' => 'Elementary', 'address' => 'Villasis, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103824', 'name' => 'Centro East Elementary School', 'level' => 'Elementary', 'address' => 'Centro East, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103825', 'name' => 'Centro West Elementary School', 'level' => 'Elementary', 'address' => 'Centro West, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103826', 'name' => 'Cabulay Elementary School', 'level' => 'Elementary', 'address' => 'Cabulay, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103827', 'name' => 'Dubinan Elementary School', 'level' => 'Elementary', 'address' => 'Dubinan, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103828', 'name' => 'Rosario Elementary School', 'level' => 'Elementary', 'address' => 'Rosario, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103829', 'name' => 'Rizal Elementary School', 'level' => 'Elementary', 'address' => 'Rizal, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103830', 'name' => 'San Jose Elementary School', 'level' => 'Elementary', 'address' => 'San Jose, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103831', 'name' => 'Calaocan Elementary School', 'level' => 'Elementary', 'address' => 'Calaocan, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103832', 'name' => 'Sinsayon Elementary School', 'level' => 'Elementary', 'address' => 'Sinsayon, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103833', 'name' => 'Balintocatoc Elementary School', 'level' => 'Elementary', 'address' => 'Balintocatoc, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103834', 'name' => 'Baluarte Elementary School', 'level' => 'Elementary', 'address' => 'Baluarte, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103835', 'name' => 'Buenavista Elementary School', 'level' => 'Elementary', 'address' => 'Buenavista, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103836', 'name' => 'Mabuhay Elementary School', 'level' => 'Elementary', 'address' => 'Mabuhay, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103837', 'name' => 'Santiago East Central School', 'level' => 'Elementary', 'address' => 'Centro East, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '103838', 'name' => 'Santiago West Central School', 'level' => 'Elementary', 'address' => 'Victory Norte, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '502696', 'name' => 'Santiago North Central School - Integrated SPED Center', 'level' => 'Elementary', 'address' => 'R.C. Miranda Rd, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '300505', 'name' => 'Cabulay High School', 'level' => 'High School', 'address' => 'Cabulay, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '300528', 'name' => 'Divisoria High School', 'level' => 'High School', 'address' => 'Divisoria, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '300578', 'name' => 'Rizal National High School', 'level' => 'High School', 'address' => 'Rizal, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '300599', 'name' => 'Santiago City National High School', 'level' => 'High School', 'address' => 'Rosario, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '325201', 'name' => 'Santiago City National High School - Sinsayon Extension', 'level' => 'High School', 'address' => 'Sinsayon, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '325202', 'name' => 'Santiago City National High School - Sagana Extension', 'level' => 'High School', 'address' => 'Sagana, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '325203', 'name' => 'Santiago City National High School - Rosario Extension', 'level' => 'High School', 'address' => 'Rosario, Santiago City, Isabela', 'type' => 'Public'],
            ['school_code' => '400830', 'name' => 'SISTECH College of Santiago City', 'level' => 'High School', 'address' => 'Santiago City, Isabela', 'type' => 'Private'],
            ['school_code' => '402636', 'name' => 'Sisters of Mary Immaculate School', 'level' => 'High School', 'address' => 'Santiago City, Isabela', 'type' => 'Private'],
        ];
    }
}
