<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class DetectSqlInjectionPayload
{
    private const MAX_SCAN_DEPTH = 10;

    private ?bool $guardEnabledCache = null;

    /**
     * @var list<string>|null
     */
    private ?array $excludedKeysCache = null;

    /**
     * @var list<string>|null
     */
    private ?array $patternsCache = null;

    private ?int $maxInputLengthCache = null;

    /**
     * @param \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response) $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->guardEnabled()) {
            return $next($request);
        }

        $suspicious = $this->scanInput([
            'query' => $request->query(),
            'body' => $request->except($this->excludedKeys()),
            'route' => $request->route()?->parameters() ?? [],
        ]);

        if ($suspicious === null) {
            return $next($request);
        }

        Log::warning('Blocked suspicious request payload pattern.', [
            'category' => 'security',
            'event' => 'request.blocked.sql_injection_pattern',
            'path' => $request->path(),
            'method' => $request->method(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'detected_field' => $suspicious['field'],
            'detected_pattern' => $suspicious['pattern'],
        ]);

        return $this->blockedResponse();
    }

    private function blockedResponse(): JsonResponse
    {
        return response()->json(
            [
                'message' => 'Request blocked by security policy.',
                'error' => 'suspicious_input_detected',
            ],
            Response::HTTP_FORBIDDEN,
        );
    }

    private function guardEnabled(): bool
    {
        if ($this->guardEnabledCache !== null) {
            return $this->guardEnabledCache;
        }

        return $this->guardEnabledCache = (bool) config('security_guard.sql_injection_guard.enabled', true);
    }

    /**
     * @return list<string>
     */
    private function excludedKeys(): array
    {
        if ($this->excludedKeysCache !== null) {
            return $this->excludedKeysCache;
        }

        $keys = config('security_guard.sql_injection_guard.excluded_keys', []);
        if (! is_array($keys)) {
            return [];
        }

        return $this->excludedKeysCache = array_values(array_filter(
            array_map(static fn (mixed $value): string => strtolower(trim((string) $value)), $keys),
        ));
    }

    /**
     * @return list<string>
     */
    private function patterns(): array
    {
        if ($this->patternsCache !== null) {
            return $this->patternsCache;
        }

        $configured = config('security_guard.sql_injection_guard.patterns', []);
        if (! is_array($configured)) {
            return [];
        }

        return $this->patternsCache = array_values(
            array_filter(
                array_map(static fn (mixed $pattern): string => trim((string) $pattern), $configured),
                static fn (string $pattern): bool => $pattern !== '',
            ),
        );
    }

    private function maxInputLength(): int
    {
        if ($this->maxInputLengthCache !== null) {
            return $this->maxInputLengthCache;
        }

        return $this->maxInputLengthCache = max(64, (int) config('security_guard.sql_injection_guard.max_input_length', 4000));
    }

    /**
     * @param mixed $value
     * @return array{field: string, pattern: string}|null
     */
    private function scanInput(mixed $value, string $path = '', int $depth = 0): ?array
    {
        if ($depth > self::MAX_SCAN_DEPTH) {
            return null;
        }

        if (is_array($value)) {
            foreach ($value as $key => $nestedValue) {
                $segment = strtolower(trim((string) $key));
                if ($segment !== '' && in_array($segment, $this->excludedKeys(), true)) {
                    continue;
                }

                $nestedPath = $path === '' ? (string) $key : $path . '.' . $key;
                $result = $this->scanInput($nestedValue, $nestedPath, $depth + 1);
                if ($result !== null) {
                    return $result;
                }
            }

            return null;
        }

        if (! is_scalar($value) && $value !== null) {
            return null;
        }

        $candidate = trim((string) $value);
        if ($candidate === '') {
            return null;
        }

        if (mb_strlen($candidate) > $this->maxInputLength()) {
            return null;
        }

        $decoded = rawurldecode($candidate);
        foreach ($this->patterns() as $pattern) {
            $matched = @preg_match($pattern, $decoded);
            if ($matched === false || $matched === 0) {
                continue;
            }

            return [
                'field' => $path !== '' ? $path : 'input',
                'pattern' => $pattern,
            ];
        }

        return null;
    }
}
