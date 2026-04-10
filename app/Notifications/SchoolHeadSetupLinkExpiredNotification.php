<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class SchoolHeadSetupLinkExpiredNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $schoolName,
        private readonly string $schoolCode,
        private readonly string $schoolHeadEmail,
    ) {
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
        return [
            'eventType' => 'school_head_setup_link_expired',
            'title' => 'School Head setup link expired',
            'message' => "The setup link for {$this->schoolName} ({$this->schoolCode}) has expired. Reissue a new link if the School Head still needs access.",
            'schoolName' => $this->schoolName,
            'schoolCode' => $this->schoolCode,
            'schoolHeadEmail' => $this->schoolHeadEmail,
            'createdAt' => now()->toISOString(),
        ];
    }
}
