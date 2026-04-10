<?php

namespace App\Http\Middleware;

use App\Support\Auth\ApiUserResolver;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateApiRequest
{
    /**
     * @param  Closure(Request): Response  $next
     *
     * @throws AuthenticationException
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = ApiUserResolver::fromRequest($request);

        if ($user === null) {
            throw new AuthenticationException();
        }

        $request->setUserResolver(static fn (?string $guard = null) => $user);

        return $next($request);
    }
}
