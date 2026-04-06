<?php

namespace App\Notifications;

use App\Models\School;
use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SchoolHeadAccountSetupNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly School $school,
        private readonly string $setupUrl,
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
        $schoolName = (string) ($this->school->name ?? 'your school');
        $schoolCode = (string) ($this->school->school_code ?? 'N/A');

        return (new MailMessage())
            ->subject('CSPAMS account setup link')
            ->greeting('Hello ' . ((string) ($notifiable->name ?? 'School Head')) . ',')
            ->line("Your CSPAMS account for {$schoolName} ({$schoolCode}) is ready for activation.")
            ->line('Use the secure setup link below to set your password and enable your account.')
            ->action('Set up my CSPAMS account', $this->setupUrl)
            ->line('This one-time link expires on ' . $this->expiresAt->toDayDateTimeString() . '.')
            ->line('If you did not request this, contact your Division Monitor immediately.');
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'eventType' => 'account_setup',
            'title' => 'Account setup link sent',
            'message' => 'A setup link was sent for ' . ($this->school->name ?? 'your school') . '.',
            'schoolId' => (string) $this->school->id,
            'schoolName' => (string) ($this->school->name ?? ''),
            'expiresAt' => $this->expiresAt->toISOString(),
            'createdAt' => now()->toISOString(),
        ];
    }
}
