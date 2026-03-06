<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AcademicYear extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'starts_at',
        'ends_at',
        'is_current',
    ];

    protected $casts = [
        'starts_at' => 'date',
        'ends_at' => 'date',
        'is_current' => 'boolean',
    ];

    /**
     * sections under this academic year.
     */
    public function sections(): HasMany
    {
        return $this->hasMany(Section::class);
    }

    /**
     * Students currently assigned to this academic year (snapshot via students.current_academic_year_id)
     */
    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'current_academic_year_id');
    }

    /**
     * SchoolYearlyData records (if you created that model/table).
     */
    public function yearlyData(): HasMany
    {
        return $this->hasMany(SchoolYearlyData::class);
    }
}
