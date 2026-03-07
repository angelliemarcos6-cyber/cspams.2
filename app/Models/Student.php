<?php

namespace App\Models;

use App\Support\Audit\AuditsActivity;
use App\Support\Domain\StudentRiskLevel;
use App\Support\Domain\StudentStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Student extends Model
{
    use AuditsActivity;
    use HasFactory;
    use SoftDeletes;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'school_id',
        'section_id',
        'academic_year_id',
        'lrn',
        'first_name',
        'middle_name',
        'last_name',
        'sex',
        'birth_date',
        'status',
        'risk_level',
        'tracked_from_level',
        'current_level',
        'last_status_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'birth_date' => 'date',
            'last_status_at' => 'datetime',
            'status' => StudentStatus::class,
            'risk_level' => StudentRiskLevel::class,
        ];
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(Section::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function performanceRecords(): HasMany
    {
        return $this->hasMany(StudentPerformanceRecord::class);
    }

    public function statusLogs(): HasMany
    {
        return $this->hasMany(StudentStatusLog::class);
    }

    public function getFullNameAttribute(): string
    {
        return trim(implode(' ', array_filter([
            $this->first_name,
            $this->middle_name,
            $this->last_name,
        ])));
    }
}
