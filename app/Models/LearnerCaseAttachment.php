<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class LearnerCaseAttachment extends Model
{
    protected $table = 'learner_case_attachments';

    protected $fillable = [
        'concern_id',
        'file_path',
        'original_filename',
        'file_type',
        'uploaded_by',
    ];

    public function learnerCase(): BelongsTo
    {
        return $this->belongsTo(LearnerCase::class, 'concern_id');
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    // Encrypt file path before storage
    public function setFilePathAttribute(string $value): void
    {
        $this->attributes['file_path'] = Crypt::encrypt($value);
    }

    // Decrypt on retrieval
    public function getFilePathAttribute(string $value): string
    {
        return Crypt::decrypt($value);
    }
}
