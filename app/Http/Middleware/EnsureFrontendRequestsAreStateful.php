<?php

namespace App\Http\Middleware;

use App\Support\Auth\RequestAuthModeResolver;
use Illuminate\Routing\Pipeline;
use Illuminate\Support\Facades\Log;

class EnsureFrontendRequestsAreStateful
{
    /**
     * Handle the incoming requests.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  callable  $next
     * @return \Illuminate\Http\Response
     */
    public function handle($request, $next)
    {
        if (RequestAuthModeResolver::isToken($request)) {
            $response = $next($request);
            $this->logResolvedAuthMode($request, false);

            return $response;
        }

        return (new Pipeline(app()))
            ->send($request)
            ->through($this->frontendMiddleware())
            ->then(function ($request) use ($next) {
                $response = $next($request);
                $this->logResolvedAuthMode($request, true);

                return $response;
            });
    }

    /**
     * Get the middleware that should be applied to requests from the "frontend".
     *
     * @return array<int, mixed>
     */
    protected function frontendMiddleware(): array
    {
        $middleware = array_values(array_filter(array_unique([
            config('sanctum.middleware.encrypt_cookies', \Illuminate\Cookie\Middleware\EncryptCookies::class),
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            \Illuminate\Session\Middleware\StartSession::class,
            config('sanctum.middleware.validate_csrf_token', config('sanctum.middleware.verify_csrf_token', \Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class)),
            config('sanctum.middleware.authenticate_session'),
        ])));

        array_unshift($middleware, function ($request, $next) {
            $request->attributes->set('sanctum', true);

            return $next($request);
        });

        return $middleware;
    }

    protected function logResolvedAuthMode($request, bool $stateful): void
    {
        if (! (bool) config('auth_security.diagnostics.log_auth_mode', false)) {
            return;
        }

        Log::info('auth.mode', [
            'mode' => RequestAuthModeResolver::resolveAuthMode($request),
            'stateful_middleware_applied' => $stateful,
            'path' => $request->path(),
            'method' => $request->method(),
        ]);
    }
}
