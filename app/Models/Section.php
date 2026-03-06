<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Section extends Model
{
    use HasFactory;

    protected $fillable = [
        'school_id',
        'academic_year_id',
        'grade_level',
        'name',
        'track',
        'adviser_name',
    ];

    protected $casts = [
        'school_id' => 'integer',
        'academic_year_id' => 'integer',
        'grade_level' => 'integer',
    ];

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    /**
     * Students currently assigned to this section (snapshot via students.current_section_id)
     */
    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'current_section_id');
    }
}
