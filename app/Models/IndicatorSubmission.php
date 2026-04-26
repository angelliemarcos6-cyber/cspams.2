<?php

namespace App\Models;

use App\Support\Indicators\GroupBWorkspaceDefinition;
use App\Traits\Filterable;
use App\Support\Audit\AuditsActivity;
use App\Support\Domain\FormSubmissionStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class IndicatorSubmission extends Model
{
    use AuditsActivity;
    use Filterable;
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
        // BMEF/SMEA upload support added per redesign doc
        'bmef_file_path',
        'bmef_original_filename',
        'bmef_uploaded_at',
        'bmef_file_size',
        'smea_file_path',
        'smea_original_filename',
        'smea_uploaded_at',
        'smea_file_size',
        'created_by',
        'submitted_by',
        'submitted_at',
        'reviewed_by',
        'reviewed_at',
        'review_notes',
    ];

    /**
     * @var list<string>
     */
    protected array $filterableSearchColumns = [
        'reporting_period',
        'notes',
    ];

    protected ?string $filterableDateColumn = 'submitted_at';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => FormSubmissionStatus::class,
            'bmef_uploaded_at' => 'datetime',
            'bmef_file_size' => 'integer',
            'smea_uploaded_at' => 'datetime',
            'smea_file_size' => 'integer',
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

    public function hasImetaFormData(): bool
    {
        return $this->hasCompleteImetaFormData();
    }

    public function hasCompleteImetaFormData(): bool
    {
        $groupAMetricCodes = GroupBWorkspaceDefinition::metricCodesFor(GroupBWorkspaceDefinition::SCHOOL_ACHIEVEMENTS);
        if ($groupAMetricCodes === []) {
            return false;
        }

        $items = $this->items()
            ->select(['id', 'indicator_submission_id', 'performance_metric_id', 'actual_value', 'actual_typed_value', 'actual_display'])
            ->with('metric:id,code')
            ->get();

        if ($items->isEmpty()) {
            return false;
        }

        $groupACodeSet = array_flip(array_map(
            static fn (string $code): string => strtoupper(trim($code)),
            $groupAMetricCodes,
        ));

        foreach ($items as $item) {
            $code = strtoupper(trim((string) ($item->metric?->code ?? '')));
            if ($code === '' || ! isset($groupACodeSet[$code])) {
                continue;
            }

            if ($this->itemHasMeaningfulActualValue($item)) {
                return true;
            }
        }

        return false;
    }

    public function hasBmefFile(): bool
    {
        return is_string($this->bmef_file_path) && trim($this->bmef_file_path) !== '';
    }

    public function hasSmeaFile(): bool
    {
        return is_string($this->smea_file_path) && trim($this->smea_file_path) !== '';
    }

    public function isCompleteSubmissionPackage(): bool
    {
        return $this->hasImetaFormData()
            && $this->hasBmefFile()
            && $this->hasSmeaFile();
    }

    private function itemHasMeaningfulActualValue(IndicatorSubmissionItem $item): bool
    {
        if ($item->actual_typed_value !== null) {
            return $this->hasMeaningfulTypedValue($item->actual_typed_value);
        }

        $actualDisplay = trim((string) ($item->actual_display ?? ''));
        if ($actualDisplay !== '') {
            return true;
        }

        return $item->actual_value !== null;
    }

    private function hasMeaningfulTypedValue(mixed $value): bool
    {
        if (is_array($value)) {
            foreach ($value as $entry) {
                if ($this->hasMeaningfulTypedValue($entry)) {
                    return true;
                }
            }

            return false;
        }

        if (is_string($value)) {
            return trim($value) !== '';
        }

        if (is_bool($value)) {
            return true;
        }

        if (is_numeric($value)) {
            return true;
        }

        return $value !== null;
    }
}
