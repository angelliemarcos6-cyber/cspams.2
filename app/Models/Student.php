<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Student extends Model
{
    use HasFactory;

    protected $fillable = [
        'school_id',
        'lrn',
        'last_name',
        'first_name',
        'middle_name',
        'sex',
        'birthdate',
        'current_status',
        'current_academic_year_id',
        'current_section_id',
    ];

    protected $casts = [
        'school_id' => 'integer',
        'current_academic_year_id' => 'integer',
        'current_section_id' => 'integer',
        'birthdate' => 'date',
    ];

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function currentAcademicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class, 'current_academic_year_id');
    }

    public function currentSection(): BelongsTo
    {
        return $this->belongsTo(Section::class, 'current_section_id');
    }

    /**
     * Only keep this if you actually have:
     * - StudentStatusHistory model AND
     * - student_status_histories table with student_id FK
     */
    public function statusHistories(): HasMany
    {
        return $this->hasMany(StudentStatusHistory::class);
    }
}
