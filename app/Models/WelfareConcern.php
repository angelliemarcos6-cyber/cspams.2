<?php

namespace App\Models;

use App\Traits\Filterable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class WelfareConcern extends Model
{
    use Filterable;
    use SoftDeletes;

    protected $fillable = [
        'school_id',
        'flagged_by',
        'grade_level',
        'section',
        'category',
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
        'metadata' => 'json',
    ];

    /**
     * @var list<string>
     */
    protected array $filterableSearchColumns = [
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
        return $this->hasMany(WelfareConcernAttachment::class, 'concern_id');
    }

    public function threads(): HasMany
    {
        return $this->hasMany(WelfareConcernThread::class, 'concern_id')
            ->orderBy('created_at', 'asc');
    }

    // Scopes
    public function scopeOpen($query)
    {
        return $query->where('status', 'open');
    }

    public function scopeInProgress($query)
    {
        return $query->where('status', 'in_progress');
    }

    public function scopeResolved($query)
    {
        return $query->where('status', 'resolved');
    }

    public function scopeBySchool($query, $schoolId)
    {
        return $query->where('school_id', $schoolId);
    }

    public function scopeByCategory($query, $category)
    {
        return $query->where('category', $category);
    }

    public function scopeRecentFirst($query)
    {
        return $query->orderBy('flagged_at', 'desc');
    }

    // Accessors
    public function getDaysOpenAttribute(): int
    {
        return $this->flagged_at->diffInDays(now());
    }

    public function isOverdue(): bool
    {
        // Alert if open for >30 days
        return $this->status === 'open' && $this->days_open > 30;
    }
}
