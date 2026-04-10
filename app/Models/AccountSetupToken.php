<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class AccountSetupToken extends Model
{
    use HasFactory;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'issued_by_user_id',
        'token_hash',
        'token_secret_ciphertext',
        'expires_at',
        'expired_at',
        'used_at',
        'issued_ip',
        'issued_user_agent',
        'used_ip',
        'used_user_agent',
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
            'expires_at' => 'datetime',
            'expired_at' => 'datetime',
            'used_at' => 'datetime',
            'delivery_last_attempt_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function issuedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'issued_by_user_id');
    }

    public function isExpired(): bool
    {
        if ($this->expired_at !== null) {
            return true;
        }

        if ($this->expires_at === null) {
            return true;
        }

        return CarbonImmutable::parse($this->expires_at)->lte(CarbonImmutable::now());
    }

    public function isUsable(): bool
    {
        return $this->used_at === null && ! $this->isExpired();
    }

    public function revealPlainToken(): ?string
    {
        if (! $this->exists) {
            return null;
        }

        $secret = $this->revealSecret();
        if ($secret === null) {
            return null;
        }

        return $this->getKey() . '.' . $secret;
    }

    public function revealSecret(): ?string
    {
        $ciphertext = trim((string) $this->token_secret_ciphertext);
        if ($ciphertext === '') {
            return null;
        }

        try {
            $secret = Crypt::decryptString($ciphertext);
        } catch (\Throwable) {
            return null;
        }

        return trim($secret) !== '' ? $secret : null;
    }

    public function deliveryFailed(): bool
    {
        return in_array(strtolower(trim((string) $this->delivery_status)), ['failed', 'bounced'], true);
    }
}
