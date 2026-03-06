<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SchoolYearlyData extends Model
{
    use HasFactory;

    protected $table = 'school_yearly_data';

    protected $fillable = [
        'school_id',
        'academic_year_id',
        'targets_met',
        'status',
        'submitted_by',
        'submitted_at',
    ];

    protected $casts = [
        'school_id' => 'integer',
        'academic_year_id' => 'integer',
        'submitted_by' => 'integer',
        'targets_met' => 'array',
        'submitted_at' => 'datetime',
    ];

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }
}
