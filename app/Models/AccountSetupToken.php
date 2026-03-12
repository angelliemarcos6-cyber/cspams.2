<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
        'expires_at',
        'used_at',
        'issued_ip',
        'issued_user_agent',
        'used_ip',
        'used_user_agent',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
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
        if ($this->expires_at === null) {
            return true;
        }

        return CarbonImmutable::parse($this->expires_at)->lte(CarbonImmutable::now());
    }

    public function isUsable(): bool
    {
        return $this->used_at === null && ! $this->isExpired();
    }
}
