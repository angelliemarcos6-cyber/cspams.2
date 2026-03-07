<?php

namespace App\Models;

use App\Support\Audit\AuditsActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AcademicYear extends Model
{
    use AuditsActivity;
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'start_date',
        'end_date',
        'is_current',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'is_current' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::saved(function (self $academicYear): void {
            if (! $academicYear->is_current) {
                return;
            }

            // Keep exactly one current academic year to avoid scope ambiguity.
            static::query()
                ->whereKeyNot($academicYear->getKey())
                ->where('is_current', true)
                ->update(['is_current' => false]);
        });
    }

    public function sections(): HasMany
    {
        return $this->hasMany(Section::class);
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class);
    }

    public function performanceRecords(): HasMany
    {
        return $this->hasMany(StudentPerformanceRecord::class);
    }

    public function scopeCurrent(Builder $query): Builder
    {
        return $query->where('is_current', true);
    }
}