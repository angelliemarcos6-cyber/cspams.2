<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentStatusHistory extends Model
{
    use HasFactory;

    protected $table = 'student_status_histories';

    protected $fillable = [
        'student_id',
        'academic_year_id',
        'section_id',
        'status',
        'changed_at',
        'remarks',
        'changed_by',
    ];

    protected $casts = [
        'student_id' => 'integer',
        'academic_year_id' => 'integer',
        'section_id' => 'integer',
        'changed_by' => 'integer',
        'changed_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $history) {
            if (blank($history->changed_at)) {
                $history->changed_at = now();
            }

            if (blank($history->changed_by) && auth()->check()) {
                $history->changed_by = auth()->id();
            }
        });
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class, 'academic_year_id');
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(Section::class, 'section_id');
    }

    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
