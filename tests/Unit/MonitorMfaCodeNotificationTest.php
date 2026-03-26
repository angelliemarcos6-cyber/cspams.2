<?php

namespace Tests\Unit;

use App\Notifications\MonitorMfaCodeNotification;
use Tests\TestCase;

class MonitorMfaCodeNotificationTest extends TestCase
{
    public function test_sync_queue_default_is_upgraded_to_database_for_mfa_mail_delivery(): void
    {
        config()->set('queue.default', 'sync');
        config()->set('auth_mfa.monitor.queue_connection', null);
        config()->set('auth_mfa.monitor.queue', 'mail');

        $notification = new MonitorMfaCodeNotification('123456', now()->addMinutes(10)->toDateTimeString());

        $this->assertSame('database', $notification->connection);
        $this->assertSame('mail', $notification->queue);
    }
}
