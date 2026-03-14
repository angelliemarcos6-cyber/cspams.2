<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class InstrumentStudentCrudTiming
{
    private const DURATION_HEADER = 'X-Student-Request-Duration-Ms';
    private const SERVER_TIMING_HEADER = 'Server-Timing';
    private const SERVER_TIMING_METRIC = 'studentCrud';
    private const SLOW_REQUEST_THRESHOLD_MS = 800.0;

    public function handle(Request $request, Closure $next): Response
    {
        $startedAtNs = hrtime(true);

        try {
            /** @var Response $response */
            $response = $next($request);
        } catch (\Throwable $exception) {
            $durationMs = $this->durationInMilliseconds($startedAtNs);
            $this->logTiming($request, null, $durationMs, $exception);

            throw $exception;
        }

        $durationMs = $this->durationInMilliseconds($startedAtNs);
        $response->headers->set(self::DURATION_HEADER, number_format($durationMs, 2, '.', ''));
        $this->appendServerTimingMetric($response, $durationMs);
        $this->logTiming($request, $response, $durationMs);

        return $response;
    }

    private function durationInMilliseconds(int $startedAtNs): float
    {
        return round((hrtime(true) - $startedAtNs) / 1_000_000, 2);
    }

    private function appendServerTimingMetric(Response $response, float $durationMs): void
    {
        $metric = sprintf('%s;dur=%.2f', self::SERVER_TIMING_METRIC, $durationMs);
        $existing = trim((string) $response->headers->get(self::SERVER_TIMING_HEADER, ''));

        $response->headers->set(
            self::SERVER_TIMING_HEADER,
            $existing !== '' ? $existing . ', ' . $metric : $metric,
        );
    }

    private function logTiming(
        Request $request,
        ?Response $response,
        float $durationMs,
        ?\Throwable $exception = null,
    ): void {
        $routeStudent = $request->route('student');
        $studentId = null;

        if ($routeStudent instanceof Model) {
            $studentId = (string) $routeStudent->getKey();
        } elseif (is_scalar($routeStudent) && (string) $routeStudent !== '') {
            $studentId = (string) $routeStudent;
        }

        $user = $request->user();
        $context = [
            'method' => $request->method(),
            'path' => '/' . ltrim($request->path(), '/'),
            'route' => $request->route()?->uri(),
            'status_code' => $response?->getStatusCode(),
            'duration_ms' => $durationMs,
            'student_id' => $studentId,
            'school_id' => $user?->school_id ? (string) $user->school_id : null,
            'user_id' => $user?->id ? (string) $user->id : null,
        ];

        if ($exception) {
            $context['exception'] = $exception::class;
        }

        if ($durationMs >= self::SLOW_REQUEST_THRESHOLD_MS || $exception) {
            Log::warning('student_crud.request_timing', $context);

            return;
        }

        Log::info('student_crud.request_timing', $context);
    }
}
