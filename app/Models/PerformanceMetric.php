<?php

namespace App\Models;

use App\Support\Audit\AuditsActivity;
use App\Support\Domain\MetricDataType;
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
        'framework',
        'data_type',
        'description',
        'input_schema',
        'unit',
        'sort_order',
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
            'data_type' => MetricDataType::class,
            'input_schema' => 'array',
            'sort_order' => 'integer',
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
