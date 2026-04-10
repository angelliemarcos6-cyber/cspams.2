<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class MonitorMfaResetTicket extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_REJECTED = 'rejected';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'requested_by_user_id',
        'approved_by_user_id',
        'status',
        'reason',
        'approval_token_hash',
        'approval_token_ciphertext',
        'approval_token_expires_at',
        'approved_at',
        'completed_at',
        'expires_at',
        'requested_ip',
        'requested_user_agent',
        'delivery_status',
        'delivery_message',
        'delivery_last_attempt_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'approval_token_expires_at' => 'datetime',
            'approved_at' => 'datetime',
            'completed_at' => 'datetime',
            'expires_at' => 'datetime',
            'delivery_last_attempt_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function revealApprovalToken(): ?string
    {
        $ciphertext = trim((string) $this->approval_token_ciphertext);
        if ($ciphertext === '') {
            return null;
        }

        try {
            $token = Crypt::decryptString($ciphertext);
        } catch (\Throwable) {
            return null;
        }

        return trim($token) !== '' ? $token : null;
    }

    public function deliveryFailed(): bool
    {
        return in_array(strtolower(trim((string) $this->delivery_status)), ['failed', 'bounced'], true);
    }
}
