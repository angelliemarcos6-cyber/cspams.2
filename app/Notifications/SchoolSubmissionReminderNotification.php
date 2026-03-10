<?php

namespace App\Notifications;

use App\Models\School;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SchoolSubmissionReminderNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly School $school,
        private readonly User $monitor,
        private readonly ?string $notes = null,
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
        $schoolCode = (string) ($this->school->school_code ?? 'N/A');
        $schoolName = (string) ($this->school->name ?? 'Your school');
        $monitorName = (string) ($this->monitor->name ?? 'Division Monitor');

        $mail = (new MailMessage())
            ->subject("CSPAMS Reminder: {$schoolName} ({$schoolCode})")
            ->greeting('Hello ' . ((string) ($notifiable->name ?? 'School Head')) . ',')
            ->line("{$monitorName} sent a reminder to update and submit your school's latest CSPAMS records.")
            ->line("School: {$schoolName}")
            ->line("School Code: {$schoolCode}");

        if ($this->notes !== null && $this->notes !== '') {
            $mail->line('Reminder note: ' . $this->notes);
        }

        return $mail
            ->action('Open CSPAMS', url('/'))
            ->line('Please review your pending requirements and submit as soon as possible.');
    }
}
