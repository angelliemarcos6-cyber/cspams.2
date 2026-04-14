<?php

namespace App\Models;

use App\Traits\Filterable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EnrollmentRecord extends Model
{
    use Filterable;

    protected $fillable = [
        'school_id',
        'academic_year_id',
        'total_enrolled',
        'dropouts',
        'transferees_in',
        'transferees_out',
        'completers',
        'retained',
        'submitted_at',
        'submitted_by',
    ];

    protected $casts = [
        'submitted_at' => 'datetime',
    ];

    protected ?string $filterableDateColumn = 'submitted_at';

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    // Boot: auto-calculate rates
    protected static function boot()
    {
        parent::boot();

        static::saving(function ($model) {
            // Retention rate = (total - dropouts - transferees_out) / total
            if ($model->total_enrolled > 0) {
                $retained_count = $model->total_enrolled - $model->dropouts - $model->transferees_out;
                $model->retention_rate = ($retained_count / $model->total_enrolled) * 100;
            }

            // Dropout rate = dropouts / total
            if ($model->total_enrolled > 0) {
                $model->dropout_rate = ($model->dropouts / $model->total_enrolled) * 100;
            }
        });
    }

    // Scopes
    public function scopeBySchool($query, $schoolId)
    {
        return $query->where('school_id', $schoolId);
    }

    public function scopeByAcademicYear($query, $yearId)
    {
        return $query->where('academic_year_id', $yearId);
    }

    public function scopeSubmitted($query)
    {
        return $query->whereNotNull('submitted_at');
    }
}
