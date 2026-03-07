<?php

namespace App\Models;

use App\Support\Audit\AuditsActivity;
use App\Support\Domain\MetricCategory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PerformanceMetric extends Model
{
    use AuditsActivity;
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'code',
        'name',
        'category',
        'description',
        'is_active',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'category' => MetricCategory::class,
        ];
    }

    public function records(): HasMany
    {
        return $this->hasMany(StudentPerformanceRecord::class);
    }

    public function indicatorSubmissionItems(): HasMany
    {
        return $this->hasMany(IndicatorSubmissionItem::class);
    }
}
