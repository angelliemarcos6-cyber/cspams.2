<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Auth\ApiUserResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;
use Symfony\Component\HttpFoundation\Response;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $this->requireUser($request);
        $perPage = $this->resolvePerPage($request);
        $notifications = $user->notifications()
            ->orderByDesc('created_at')
            ->paginate($perPage)
            ->appends($request->query());

        return response()->json([
            'data' => collect($notifications->items())
                ->map(fn (DatabaseNotification $notification): array => $this->serializeNotification($notification))
                ->values(),
            'meta' => [
                'currentPage' => $notifications->currentPage(),
                'lastPage' => $notifications->lastPage(),
                'perPage' => $notifications->perPage(),
                'total' => $notifications->total(),
                'unreadCount' => $user->unreadNotifications()->count(),
            ],
        ]);
    }

    public function markAsRead(Request $request, string $notification): JsonResponse
    {
        $user = $this->requireUser($request);

        /** @var DatabaseNotification|null $row */
        $row = $user->notifications()
            ->whereKey($notification)
            ->first();

        if (! $row) {
            return response()->json(['message' => 'Notification not found.'], Response::HTTP_NOT_FOUND);
        }

        if (! $row->read_at) {
            $row->markAsRead();
        }

        return response()->json([
            'data' => $this->serializeNotification($row->fresh()),
        ]);
    }

    public function markAllAsRead(Request $request): JsonResponse
    {
        $user = $this->requireUser($request);
        $updated = $user->unreadNotifications()->update(['read_at' => now()]);

        return response()->json([
            'data' => [
                'updated' => $updated,
            ],
        ]);
    }

    private function requireUser(Request $request): User
    {
        $user = ApiUserResolver::fromRequest($request);
        abort_if(! $user, Response::HTTP_UNAUTHORIZED, 'Unauthenticated.');

        return $user;
    }

    private function resolvePerPage(Request $request, int $default = 25, int $max = 100): int
    {
        $perPage = $request->integer('per_page');

        if ($perPage <= 0) {
            return $default;
        }

        return min($perPage, $max);
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeNotification(DatabaseNotification $notification): array
    {
        $payload = is_array($notification->data) ? $notification->data : [];

        return [
            'id' => (string) $notification->id,
            'type' => (string) $notification->type,
            'eventType' => (string) ($payload['eventType'] ?? 'notification'),
            'title' => (string) ($payload['title'] ?? 'Notification'),
            'message' => (string) ($payload['message'] ?? 'You have a new notification.'),
            'readAt' => optional($notification->read_at)->toISOString(),
            'createdAt' => optional($notification->created_at)->toISOString(),
            'data' => $payload,
        ];
    }
}
