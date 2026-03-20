<?php

namespace App\Notifications;

use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class MonitorPasswordResetNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $resetUrl,
        private readonly CarbonImmutable $expiresAt,
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
            ->subject('Reset your CSPAMS monitor password')
            ->greeting('Hello ' . ((string) ($notifiable->name ?? 'Monitor')) . ',')
            ->line('We received a request to reset the password for your CSPAMS monitor account.')
            ->action('Reset my password', $this->resetUrl)
            ->line('This secure reset link expires on ' . $this->expiresAt->toDayDateTimeString() . '.')
            ->line('If you did not request this reset, you can ignore this email.');
    }
}

