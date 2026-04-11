<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class WelfareConcernAttachment extends Model
{
    protected $fillable = [
        'concern_id',
        'file_path',
        'original_filename',
        'file_type',
        'uploaded_by',
    ];

    public $timestamps = true;

    public function concern(): BelongsTo
    {
        return $this->belongsTo(WelfareConcern::class);
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    // Encrypt file path before storage
    public function setFilePathAttribute($value)
    {
        $this->attributes['file_path'] = Crypt::encrypt($value);
    }

    // Decrypt on retrieval
    public function getFilePathAttribute($value)
    {
        return Crypt::decrypt($value);
    }
}
