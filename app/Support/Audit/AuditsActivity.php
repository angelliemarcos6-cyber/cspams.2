<?php

namespace App\Support\Audit;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

trait AuditsActivity
{
    protected static function bootAuditsActivity(): void
    {
        static::created(function (Model $model): void {
            self::storeAudit('created', $model);
        });

        static::updated(function (Model $model): void {
            self::storeAudit('updated', $model, [
                'changes' => $model->getChanges(),
                'original' => $model->getOriginal(),
            ]);
        });

        static::deleted(function (Model $model): void {
            self::storeAudit('deleted', $model);
        });
    }

    /**
     * @param array<string, mixed> $extra
     */
    private static function storeAudit(string $action, Model $model, array $extra = []): void
    {
        if (! class_exists(AuditLog::class)) {
            return;
        }

        AuditLog::query()->create([
            'user_id' => auth()->id(),
            'action' => $action,
            'auditable_type' => $model::class,
            'auditable_id' => $model->getKey(),
            'metadata' => array_merge([
                'attributes' => $model->getAttributes(),
            ], $extra),
            'ip_address' => request()?->ip(),
            'user_agent' => request()?->userAgent(),
            'created_at' => now(),
        ]);
    }
}
