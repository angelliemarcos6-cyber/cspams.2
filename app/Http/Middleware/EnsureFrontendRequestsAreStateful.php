<?php

namespace App\Http\Middleware;

use Illuminate\Routing\Pipeline;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

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
        $this->configureSecureCookieSessions();

        return (new Pipeline(app()))->send($request)->through(
            static::fromFrontend($request) ? $this->frontendMiddleware() : []
        )->then(function ($request) use ($next) {
            return $next($request);
        });
    }

    /**
     * Configure secure cookie sessions.
     */
    protected function configureSecureCookieSessions(): void
    {
        $sameSite = config('session.same_site', 'lax');
        if (! is_string($sameSite) || trim($sameSite) === '') {
            $sameSite = 'lax';
        }

        config([
            'session.http_only' => true,
            'session.same_site' => strtolower(trim($sameSite)),
            'session.secure' => (bool) config('session.secure', false),
            'session.partitioned' => (bool) config('session.partitioned', false),
        ]);
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

    /**
     * Determine if the given request is from the first-party application frontend.
     *
     * Sanctum's stock detector only trusts Origin / Referer headers. Browsers can
     * legitimately omit those on same-origin requests, so we also treat existing
     * session / XSRF cookies as first-party evidence.
     *
     * @param  \Illuminate\Http\Request  $request
     */
    public static function fromFrontend($request): bool
    {
        if (static::prefersTokenTransport($request)) {
            return false;
        }

        if (static::matchesStatefulOrigin($request)) {
            return true;
        }

        if (static::hasStatefulBrowserCookies($request)) {
            return true;
        }

        return static::hasCsrfHandshakeHeaders($request);
    }

    /**
     * Determine if the request explicitly prefers stateless bearer-token auth.
     *
     * @param  \Illuminate\Http\Request  $request
     */
    protected static function prefersTokenTransport($request): bool
    {
        if (trim((string) $request->bearerToken()) !== '') {
            return true;
        }

        return strtolower(trim((string) $request->headers->get('X-CSPAMS-Auth-Transport', ''))) === 'token';
    }

    /**
     * Determine if the request origin or referer matches the configured stateful domains.
     *
     * @param  \Illuminate\Http\Request  $request
     */
    protected static function matchesStatefulOrigin($request): bool
    {
        $domain = $request->headers->get('referer') ?: $request->headers->get('origin');

        if (is_null($domain)) {
            return false;
        }

        $domain = Str::replaceFirst('https://', '', $domain);
        $domain = Str::replaceFirst('http://', '', $domain);
        $domain = Str::endsWith($domain, '/') ? $domain : "{$domain}/";

        $stateful = array_filter(config('sanctum.stateful', []));

        return Str::is(Collection::make($stateful)->map(function ($uri) use ($request) {
            $uri = $uri === Sanctum::$currentRequestHostPlaceholder ? $request->getHttpHost() : $uri;

            return trim($uri).'/*';
        })->all(), $domain);
    }

    /**
     * Determine if the request already carries the SPA's session or XSRF cookies.
     *
     * @param  \Illuminate\Http\Request  $request
     */
    protected static function hasStatefulBrowserCookies($request): bool
    {
        $sessionCookieName = trim((string) config('session.cookie', ''));

        if ($sessionCookieName !== '' && trim((string) $request->cookie($sessionCookieName)) !== '') {
            return true;
        }

        return trim((string) $request->cookie('XSRF-TOKEN')) !== '';
    }

    /**
     * Determine if the request is actively performing the SPA CSRF handshake.
     *
     * @param  \Illuminate\Http\Request  $request
     */
    protected static function hasCsrfHandshakeHeaders($request): bool
    {
        return trim((string) $request->headers->get('X-XSRF-TOKEN')) !== ''
            || trim((string) $request->headers->get('X-CSRF-TOKEN')) !== '';
    }
}
