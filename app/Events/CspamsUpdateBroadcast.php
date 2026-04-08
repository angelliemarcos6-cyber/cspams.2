<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Schema;

class CspamsUpdateBroadcast implements ShouldBroadcast, ShouldDispatchAfterCommit
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

    /**
     * @return array<int, PrivateChannel>
     */
    public function broadcastOn(): array
    {
        $channels = [
            new PrivateChannel('cspams-updates.monitor'),
        ];

        $schoolId = $this->resolveSchoolId();
        if ($schoolId !== null) {
            $channels[] = new PrivateChannel('cspams-updates.school.' . $schoolId);
        }

        return $channels;
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

    private function resolveSchoolId(): ?int
    {
        $rawSchoolId = $this->payload['schoolId'] ?? null;
        if (is_numeric($rawSchoolId)) {
            $schoolId = (int) $rawSchoolId;
            if ($schoolId > 0) {
                return $schoolId;
            }
        }

        return null;
    }
}
