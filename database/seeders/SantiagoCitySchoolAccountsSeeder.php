<?php

namespace Database\Seeders;

use App\Models\School;
use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\SchoolStatus;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class SantiagoCitySchoolAccountsSeeder extends Seeder
{
    private const DEFAULT_PASSWORD = 'password123';

    public function run(): void
    {
        foreach ($this->schools() as $entry) {
            $school = School::query()->updateOrCreate(
                ['school_code' => $entry['school_code']],
                [
                    'name' => $entry['name'],
                    'district' => $entry['address'],
                    'region' => 'Region II',
                    'type' => $entry['type'],
                    'status' => SchoolStatus::ACTIVE->value,
                    'reported_student_count' => 0,
                    'reported_teacher_count' => 0,
                ],
            );

            $schoolHead = User::query()->updateOrCreate(
                ['email' => $this->schoolHeadEmail($entry['school_code'])],
                [
                    'name' => 'School Head - ' . $entry['name'],
                    'password' => Hash::make(self::DEFAULT_PASSWORD),
                    'school_id' => $school->id,
                ],
            );

            $schoolHead->syncRoles([UserRoleResolver::SCHOOL_HEAD]);

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

    /**
     * @return array<int, array{school_code: string, name: string, address: string, type: string}>
     */
    private function schools(): array
    {
        return [
            ['school_code' => '103811', 'name' => 'Baptista Village Elementary School', 'address' => 'Brgy. Baptista Village, Santiago City', 'type' => 'public'],
            ['school_code' => '103812', 'name' => 'Batal Elementary School', 'address' => 'Brgy. Batal, Santiago City', 'type' => 'public'],
            ['school_code' => '103813', 'name' => 'Divisoria Elementary School', 'address' => 'Brgy. Divisoria, Santiago City', 'type' => 'public'],
            ['school_code' => '103814', 'name' => 'Luna Elementary School', 'address' => 'Brgy. Luna, Santiago City', 'type' => 'public'],
            ['school_code' => '103815', 'name' => 'Mabini Elementary School', 'address' => 'Brgy. Mabini, Santiago City', 'type' => 'public'],
            ['school_code' => '103816', 'name' => 'Malini Elementary School', 'address' => 'Brgy. Malini, Santiago City', 'type' => 'public'],
            ['school_code' => '103818', 'name' => 'Naggasican Elementary School', 'address' => 'Brgy. Naggasican, Santiago City', 'type' => 'public'],
            ['school_code' => '103819', 'name' => 'Sagana Elementary School', 'address' => 'Brgy. Sagana, Santiago City', 'type' => 'public'],
            ['school_code' => '103826', 'name' => 'Cabulay Elementary School', 'address' => 'Brgy. Cabulay, Santiago City', 'type' => 'public'],
            ['school_code' => '103832', 'name' => 'Sinsayon Elementary School', 'address' => 'Brgy. Sinsayon, Santiago City', 'type' => 'public'],
            ['school_code' => '103835', 'name' => 'Baluarte Elementary School', 'address' => 'Brgy. Baluarte, Santiago City', 'type' => 'public'],
            ['school_code' => '103837', 'name' => 'Calaocan Elementary School', 'address' => 'Brgy. Calaocan, Santiago City', 'type' => 'public'],
            ['school_code' => '103838', 'name' => 'Rosario Elementary School', 'address' => 'Brgy. Rosario, Santiago City', 'type' => 'public'],
            ['school_code' => '502696', 'name' => 'Santiago North Central School - Integrated SPED Center', 'address' => 'R.C. Miranda Road, Santiago City', 'type' => 'public'],
            ['school_code' => '502550', 'name' => 'Bannawag Norte Integrated School', 'address' => 'Brgy. Bannawag Norte, Santiago City', 'type' => 'public'],

            ['school_code' => '300599', 'name' => 'Santiago City National High School (SICAT)', 'address' => 'Brgy. Calaocan, Santiago City', 'type' => 'public'],
            ['school_code' => '300578', 'name' => 'Rizal National High School', 'address' => 'Gonzaga St., Brgy. Rizal, Santiago City', 'type' => 'public'],
            ['school_code' => '300528', 'name' => 'Divisoria High School', 'address' => 'Brgy. Divisoria, Santiago City', 'type' => 'public'],
            ['school_code' => '325201', 'name' => 'Santiago City National High School - Sinsayon Extension', 'address' => 'Brgy. Sinsayon, Santiago City', 'type' => 'public'],
            ['school_code' => '325202', 'name' => 'Santiago City National High School - Sagana Extension', 'address' => 'Brgy. Sagana, Santiago City', 'type' => 'public'],
            ['school_code' => '325203', 'name' => 'Santiago City National High School - Rosario Extension', 'address' => 'Brgy. Rosario, Santiago City', 'type' => 'public'],
            ['school_code' => 'TBD-CABULAY-NHS', 'name' => 'Cabulay National High School', 'address' => 'Brgy. Cabulay, Santiago City', 'type' => 'public'],
            ['school_code' => 'TBD-PATUL-EXT-HS', 'name' => 'Patul Extension High School', 'address' => 'Brgy. Patul, Santiago City', 'type' => 'public'],
            ['school_code' => 'TBD-SANTIAGO-WEST-HS', 'name' => 'Santiago West High School', 'address' => 'Santiago City', 'type' => 'public'],

            ['school_code' => 'PRV-CFSI', 'name' => 'Children First School Inc.', 'address' => 'Santiago City', 'type' => 'private'],
            ['school_code' => 'PRV-SCI', 'name' => 'Santiago Cultural Institute', 'address' => 'Santiago City', 'type' => 'private'],
            ['school_code' => 'PRV-SCBBLC', 'name' => 'Santiago Community Baptist Bible Learning Center', 'address' => 'Santiago City', 'type' => 'private'],
            ['school_code' => 'PRV-IJMS', 'name' => 'Infant Jesus Montessori School', 'address' => 'Santiago City', 'type' => 'private'],
        ];
    }
}

