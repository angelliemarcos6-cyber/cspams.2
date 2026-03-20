<?php

namespace App\Models;

use App\Support\Domain\AccountStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens;
    use HasFactory;
    use HasRoles;
    use Notifiable;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'must_reset_password',
        'password_changed_at',
        'last_login_at',
        'last_login_ip',
        'last_login_user_agent',
        'account_status',
        'mfa_backup_codes',
        'mfa_backup_codes_generated_at',
        'school_id',
        'flagged_at',
        'flagged_by_user_id',
        'flagged_reason',
        'delete_record_flagged_at',
        'delete_record_flagged_by_user_id',
        'delete_record_flag_reason',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'must_reset_password' => 'boolean',
            'password_changed_at' => 'datetime',
            'last_login_at' => 'datetime',
            'account_status' => AccountStatus::class,
            'mfa_backup_codes' => 'array',
            'mfa_backup_codes_generated_at' => 'datetime',
            'flagged_at' => 'datetime',
            'delete_record_flagged_at' => 'datetime',
        ];
    }

    public function accountStatus(): AccountStatus
    {
        $rawStatus = $this->getRawOriginal('account_status');

        if ($rawStatus instanceof AccountStatus) {
            return $rawStatus;
        }

        if (is_string($rawStatus)) {
            $normalized = strtolower(trim($rawStatus));
            if ($normalized === '') {
                return AccountStatus::ACTIVE;
            }

            $status = AccountStatus::tryFrom($normalized);
            if ($status instanceof AccountStatus) {
                return $status;
            }

            return AccountStatus::LOCKED;
        }

        return AccountStatus::LOCKED;
    }

    public function canAuthenticate(): bool
    {
        return $this->accountStatus()->allowsLogin();
    }

    public function setEmailAttribute(mixed $value): void
    {
        $normalized = strtolower(trim((string) $value));

        $this->attributes['email'] = $normalized;
        $this->attributes['email_normalized'] = $normalized;
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function submittedSchools(): HasMany
    {
        return $this->hasMany(School::class, 'submitted_by');
    }

    public function monitorMfaResetTickets(): HasMany
    {
        return $this->hasMany(MonitorMfaResetTicket::class);
    }

    public function accountSetupTokens(): HasMany
    {
        return $this->hasMany(AccountSetupToken::class);
    }

    public function latestAccountSetupToken(): HasOne
    {
        return $this->hasOne(AccountSetupToken::class)->latestOfMany('id');
    }

    public function flaggedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'flagged_by_user_id');
    }
}
