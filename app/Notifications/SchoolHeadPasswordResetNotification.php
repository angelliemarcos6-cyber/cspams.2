<?php

namespace App\Notifications;

use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SchoolHeadPasswordResetNotification extends Notification implements ShouldQueue
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
        return ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage())
            ->subject('Reset your CSPAMS School Head password')
            ->greeting('Hello ' . ((string) ($notifiable->name ?? 'School Head')) . ',')
            ->line('We received a request to reset the password for your CSPAMS School Head account.')
            ->action('Reset my password', $this->resetUrl)
            ->line('This secure reset link expires on ' . $this->expiresAt->toDayDateTimeString() . '.')
            ->line('If you did not request this reset, you can ignore this email.');
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'eventType' => 'password_reset',
            'title' => 'Password reset requested',
            'message' => 'A password reset link was sent to your email.',
            'expiresAt' => $this->expiresAt->toISOString(),
            'createdAt' => now()->toISOString(),
        ];
    }
}

