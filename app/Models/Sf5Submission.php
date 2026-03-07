<?php

namespace App\Models;

use App\Support\Audit\AuditsActivity;
use App\Support\Domain\FormSubmissionStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sf5Submission extends Model
{
    use AuditsActivity;
    use HasFactory;

    public const FORM_TYPE = 'sf5';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'school_id',
        'academic_year_id',
        'reporting_period',
        'version',
        'status',
        'payload',
        'generated_by',
        'generated_at',
        'submitted_by',
        'submitted_at',
        'validated_by',
        'validated_at',
        'validation_notes',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'status' => FormSubmissionStatus::class,
            'generated_at' => 'datetime',
            'submitted_at' => 'datetime',
            'validated_at' => 'datetime',
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

    public function generatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'generated_by');
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function validatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'validated_by');
    }

    public function histories(): HasMany
    {
        return $this->hasMany(FormSubmissionHistory::class, 'submission_id')
            ->where('form_type', self::FORM_TYPE)
            ->orderByDesc('created_at');
    }
}
