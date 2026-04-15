<?php

namespace App\Models;

use App\Support\Audit\AuditsActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Teacher extends Model
{
    use AuditsActivity;
    use HasFactory;
    use SoftDeletes;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'school_id',
        'name',
        'sex',
    ];

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }
}

