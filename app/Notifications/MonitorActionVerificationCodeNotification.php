<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class MonitorActionVerificationCodeNotification extends Notification
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
        return ['mail'];
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
}

