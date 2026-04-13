<?php

namespace App\Models;

use App\Support\Audit\AuditsActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LearnerCase extends Model
{
    use AuditsActivity;
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'school_id',
        'academic_year_id',
        'created_by',
        'lrn',
        'name',
        'grade_section',
        'issue_type',
        'severity',
        'case_notes',
        'status',
        'resolved_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'issue_type' => LearnerCaseIssueType::class,
            'severity' => LearnerCaseSeverity::class,
            'status' => LearnerCaseStatus::class,
            'resolved_at' => 'datetime',
        ];
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function markAsMonitoring(): bool
    {
        $this->status = LearnerCaseStatus::MONITORING;
        $this->resolved_at = null;

        return $this->save();
    }

    public function resolve(): bool
    {
        $this->status = LearnerCaseStatus::RESOLVED;
        $this->resolved_at = now();

        return $this->save();
    }

    /**
     * @return list<string>
     */
    public static function issueTypeValues(): array
    {
        return array_map(
            static fn (LearnerCaseIssueType $case): string => $case->value,
            LearnerCaseIssueType::cases(),
        );
    }

    /**
     * @return list<string>
     */
    public static function severityValues(): array
    {
        return array_map(
            static fn (LearnerCaseSeverity $case): string => $case->value,
            LearnerCaseSeverity::cases(),
        );
    }

    /**
     * @return list<string>
     */
    public static function statusValues(): array
    {
        return array_map(
            static fn (LearnerCaseStatus $case): string => $case->value,
            LearnerCaseStatus::cases(),
        );
    }

    public static function issueTypeLabel(string $value): string
    {
        return LearnerCaseIssueType::options()[$value] ?? ucfirst(str_replace('_', ' ', $value));
    }

    public static function severityLabel(string $value): string
    {
        return LearnerCaseSeverity::options()[$value] ?? ucfirst(str_replace('_', ' ', $value));
    }

    public static function statusLabel(string $value): string
    {
        return LearnerCaseStatus::options()[$value] ?? ucfirst(str_replace('_', ' ', $value));
    }
}

enum LearnerCaseIssueType: string
{
    case FINANCIAL = 'financial';
    case ABUSE = 'abuse';
    case HEALTH = 'health';
    case ATTENDANCE = 'attendance';
    case ACADEMIC = 'academic';
    case OTHER = 'other';

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            self::FINANCIAL->value => 'Financial',
            self::ABUSE->value => 'Abuse',
            self::HEALTH->value => 'Health',
            self::ATTENDANCE->value => 'Attendance',
            self::ACADEMIC->value => 'Academic',
            self::OTHER->value => 'Other',
        ];
    }
}

enum LearnerCaseSeverity: string
{
    case LOW = 'low';
    case MEDIUM = 'medium';
    case HIGH = 'high';

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            self::LOW->value => 'Low',
            self::MEDIUM->value => 'Medium',
            self::HIGH->value => 'High',
        ];
    }
}

enum LearnerCaseStatus: string
{
    case OPEN = 'open';
    case MONITORING = 'monitoring';
    case RESOLVED = 'resolved';

    /**
     * @return array<string, string>
     */
    public static function options(): array
    {
        return [
            self::OPEN->value => 'Open',
            self::MONITORING->value => 'Monitoring',
            self::RESOLVED->value => 'Resolved',
        ];
    }
}
