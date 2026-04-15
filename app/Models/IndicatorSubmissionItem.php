<?php

namespace App\Models;

use App\Support\Audit\AuditsActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IndicatorSubmissionItem extends Model
{
    use AuditsActivity;
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'indicator_submission_id',
        'performance_metric_id',
        'target_value',
        'target_typed_value',
        'actual_value',
        'actual_typed_value',
        'variance_value',
        'target_display',
        'actual_display',
        'compliance_status',
        'remarks',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'target_value' => 'decimal:2',
            'actual_value' => 'decimal:2',
            'variance_value' => 'decimal:2',
            'target_typed_value' => 'array',
            'actual_typed_value' => 'array',
        ];
    }

    public function submission(): BelongsTo
    {
        return $this->belongsTo(IndicatorSubmission::class, 'indicator_submission_id');
    }

    public function metric(): BelongsTo
    {
        return $this->belongsTo(PerformanceMetric::class, 'performance_metric_id');
    }
}
