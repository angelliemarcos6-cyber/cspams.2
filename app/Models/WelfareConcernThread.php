<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WelfareConcernThread extends Model
{
    protected $fillable = ['concern_id', 'user_id', 'message'];
    public $timestamps = true;

    public function concern(): BelongsTo
    {
        return $this->belongsTo(WelfareConcern::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
