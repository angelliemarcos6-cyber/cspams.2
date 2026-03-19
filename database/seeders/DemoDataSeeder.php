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
use App\Support\Domain\AccountStatus;
use App\Support\Domain\MetricDataType;
use App\Support\Domain\MetricCategory;
use App\Support\Domain\ReportingPeriod;
use App\Support\Domain\SchoolStatus;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;
use App\Support\Indicators\RollingIndicatorYearWindow;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DemoDataSeeder extends Seeder
{
    private ?bool $syncSeedPasswords = null;

    public function run(): void
    {
        $currentYear = $this->seedAcademicYears();

        ['schools' => $schoolModels, 'monitor' => $monitor] = $this->seedSchoolsAndUsers();

        $this->seedPerformanceMetrics();
        $this->seedSchoolStudents($schoolModels, $currentYear, $monitor);
    }

    private function seedAcademicYears(): AcademicYear
    {
        app(RollingIndicatorYearWindow::class)->sync();

        return AcademicYear::query()
            ->where('is_current', true)
            ->firstOr(static fn (): AcademicYear => AcademicYear::query()->orderByDesc('start_date')->firstOrFail());
    }

    /**
     * @return array{schools: array<int, School>, monitor: User}
     */
    private function seedSchoolsAndUsers(): array
    {
        $schools = [
            [
                'school_code' => '900001',
                'name' => 'Santiago City National High School',
                'district' => 'District 1',
                'region' => 'Region II',
                'type' => 'public',
                'status' => SchoolStatus::ACTIVE->value,
                'reported_student_count' => 3280,
                'reported_teacher_count' => 144,
            ],
            [
                'school_code' => '900002',
                'name' => 'Santiago South Integrated School',
                'district' => 'District 2',
                'region' => 'Region II',
                'type' => 'public',
                'status' => SchoolStatus::ACTIVE->value,
                'reported_student_count' => 2124,
                'reported_teacher_count' => 103,
            ],
            [
                'school_code' => '900003',
                'name' => 'St. Matthew Academy',
                'district' => 'District 3',
                'region' => 'Region II',
                'type' => 'private',
                'status' => SchoolStatus::PENDING->value,
                'reported_student_count' => 886,
                'reported_teacher_count' => 42,
            ],
        ];

        /** @var array<int, School> $schoolModels */
        $schoolModels = [];
        foreach ($schools as $school) {
            $schoolModels[] = School::query()->updateOrCreate(
                ['school_code' => $school['school_code']],
                $school,
            );
        }

        $monitor = User::query()->firstOrNew(['email' => 'monitor@cspams.local']);
        $monitorWasRecentlyCreated = ! $monitor->exists;
        $monitor->name = 'Division Monitor';
        $monitor->account_status = AccountStatus::ACTIVE->value;

        if ($monitorWasRecentlyCreated || $this->shouldSyncSeedPasswords()) {
            $monitor->password = Hash::make($this->demoPasswordForKey('monitor'));
            $monitor->must_reset_password = false;
            $monitor->password_changed_at = now();
            $monitor->email_verified_at = now();
        }

        $monitor->save();
        $monitor->syncRoles([UserRoleResolver::MONITOR]);

        foreach ($schoolModels as $index => $school) {
            $head = User::query()->firstOrNew(['email' => 'schoolhead' . ($index + 1) . '@cspams.local']);
            $headWasRecentlyCreated = ! $head->exists;
            $head->name = 'School Head ' . ($index + 1);
            $head->school_id = $school->id;
            $head->account_status = AccountStatus::ACTIVE->value;

            if ($headWasRecentlyCreated || $this->shouldSyncSeedPasswords()) {
                $head->password = Hash::make($this->demoPasswordForKey('school:' . strtoupper((string) $school->school_code)));
                $head->must_reset_password = false;
                $head->password_changed_at = now();
                $head->email_verified_at = now();
            }

            $head->save();
            $head->syncRoles([UserRoleResolver::SCHOOL_HEAD]);

            $school->update([
                'submitted_by' => $head->id,
                'submitted_at' => now()->subHours(rand(1, 72)),
            ]);
        }

        return [
            'schools' => $schoolModels,
            'monitor' => $monitor,
        ];
    }

    private function seedPerformanceMetrics(): void
    {
        $metrics = $this->metricCatalog();

        foreach ($metrics as $metric) {
            PerformanceMetric::query()->updateOrCreate(
                ['code' => $metric['code']],
                array_merge($metric, [
                    'description' => $metric['description'] ?? ($metric['name'] . ' indicator used in TARGETS-MET monitoring.'),
                    'is_active' => true,
                ]),
            );
        }
    }

    /**
     * @param array<int, School> $schoolModels
     */
    private function seedSchoolStudents(array $schoolModels, AcademicYear $currentYear, User $monitor): void
    {
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

        $maxExistingLrn = Student::query()
            ->pluck('lrn')
            ->filter(static fn (mixed $lrn): bool => is_numeric($lrn))
            ->map(static fn (mixed $lrn): int => (int) $lrn)
            ->max();
        $counter = 100000000000;
        if ($maxExistingLrn !== null) {
            $counter = max($counter, ((int) $maxExistingLrn) + 1);
        }

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

    /**
     * @return array<int, array<string, mixed>>
     */
    private function metricCatalog(): array
    {
        $years = $this->indicatorWindowYears();
        $yearlyNumber = ['years' => $years, 'valueType' => 'number', 'comparison' => 'greater_or_equal'];
        $yearlyInteger = ['years' => $years, 'valueType' => 'integer', 'comparison' => 'greater_or_equal'];
        $yearlyPercentage = ['years' => $years, 'valueType' => 'percentage', 'comparison' => 'greater_or_equal'];
        $yearlyYesNo = ['years' => $years, 'valueType' => 'yes_no', 'comparison' => 'equal'];
        $yearlyText = ['years' => $years, 'valueType' => 'text', 'comparison' => 'info_only'];
        $yearlyCurrency = ['years' => $years, 'valueType' => 'currency', 'comparison' => 'greater_or_equal', 'currency' => 'PHP'];

        return [
            // SALO / I-META compliance indicators
            $this->metric('SALO', "School's Achievements and Learning Outcomes", MetricCategory::COMPLIANCE->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'score', 1, $yearlyNumber),
            $this->metric('NER', 'Net Enrollment Rate', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 45, $yearlyPercentage),
            $this->metric('RR', 'Retention Rate', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 46, $yearlyPercentage),
            $this->metric('IMETA_HEAD_NAME', 'Name of School Head', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 2, $yearlyText),
            $this->metric('IMETA_ENROLL_TOTAL', 'Total Number of Enrolment', MetricCategory::LEARNER->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'learners', 3, $yearlyInteger),
            $this->metric('IMETA_SBM_LEVEL', 'SBM Level of Practice', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 4, [
                'years' => $years,
                'valueType' => 'enum',
                'comparison' => 'equal',
                'options' => ['Level 1', 'Level 2', 'Level 3'],
            ]),
            $this->metric('PCR_K', 'Pupil/Student Classroom Ratio (Kindergarten)', MetricCategory::INFRASTRUCTURE->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 5, $yearlyNumber),
            $this->metric('PCR_G1_3', 'Pupil/Student Classroom Ratio (Grades 1 to 3)', MetricCategory::INFRASTRUCTURE->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 6, $yearlyNumber),
            $this->metric('PCR_G4_6', 'Pupil/Student Classroom Ratio (Grades 4 to 6)', MetricCategory::INFRASTRUCTURE->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 7, $yearlyNumber),
            $this->metric('PCR_G7_10', 'Pupil/Student Classroom Ratio (Grades 7 to 10)', MetricCategory::INFRASTRUCTURE->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 8, $yearlyNumber),
            $this->metric('PCR_G11_12', 'Pupil/Student Classroom Ratio (Grades 11 to 12)', MetricCategory::INFRASTRUCTURE->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 9, $yearlyNumber),
            $this->metric('WASH_RATIO', 'Water and Sanitation Facility to Pupil Ratio', MetricCategory::INFRASTRUCTURE->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 10, $yearlyNumber),
            $this->metric('COMFORT_ROOMS', 'Number of Comfort Rooms', MetricCategory::INFRASTRUCTURE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'rooms', 11, $yearlyInteger),
            $this->metric('TOILET_BOWLS', 'Toilet Bowls', MetricCategory::INFRASTRUCTURE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'units', 12, $yearlyInteger),
            $this->metric('URINALS', 'Urinals', MetricCategory::INFRASTRUCTURE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'units', 13, $yearlyInteger),
            $this->metric('HANDWASH_FAC', 'Handwashing Facilities', MetricCategory::INFRASTRUCTURE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'units', 14, $yearlyInteger),
            $this->metric('LEARNING_MAT_RATIO', 'Ideal Learning Materials to Learner Ratio', MetricCategory::RESOURCES->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 15, $yearlyNumber),
            $this->metric('PSR_OVERALL', 'Pupil/Student Seat Ratio', MetricCategory::RESOURCES->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 16, $yearlyNumber),
            $this->metric('PSR_K', 'Seat Ratio - Kindergarten', MetricCategory::RESOURCES->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 17, $yearlyNumber),
            $this->metric('PSR_G1_6', 'Seat Ratio - Grades 1 to 6', MetricCategory::RESOURCES->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 18, $yearlyNumber),
            $this->metric('PSR_G7_10', 'Seat Ratio - Grades 7 to 10', MetricCategory::RESOURCES->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 19, $yearlyNumber),
            $this->metric('PSR_G11_12', 'Seat Ratio - Grades 11 to 12', MetricCategory::RESOURCES->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 20, $yearlyNumber),
            $this->metric('ICT_RATIO', 'ICT Package/E-classroom package to sections ratio', MetricCategory::RESOURCES->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'ratio', 21, $yearlyNumber),
            $this->metric('ICT_LAB', 'ICT Laboratory', MetricCategory::RESOURCES->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 22, $yearlyYesNo),
            $this->metric('SCIENCE_LAB', 'Science Laboratory', MetricCategory::RESOURCES->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 23, $yearlyYesNo),
            $this->metric('INTERNET_ACCESS', 'Do you have internet access? (Y/N)', MetricCategory::RESOURCES->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 24, $yearlyYesNo),
            $this->metric('ELECTRICITY', 'Do you have electricity? (Y/N)', MetricCategory::INFRASTRUCTURE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 25, $yearlyYesNo),
            $this->metric('FENCE_STATUS', 'Do you have a complete fence/gate? (Evident/Partially/Not Evident)', MetricCategory::INFRASTRUCTURE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 26, [
                'years' => $years,
                'valueType' => 'enum',
                'comparison' => 'equal',
                'options' => ['Evident', 'Partially Evident', 'Not Evident'],
            ]),
            $this->metric('TEACHERS_TOTAL', 'No. of Teachers', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'teachers', 27, $yearlyInteger),
            $this->metric('TEACHERS_MALE', 'No. of Teachers - Male', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'teachers', 28, $yearlyInteger),
            $this->metric('TEACHERS_FEMALE', 'No. of Teachers - Female', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'teachers', 29, $yearlyInteger),
            $this->metric('TEACHERS_PWD_TOTAL', 'Teachers with Physical Disability', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'teachers', 30, $yearlyInteger),
            $this->metric('TEACHERS_PWD_MALE', 'Teachers with Physical Disability - Male', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'teachers', 31, $yearlyInteger),
            $this->metric('TEACHERS_PWD_FEMALE', 'Teachers with Physical Disability - Female', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'teachers', 32, $yearlyInteger),
            $this->metric('FUNCTIONAL_SGC', 'Functional SGC', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 33, $yearlyYesNo),
            $this->metric('FEEDING_BENEFICIARIES', 'School-Based Feeding Program Beneficiaries', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'learners', 34, $yearlyInteger),
            $this->metric('CANTEEN_INCOME', 'School-Managed Canteen (Annual Income)', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'PHP', 35, $yearlyCurrency),
            $this->metric('TEACHER_COOP_INCOME', 'Teachers Cooperative Managed Canteen - if there is (Annual Income)', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'PHP', 36, $yearlyCurrency),
            $this->metric('SAFETY_PLAN', 'Security and Safety (Contingency Plan)', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 37, $yearlyYesNo),
            $this->metric('SAFETY_EARTHQUAKE', 'Earthquake', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 38, $yearlyYesNo),
            $this->metric('SAFETY_TYPHOON', 'Typhoon', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 39, $yearlyYesNo),
            $this->metric('SAFETY_COVID', 'COVID-19', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 40, $yearlyYesNo),
            $this->metric('SAFETY_POWER', 'Power interruption', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 41, $yearlyYesNo),
            $this->metric('SAFETY_IN_PERSON', 'In-person classes', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, null, 42, $yearlyYesNo),
            $this->metric('TEACHERS_PFA', 'No. of Teachers trained on Psychological First Aid (PFA)', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'teachers', 43, $yearlyInteger),
            $this->metric('TEACHERS_OCC_FIRST_AID', 'No. of Teachers trained on Occupational First Aid', MetricCategory::COMPLIANCE->value, 'i_meta', MetricDataType::YEARLY_MATRIX->value, 'teachers', 44, $yearlyInteger),

            // Core learner KPI / TARGETS-MET indicators
            $this->metric('DR', 'Dropout Rate', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 47, [
                'years' => $years,
                'valueType' => 'percentage',
                'comparison' => 'less_or_equal',
            ]),
            $this->metric('TR', 'Transition Rate', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 48, $yearlyPercentage),
            $this->metric('NIR', 'Net Intake Rate', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 49, $yearlyPercentage),
            $this->metric('PR', 'Participation Rate', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 50, $yearlyPercentage),
            $this->metric('ALS_COMPLETER_PCT', 'Percentage of ALS Completers', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 51, $yearlyPercentage),
            $this->metric('GPI', 'Gender Parity Rate Index (GPI)', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'index', 52, $yearlyNumber),
            $this->metric('IQR', 'Interquartile Ratio', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'ratio', 53, $yearlyNumber),
            $this->metric('CR', 'Completion Rate', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 54, $yearlyPercentage),
            $this->metric('CSR', 'Cohort Survival Rate', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 55, $yearlyPercentage),
            $this->metric('PLM_NEARLY_PROF', 'Learning at Mastery - Nearly Proficient (50%-74%)', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 56, $yearlyPercentage),
            $this->metric('PLM_PROF', 'Learning at Mastery - Proficient (75%-89%)', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 57, $yearlyPercentage),
            $this->metric('PLM_HIGH_PROF', 'Learning at Mastery - Highly Proficient (90%-100%)', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 58, $yearlyPercentage),
            $this->metric('AE_PASS_RATE', 'Percentage of Learners who passed the A&E Test', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 59, $yearlyPercentage),
            $this->metric('VIOLENCE_REPORT_RATE', 'Percentage of Learners reporting school violence', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 60, [
                'years' => $years,
                'valueType' => 'percentage',
                'comparison' => 'less_or_equal',
            ]),
            $this->metric('LEARNER_SATISFACTION', 'Percentage of Learners satisfied with education experience', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 61, $yearlyPercentage),
            $this->metric('RIGHTS_AWARENESS', 'Percentage of Learners aware of education rights', MetricCategory::LEARNER->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 62, $yearlyPercentage),
            $this->metric('RBE_MANIFEST', 'Percentage of Schools manifesting RBE indicators', MetricCategory::COMPLIANCE->value, 'targets_met', MetricDataType::YEARLY_MATRIX->value, 'percent', 63, $yearlyPercentage),
        ];
    }

    /**
     * @return array<int, string>
     */
    private function indicatorWindowYears(): array
    {
        return app(RollingIndicatorYearWindow::class)->windowYears();
    }

    /**
     * @param array<string, mixed>|null $inputSchema
     *
     * @return array<string, mixed>
     */
    private function metric(
        string $code,
        string $name,
        string $category,
        string $framework,
        string $dataType,
        ?string $unit,
        int $sortOrder,
        ?array $inputSchema = null,
    ): array {
        return [
            'code' => $code,
            'name' => $name,
            'category' => $category,
            'framework' => $framework,
            'data_type' => $dataType,
            'input_schema' => $inputSchema,
            'unit' => $unit,
            'sort_order' => $sortOrder,
        ];
    }

    private function demoPasswordForKey(string $key): string
    {
        $configured = trim((string) env('CSPAMS_DEMO_PASSWORD'));
        if ($configured !== '') {
            return $configured;
        }

        $appKey = (string) config('app.key');
        if ($appKey === '') {
            return 'Demo@' . Str::upper(Str::random(10)) . '!';
        }

        $fingerprint = strtoupper(substr(hash_hmac('sha256', $key, $appKey), 0, 10));

        return 'Demo@' . $fingerprint . '!';
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
}

