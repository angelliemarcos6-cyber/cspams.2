<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class MonitorActionVerificationCodeNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly string $code,
        private readonly string $expiresAt,
        private readonly string $schoolName,
        private readonly string $actionLabel,
    ) {
    }

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage())
            ->subject('CSPAMS Account Action Confirmation Code')
            ->greeting('Hello ' . ((string) ($notifiable->name ?? 'Division Monitor')) . ',')
            ->line("A sensitive account action requires confirmation for {$this->schoolName}.")
            ->line('Action: ' . $this->actionLabel)
            ->line('Confirmation code: ' . $this->code)
            ->line('This code expires at: ' . $this->expiresAt)
            ->line('If you did not initiate this request, sign out and contact your administrator.');
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'eventType' => 'action_verification',
            'title' => 'Action verification code sent',
            'message' => "A verification code was sent for: {$this->actionLabel} ({$this->schoolName}).",
            'schoolName' => $this->schoolName,
            'actionLabel' => $this->actionLabel,
            'expiresAt' => $this->expiresAt,
            'createdAt' => now()->toISOString(),
        ];
    }
}

