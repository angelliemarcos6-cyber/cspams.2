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
        'form_data',
        'targets_met_file_path',
        'targets_met_original_filename',
        'targets_met_uploaded_at',
        'smea_file_path',
        'smea_original_filename',
        'smea_uploaded_at',
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
            'form_data' => 'json',
            'targets_met_uploaded_at' => 'datetime',
            'smea_uploaded_at' => 'datetime',
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

    /**
     * Check if all requirements are complete (ready to submit)
     */
    public function isComplete(): bool
    {
        return !empty($this->form_data) &&
            !empty($this->targets_met_file_path) &&
            !empty($this->smea_file_path);
    }

    /**
     * Get percentage complete for submission
     */
    public function getCompletionPercentage(): int
    {
        $completed = 0;
        $total = 3;

        if (!empty($this->form_data)) {
            $completed++;
        }
        if (!empty($this->targets_met_file_path)) {
            $completed++;
        }
        if (!empty($this->smea_file_path)) {
            $completed++;
        }

        return (int) (($completed / $total) * 100);
    }

    /**
     * Get file info for frontend
     *
     * @return array<string, array<string, mixed>>
     */
    public function getFilesInfo(): array
    {
        return [
            'imeta' => [
                'status' => !empty($this->form_data) ? 'complete' : 'incomplete',
                'completed_at' => $this->updated_at,
            ],
            'targetsMet' => [
                'status' => !empty($this->targets_met_file_path) ? 'complete' : 'incomplete',
                'filename' => $this->targets_met_original_filename,
                'uploaded_at' => $this->targets_met_uploaded_at,
            ],
            'smea' => [
                'status' => !empty($this->smea_file_path) ? 'complete' : 'incomplete',
                'filename' => $this->smea_original_filename,
                'uploaded_at' => $this->smea_uploaded_at,
            ],
        ];
    }

    /**
     * Check if school head can still edit this submission
     */
    public function canBeEdited(): bool
    {
        $status = $this->status instanceof FormSubmissionStatus
            ? $this->status->value
            : (string) $this->status;

        return $status === 'draft' || $status === 'returned';
    }
}
