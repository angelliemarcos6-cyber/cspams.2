<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class MonitorMfaCodeNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $code,
        private readonly string $expiresAt,
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
            ->subject('CSPAMS Monitor Login Verification Code')
            ->greeting('Hello ' . ((string) ($notifiable->name ?? 'Division Monitor')) . ',')
            ->line('A sign-in attempt requires MFA verification for your division-level account.')
            ->line('Verification code: ' . $this->code)
            ->line('This code expires at: ' . $this->expiresAt)
            ->line('If you did not initiate this request, reset your password immediately.');
    }

    public function verificationCode(): string
    {
        return $this->code;
    }
}
