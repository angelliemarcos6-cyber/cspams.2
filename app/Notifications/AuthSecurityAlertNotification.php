<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class AuthSecurityAlertNotification extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param array<string, mixed> $context
     */
    public function __construct(
        private readonly string $action,
        private readonly string $outcome,
        private readonly string $severity,
        private readonly string $title,
        private readonly string $message,
        private readonly array $context = [],
    ) {
        $this->onQueue('notifications');
    }

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return array_merge([
            'eventType' => 'auth_security_alert',
            'title' => $this->title,
            'message' => $this->message,
            'severity' => $this->severity,
            'action' => $this->action,
            'outcome' => $this->outcome,
            'createdAt' => now()->toISOString(),
        ], $this->context);
    }
}
