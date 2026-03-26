<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class MonitorMfaCodeNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly string $code,
        private readonly string $expiresAt,
    ) {
        $this->onConnection($this->resolveQueueConnection());
        $this->onQueue($this->resolveQueueName());
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

    private function resolveQueueConnection(): string
    {
        $configured = trim((string) config('auth_mfa.monitor.queue_connection', ''));
        if ($configured !== '') {
            return $configured;
        }

        $default = trim((string) config('queue.default', 'database'));

        return strtolower($default) === 'sync' ? 'database' : $default;
    }

    private function resolveQueueName(): string
    {
        $configured = trim((string) config('auth_mfa.monitor.queue', 'mail'));

        return $configured !== '' ? $configured : 'mail';
    }
}
