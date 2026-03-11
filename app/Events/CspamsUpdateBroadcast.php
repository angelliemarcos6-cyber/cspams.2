<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Schema;

class CspamsUpdateBroadcast implements ShouldBroadcast
{
    use Dispatchable;
    use SerializesModels;

    public string $connection = 'database';
    public string $queue = 'broadcasts';

    /**
     * @param array<string, mixed> $payload
     */
    public function __construct(public array $payload)
    {
    }

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('cspams-updates');
    }

    public function broadcastAs(): string
    {
        return 'cspams.update';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            ...$this->payload,
            'timestamp' => now()->toISOString(),
        ];
    }

    public function broadcastWhen(): bool
    {
        $connection = config("queue.connections.{$this->connection}");
        if (! is_array($connection)) {
            return false;
        }

        if (($connection['driver'] ?? null) !== 'database') {
            return true;
        }

        $jobsTable = (string) ($connection['table'] ?? 'jobs');

        return Schema::hasTable($jobsTable);
    }
}
