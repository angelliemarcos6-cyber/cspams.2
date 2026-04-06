<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class MonitorMfaResetApprovedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly string $approvalToken,
        private readonly string $expiresAt,
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
            ->subject('CSPAMS MFA Reset Approval')
            ->greeting('Hello ' . ((string) ($notifiable->name ?? 'Division Monitor')) . ',')
            ->line('Your MFA reset request was approved by an administrator.')
            ->line('Approval token: ' . $this->approvalToken)
            ->line('This token expires at: ' . $this->expiresAt)
            ->line('Use this token in the MFA reset completion flow to regenerate your backup codes.');
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'eventType' => 'mfa_reset_approved',
            'title' => 'MFA reset approved',
            'message' => 'Your MFA reset request was approved. Check your email for the approval token.',
            'expiresAt' => $this->expiresAt,
            'createdAt' => now()->toISOString(),
        ];
    }

    public function approvalToken(): string
    {
        return $this->approvalToken;
    }
}
