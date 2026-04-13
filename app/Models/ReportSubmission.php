<?php

namespace App\Models;

use App\Traits\Filterable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class ReportSubmission extends Model
{
    use Filterable;

    protected $table = 'report_submissions';

    protected $fillable = [
        'school_id',
        'academic_year_id',
        'report_type',
        'status',
        'file_path',
        'original_filename',
        'file_size',
        'submitted_at',
        'submitted_by',
        'approved_at',
        'approved_by',
        'notes',
    ];

    protected $casts = [
        'submitted_at' => 'datetime',
        'approved_at' => 'datetime',
    ];

    protected ?string $filterableDateColumn = 'submitted_at';

    // Relationships

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

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    // Scopes

    public function scopeBySchool($query, int $schoolId)
    {
        return $query->where('school_id', $schoolId);
    }

    public function scopeByReportType($query, string $type)
    {
        return $query->where('report_type', $type);
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeSubmitted($query)
    {
        return $query->where('status', 'submitted');
    }

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    // Encrypted file path accessors

    public function setFilePathAttribute(?string $value): void
    {
        $this->attributes['file_path'] = $value !== null ? Crypt::encrypt($value) : null;
    }

    public function getFilePathAttribute(?string $value): ?string
    {
        return $value !== null ? Crypt::decrypt($value) : null;
    }
}
