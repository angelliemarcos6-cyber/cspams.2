<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LearnerCaseThread extends Model
{
    protected $table = 'learner_case_threads';

    protected $fillable = [
        'concern_id',
        'user_id',
        'message',
    ];

    public function learnerCase(): BelongsTo
    {
        return $this->belongsTo(LearnerCase::class, 'concern_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
