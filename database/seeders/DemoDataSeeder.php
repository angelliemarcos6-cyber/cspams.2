<?php

namespace Database\Seeders;

use App\Models\AcademicYear;
use App\Models\PerformanceMetric;
use App\Models\School;
use App\Models\Section;
use App\Models\Student;
use App\Models\StudentPerformanceRecord;
use App\Models\StudentStatusLog;
use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\MetricCategory;
use App\Support\Domain\ReportingPeriod;
use App\Support\Domain\SchoolStatus;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $academicYears = [
            [
                'name' => '2025-2026',
                'start_date' => '2025-06-01',
                'end_date' => '2026-03-31',
                'is_current' => true,
            ],
            [
                'name' => '2024-2025',
                'start_date' => '2024-06-01',
                'end_date' => '2025-03-31',
                'is_current' => false,
            ],
        ];

        foreach ($academicYears as $year) {
            AcademicYear::query()->updateOrCreate(
                ['name' => $year['name']],
                $year,
            );
        }

        $currentYear = AcademicYear::query()->where('is_current', true)->firstOrFail();

        $schools = [
            [
                'school_code' => 'SDO-SC-001',
                'name' => 'Santiago City National High School',
                'district' => 'District 1',
                'region' => 'Region II',
                'type' => 'public',
                'status' => SchoolStatus::ACTIVE->value,
            ],
            [
                'school_code' => 'SDO-SC-002',
                'name' => 'Santiago South Integrated School',
                'district' => 'District 2',
                'region' => 'Region II',
                'type' => 'public',
                'status' => SchoolStatus::ACTIVE->value,
            ],
            [
                'school_code' => 'SDO-SC-003',
                'name' => 'St. Matthew Academy',
                'district' => 'District 3',
                'region' => 'Region II',
                'type' => 'private',
                'status' => SchoolStatus::PENDING->value,
            ],
        ];

        $schoolModels = [];
        foreach ($schools as $school) {
            $schoolModels[] = School::query()->updateOrCreate(
                ['school_code' => $school['school_code']],
                $school,
            );
        }

        $divisionAdmin = User::query()->updateOrCreate(
            ['email' => 'chief@cspams.local'],
            [
                'name' => 'Division Chief',
                'password' => Hash::make('password123'),
            ],
        );
        $divisionAdmin->syncRoles([UserRoleResolver::DIVISION_ADMIN]);

        $monitor = User::query()->updateOrCreate(
            ['email' => 'monitor@cspams.local'],
            [
                'name' => 'Division Monitor',
                'password' => Hash::make('password123'),
            ],
        );
        $monitor->syncRoles([UserRoleResolver::MONITOR]);

        foreach ($schoolModels as $index => $school) {
            $head = User::query()->updateOrCreate(
                ['email' => 'schoolhead' . ($index + 1) . '@cspams.local'],
                [
                    'name' => 'School Head ' . ($index + 1),
                    'password' => Hash::make('password123'),
                    'school_id' => $school->id,
                ],
            );
            $head->syncRoles([UserRoleResolver::SCHOOL_HEAD]);
        }

        $metrics = [
            ['code' => 'NER', 'name' => 'Net Enrollment Rate', 'category' => MetricCategory::LEARNER->value],
            ['code' => 'RR', 'name' => 'Retention Rate', 'category' => MetricCategory::LEARNER->value],
            ['code' => 'DR', 'name' => 'Dropout Rate', 'category' => MetricCategory::LEARNER->value],
            ['code' => 'CSR', 'name' => 'Cohort Survival Rate', 'category' => MetricCategory::LEARNER->value],
            ['code' => 'PCR', 'name' => 'Pupil-Classroom Ratio', 'category' => MetricCategory::INFRASTRUCTURE->value],
            ['code' => 'PSR', 'name' => 'Pupil-Seat Ratio', 'category' => MetricCategory::RESOURCES->value],
        ];

        foreach ($metrics as $metric) {
            PerformanceMetric::query()->updateOrCreate(
                ['code' => $metric['code']],
                array_merge($metric, [
                    'description' => $metric['name'] . ' indicator used in TARGETS-MET monitoring.',
                    'is_active' => true,
                ]),
            );
        }

        $firstNames = ['Alex', 'Jamie', 'Riley', 'Drew', 'Morgan', 'Taylor', 'Casey', 'Jordan', 'Avery', 'Quinn'];
        $lastNames = ['Reyes', 'Santos', 'Dela Cruz', 'Garcia', 'Mendoza', 'Ramos', 'Navarro', 'Aquino', 'Castro', 'Luna'];
        $statuses = [
            StudentStatus::ENROLLED,
            StudentStatus::ENROLLED,
            StudentStatus::ENROLLED,
            StudentStatus::AT_RISK,
            StudentStatus::RETURNING,
            StudentStatus::TRANSFEREE,
        ];

        $counter = 100000000000;

        foreach ($schoolModels as $school) {
            $sections = [];

            foreach (['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'] as $gradeLevel) {
                $sections[] = Section::query()->updateOrCreate(
                    [
                        'school_id' => $school->id,
                        'academic_year_id' => $currentYear->id,
                        'grade_level' => $gradeLevel,
                        'name' => $gradeLevel . ' - A',
                    ],
                    [
                        'capacity' => 45,
                        'status' => SchoolStatus::ACTIVE->value,
                    ],
                );
            }

            foreach ($sections as $section) {
                for ($i = 0; $i < 10; $i++) {
                    $status = $statuses[array_rand($statuses)];
                    $risk = match ($status) {
                        StudentStatus::AT_RISK => StudentRiskLevel::HIGH,
                        StudentStatus::DROPPED_OUT => StudentRiskLevel::HIGH,
                        StudentStatus::ENROLLED => StudentRiskLevel::LOW,
                        default => StudentRiskLevel::MEDIUM,
                    };

                    $student = Student::query()->create([
                        'school_id' => $school->id,
                        'section_id' => $section->id,
                        'academic_year_id' => $currentYear->id,
                        'lrn' => (string) $counter++,
                        'first_name' => $firstNames[array_rand($firstNames)],
                        'middle_name' => null,
                        'last_name' => $lastNames[array_rand($lastNames)],
                        'sex' => rand(0, 1) ? 'male' : 'female',
                        'birth_date' => now()->subYears(rand(12, 18))->subDays(rand(0, 300)),
                        'status' => $status->value,
                        'risk_level' => $risk->value,
                        'tracked_from_level' => 'Kindergarten',
                        'current_level' => $section->grade_level,
                        'last_status_at' => now()->subDays(rand(0, 20)),
                    ]);

                    StudentStatusLog::query()->create([
                        'student_id' => $student->id,
                        'from_status' => null,
                        'to_status' => $status->value,
                        'changed_by' => $monitor->id,
                        'notes' => 'Initial migration/import status.',
                        'changed_at' => now()->subDays(rand(0, 20)),
                    ]);

                    $metricRows = PerformanceMetric::query()->where('is_active', true)->limit(4)->get();
                    foreach ($metricRows as $metric) {
                        StudentPerformanceRecord::query()->updateOrCreate(
                            [
                                'student_id' => $student->id,
                                'performance_metric_id' => $metric->id,
                                'academic_year_id' => $currentYear->id,
                                'period' => ReportingPeriod::Q1->value,
                            ],
                            [
                                'value' => rand(70, 100),
                                'remarks' => 'Seeded sample performance value.',
                                'encoded_by' => $monitor->id,
                                'submitted_at' => now()->subDays(rand(0, 30)),
                            ],
                        );
                    }
                }
            }
        }
    }
}
