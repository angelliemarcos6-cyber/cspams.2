<?php

use App\Models\School;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

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
        // Keep CSRF protection on the web middleware group and enable
        // Sanctum's stateful SPA middleware so first-party dashboard auth
        // requests can establish and reuse browser sessions through the API.
        $middleware->statefulApi();
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

        $exceptions->render(function (ModelNotFoundException $exception, Request $request) {
            if (! ($request->expectsJson() || $request->is('api/*'))) {
                return null;
            }

            $model = $exception->getModel();
            if ($model === School::class) {
                return response()->json([
                    'message' => 'School record not found. It may have been archived or permanently deleted.',
                ], 404);
            }

            return null;
        });

        $exceptions->render(function (NotFoundHttpException $exception, Request $request) {
            if (! ($request->expectsJson() || $request->is('api/*'))) {
                return null;
            }

            $previous = $exception->getPrevious();
            if ($previous instanceof ModelNotFoundException && $previous->getModel() === School::class) {
                return response()->json([
                    'message' => 'School record not found. It may have been archived or permanently deleted.',
                ], 404);
            }

            return null;
        });
    })->create();
