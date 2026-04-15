<?php

namespace App\Models;

use App\Support\Audit\AuditsActivity;
use App\Support\Domain\FormSubmissionStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class IndicatorSubmission extends Model
{
    use AuditsActivity;
    use HasFactory;

    public const FORM_TYPE = 'indicator';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'school_id',
        'academic_year_id',
        'reporting_period',
        'version',
        'status',
        'notes',
        'created_by',
        'submitted_by',
        'submitted_at',
        'reviewed_by',
        'reviewed_at',
        'review_notes',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => FormSubmissionStatus::class,
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(IndicatorSubmissionItem::class)
            ->orderBy('id');
    }
}
