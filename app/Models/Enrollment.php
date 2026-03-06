<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Enrollment extends Model
{
    use HasFactory;

    protected $fillable = [
        'student_id',
        'school_id',
        'academic_year_id',
        'section_id',
        'status',
        'enrolled_at',
        'ended_at',
    ];

    protected $casts = [
        'student_id' => 'integer',
        'school_id' => 'integer',
        'academic_year_id' => 'integer',
        'section_id' => 'integer',
        'enrolled_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(Section::class);
    }
}
