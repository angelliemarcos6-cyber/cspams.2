<?php

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        channels: __DIR__.'/../routes/channels.php',
        apiPrefix: 'api',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Keep CSRF protection on the web middleware group.
        // API auth in this app is bearer-token based via auth:sanctum.
        $middleware->validateCsrfTokens();
        $middleware->throttleApi('api');
        $middleware->redirectGuestsTo(static function (Request $request): ?string {
            if ($request->expectsJson() || $request->is('api/*')) {
                return null;
            }

            return '/admin/login';
        });
        $middleware->appendToGroup('api', [
            \App\Http\Middleware\DetectSqlInjectionPayload::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (AuthenticationException $exception, Request $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json([
                    'message' => 'Unauthenticated.',
                ], 401);
            }

            return null;
        });
    })->create();
