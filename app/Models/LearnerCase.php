<?php

namespace App\Models;

use App\Traits\Filterable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class LearnerCase extends Model
{
    use Filterable;
    use SoftDeletes;

    protected $table = 'learner_cases';

    protected $fillable = [
        'school_id',
        'flagged_by',
        'lrn',
        'learner_name',
        'grade_level',
        'section',
        'issue_type',
        'severity',
        'description',
        'metadata',
        'status',
        'acknowledged_at',
        'acknowledged_by',
        'resolved_at',
        'resolved_by',
    ];

    protected $casts = [
        'flagged_at' => 'datetime',
        'acknowledged_at' => 'datetime',
        'resolved_at' => 'datetime',
        'metadata' => 'array',
    ];

    /**
     * @var list<string>
     */
    protected array $filterableSearchColumns = [
        'lrn',
        'learner_name',
        'grade_level',
        'section',
        'description',
    ];

    protected ?string $filterableDateColumn = 'flagged_at';

    // Relationships

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function flaggedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'flagged_by');
    }

    public function acknowledgedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acknowledged_by');
    }

    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(LearnerCaseAttachment::class, 'concern_id');
    }

    public function threads(): HasMany
    {
        return $this->hasMany(LearnerCaseThread::class, 'concern_id')
            ->orderBy('created_at', 'asc');
    }

    // Scopes

    public function scopeOpen($query)
    {
        return $query->where('status', 'open');
    }

    public function scopeMonitoring($query)
    {
        return $query->where('status', 'monitoring');
    }

    public function scopeResolved($query)
    {
        return $query->where('status', 'resolved');
    }

    public function scopeHighSeverity($query)
    {
        return $query->where('severity', 'high');
    }

    public function scopeBySchool($query, int $schoolId)
    {
        return $query->where('school_id', $schoolId);
    }

    public function scopeByIssueType($query, string $issueType)
    {
        return $query->where('issue_type', $issueType);
    }

    public function scopeBySeverity($query, string $severity)
    {
        return $query->where('severity', $severity);
    }

    public function scopeRecentFirst($query)
    {
        return $query->orderBy('flagged_at', 'desc');
    }

    public function scopeOverdue($query)
    {
        return $query->where('status', '!=', 'resolved')
            ->where('flagged_at', '<', now()->subDays(30));
    }

    // Accessors

    public function getDaysOpenAttribute(): int
    {
        return (int) $this->flagged_at->diffInDays(now());
    }

    public function isOverdue(): bool
    {
        return $this->status !== 'resolved' && $this->days_open > 30;
    }
}
