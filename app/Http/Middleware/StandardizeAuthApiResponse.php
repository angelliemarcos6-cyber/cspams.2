<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class StandardizeAuthApiResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $response instanceof JsonResponse) {
            return $response;
        }

        $status = $response->getStatusCode();
        $success = $status >= 200 && $status < 400;
        $payload = $response->getData(true);
        $payload = is_array($payload) ? $payload : [];

        $normalizedStatus = $status === Response::HTTP_NO_CONTENT
            ? Response::HTTP_OK
            : $status;

        $message = $this->messageFor($request, $payload, $normalizedStatus, $success);
        $data = $this->dataFor($payload, $success);

        $response->setData(array_merge($payload, [
            'success' => $success,
            'message' => $message,
            'data' => $data,
        ]));

        $response->setStatusCode($normalizedStatus);

        return $response;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return mixed
     */
    private function dataFor(array $payload, bool $success): mixed
    {
        if (! $success) {
            return null;
        }

        if (array_key_exists('data', $payload)) {
            return $payload['data'];
        }

        if ($payload === []) {
            return null;
        }

        unset($payload['success'], $payload['message']);

        return $payload === [] ? null : $payload;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function messageFor(Request $request, array $payload, int $status, bool $success): string
    {
        $existing = trim((string) ($payload['message'] ?? ''));
        if ($existing !== '') {
            return $existing;
        }

        $path = trim($request->path(), '/');

        return match (true) {
            ! $success && $status === Response::HTTP_UNAUTHORIZED => 'Unauthenticated.',
            ! $success && $status === Response::HTTP_FORBIDDEN => 'Access denied.',
            ! $success && $status === Response::HTTP_UNPROCESSABLE_ENTITY => 'The request could not be completed.',
            ! $success && $status === Response::HTTP_TOO_MANY_REQUESTS => 'Too many attempts. Please try again later.',
            ! $success && $status === 419 => 'Your session has expired. Refresh CSRF protection and try again.',
            $success && str_ends_with($path, 'auth/login') => 'Login successful.',
            $success && str_ends_with($path, 'auth/logout') => 'Logout successful.',
            $success && str_ends_with($path, 'auth/me') => 'Authenticated user retrieved.',
            $success && str_ends_with($path, 'auth/refresh') => 'Token refreshed successfully.',
            $success && str_ends_with($path, 'auth/sessions') => 'Active sessions retrieved.',
            $success && str_contains($path, 'auth/sessions/revoke-others') => 'Other active sessions were revoked.',
            $success && str_contains($path, 'auth/sessions/') => 'Session revoked successfully.',
            default => $success ? 'Request successful.' : 'Request failed.',
        };
    }
}
