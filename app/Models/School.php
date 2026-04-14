<?php

namespace App\Models;

use App\Traits\Filterable;
use App\Support\Audit\AuditsActivity;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Schema;

class School extends Model
{
    use AuditsActivity;
    use Filterable;
    use HasFactory;
    use SoftDeletes;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'school_code',
        'name',
        'level',
        'district',
        'address',
        'region',
        'type',
        'status',
        'reported_student_count',
        'reported_teacher_count',
        'submitted_by',
        'submitted_at',
    ];

    protected string $filterableSchoolColumn = 'id';

    protected ?string $filterableDateColumn = 'submitted_at';

    /**
     * @var list<string>
     */
    protected array $filterableSearchColumns = [
        'school_code',
        'name',
        'level',
        'district',
        'address',
        'region',
        'type',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'reported_student_count' => 'integer',
            'reported_teacher_count' => 'integer',
            'submitted_at' => 'datetime',
        ];
    }

    public function setSchoolCodeAttribute(mixed $value): void
    {
        $normalized = trim((string) $value);

        $this->attributes['school_code'] = $normalized;
        $this->attributes['school_code_normalized'] = strtolower($normalized);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function schoolHeadAccounts(): HasMany
    {
        $relation = $this->hasMany(User::class);

        if (Schema::hasColumn('users', 'account_type')) {
            return $relation->where('account_type', UserRoleResolver::SCHOOL_HEAD);
        }

        $aliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);

        return $relation->whereHas('roles', static function ($builder) use ($aliases): void {
            $builder->whereIn('name', $aliases);
        });
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function sections(): HasMany
    {
        return $this->hasMany(Section::class);
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class);
    }

    public function teachers(): HasMany
    {
        return $this->hasMany(Teacher::class);
    }

    public function indicatorSubmissions(): HasMany
    {
        return $this->hasMany(IndicatorSubmission::class);
    }

    public function latestIndicatorSubmission(): HasOne
    {
        return $this->hasOne(IndicatorSubmission::class)->ofMany([
            'updated_at' => 'max',
            'id' => 'max',
        ]);
    }
}
