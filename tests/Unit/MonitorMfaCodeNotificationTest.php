<?php

namespace Tests\Unit;

use App\Notifications\MonitorMfaCodeNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Tests\TestCase;

class MonitorMfaCodeNotificationTest extends TestCase
{
    public function test_monitor_mfa_code_notification_is_sent_inline_and_not_queued(): void
    {
        $notification = new MonitorMfaCodeNotification('123456', now()->addMinutes(10)->toDateTimeString());

        $this->assertNotInstanceOf(ShouldQueue::class, $notification);
    }
}
