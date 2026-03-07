<?php

namespace App\Support\Forms;

use App\Models\AcademicYear;
use App\Models\School;
use App\Models\Student;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;

class Sf1PayloadFactory
{
    /**
     * @return array<string, mixed>
     */
    public function build(int $schoolId, int $academicYearId): array
    {
        $school = School::query()
            ->select(['id', 'school_code', 'name', 'district', 'region'])
            ->findOrFail($schoolId);

        $academicYear = AcademicYear::query()
            ->select(['id', 'name', 'start_date', 'end_date'])
            ->findOrFail($academicYearId);

        $students = Student::query()
            ->with(['section:id,name,grade_level'])
            ->where('school_id', $schoolId)
            ->where('academic_year_id', $academicYearId)
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->orderBy('lrn')
            ->get();

        $statusBreakdown = [];
        foreach (StudentStatus::options() as $statusValue => $label) {
            $statusBreakdown[$statusValue] = [
                'label' => $label,
                'count' => 0,
            ];
        }

        $gradeLevelBreakdown = [];
        $maleCount = 0;
        $femaleCount = 0;
        $unspecifiedSexCount = 0;

        $learners = $students->map(function (Student $student) use (
            &$statusBreakdown,
            &$gradeLevelBreakdown,
            &$maleCount,
            &$femaleCount,
            &$unspecifiedSexCount
        ): array {
            $status = $this->statusValue($student->status) ?? StudentStatus::ENROLLED->value;
            $risk = $this->riskValue($student->risk_level) ?? StudentRiskLevel::NONE->value;

            if (! isset($statusBreakdown[$status])) {
                $statusBreakdown[$status] = [
                    'label' => ucwords(str_replace('_', ' ', $status)),
                    'count' => 0,
                ];
            }
            $statusBreakdown[$status]['count']++;

            $sex = is_string($student->sex) ? strtolower($student->sex) : null;
            $gradeLevel = (string) ($student->current_level ?: $student->section?->grade_level ?: 'Unspecified');

            if (! isset($gradeLevelBreakdown[$gradeLevel])) {
                $gradeLevelBreakdown[$gradeLevel] = [
                    'grade_level' => $gradeLevel,
                    'total' => 0,
                    'male' => 0,
                    'female' => 0,
                    'unspecified' => 0,
                ];
            }

            $gradeLevelBreakdown[$gradeLevel]['total']++;

            if ($sex === 'male') {
                $maleCount++;
                $gradeLevelBreakdown[$gradeLevel]['male']++;
            } elseif ($sex === 'female') {
                $femaleCount++;
                $gradeLevelBreakdown[$gradeLevel]['female']++;
            } else {
                $unspecifiedSexCount++;
                $gradeLevelBreakdown[$gradeLevel]['unspecified']++;
            }

            return [
                'lrn' => $student->lrn,
                'full_name' => $student->full_name,
                'sex' => $sex,
                'birth_date' => optional($student->birth_date)->format('Y-m-d'),
                'grade_level' => $gradeLevel,
                'section' => $student->section?->name,
                'status' => $status,
                'status_label' => StudentStatus::options()[$status] ?? $status,
                'risk_level' => $risk,
                'risk_level_label' => StudentRiskLevel::options()[$risk] ?? $risk,
            ];
        })->values()->all();

        ksort($gradeLevelBreakdown);

        return [
            'form' => 'SF-1',
            'title' => 'School Register',
            'generated_at' => now()->toISOString(),
            'school' => [
                'id' => $school->id,
                'school_code' => $school->school_code,
                'name' => $school->name,
                'district' => $school->district,
                'region' => $school->region,
            ],
            'academic_year' => [
                'id' => $academicYear->id,
                'name' => $academicYear->name,
                'start_date' => optional($academicYear->start_date)->format('Y-m-d'),
                'end_date' => optional($academicYear->end_date)->format('Y-m-d'),
            ],
            'summary' => [
                'total_learners' => count($learners),
                'male_learners' => $maleCount,
                'female_learners' => $femaleCount,
                'unspecified_sex_learners' => $unspecifiedSexCount,
                'status_breakdown' => array_values($statusBreakdown),
                'grade_level_breakdown' => array_values($gradeLevelBreakdown),
            ],
            'learners' => $learners,
        ];
    }

    private function statusValue(mixed $status): ?string
    {
        if ($status instanceof StudentStatus) {
            return $status->value;
        }

        return is_string($status) && $status !== '' ? $status : null;
    }

    private function riskValue(mixed $risk): ?string
    {
        if ($risk instanceof StudentRiskLevel) {
            return $risk->value;
        }

        return is_string($risk) && $risk !== '' ? $risk : null;
    }
}
