<?php

namespace App\Models;

use App\Support\Audit\AuditsActivity;
use App\Support\Domain\ReportingPeriod;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentPerformanceRecord extends Model
{
    use AuditsActivity;
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'student_id',
        'performance_metric_id',
        'academic_year_id',
        'period',
        'value',
        'remarks',
        'encoded_by',
        'submitted_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'value' => 'decimal:2',
            'period' => ReportingPeriod::class,
            'submitted_at' => 'datetime',
        ];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function metric(): BelongsTo
    {
        return $this->belongsTo(PerformanceMetric::class, 'performance_metric_id');
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function encoder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'encoded_by');
    }
}
