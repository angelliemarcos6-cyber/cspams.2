<?php

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;

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
        $middleware->statefulApi();
        $middleware->throttleApi('api');
        $middleware->api(replace: [
            \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class
                => \App\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
        ]);
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
                    'success' => false,
                    'message' => 'Unauthenticated.',
                    'data' => null,
                    'reauthenticate' => true,
                ], 401);
            }

            return null;
        });

        $exceptions->render(function (TokenMismatchException $exception, Request $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Your session has expired. Refresh CSRF protection and try again.',
                    'data' => null,
                    'refreshCsrf' => true,
                    'retryable' => true,
                ], 419);
            }

            return null;
        });

        $exceptions->render(function (ValidationException $exception, Request $request) {
            if (! $request->is('api/auth/*')) {
                return null;
            }

            $errors = $exception->errors();
            $message = trim((string) $exception->getMessage());

            if ($message === '' || strtolower($message) === 'the given data was invalid.') {
                foreach ($errors as $fieldErrors) {
                    if (is_array($fieldErrors) && isset($fieldErrors[0]) && is_string($fieldErrors[0])) {
                        $message = $fieldErrors[0];
                        break;
                    }
                }
            }

            if ($message === '') {
                $message = 'The request could not be completed.';
            }

            return response()->json([
                'success' => false,
                'message' => $message,
                'data' => null,
                'errors' => $errors,
            ], $exception->status);
        });
    })->create();
