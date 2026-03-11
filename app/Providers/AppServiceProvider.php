<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('api', function (Request $request): Limit {
            $key = $request->user()?->id
                ? 'user:' . $request->user()->id
                : 'ip:' . $request->ip();

            return Limit::perMinute(120)->by($key);
        });

        RateLimiter::for('auth-login', function (Request $request): array {
            $role = strtolower(trim((string) $request->input('role', 'unknown')));
            $login = strtolower(trim((string) $request->input('login', 'unknown')));
            $identity = $role . '|' . $login . '|' . $request->ip();

            return [
                Limit::perMinute(5)->by($identity),
                Limit::perMinute(20)->by('auth-login-ip:' . $request->ip()),
            ];
        });

        RateLimiter::for('auth-password-reset', function (Request $request): array {
            $role = strtolower(trim((string) $request->input('role', 'unknown')));
            $login = strtolower(trim((string) $request->input('login', 'unknown')));
            $identity = $role . '|' . $login . '|' . $request->ip();

            return [
                Limit::perMinute(4)->by($identity),
                Limit::perMinute(12)->by('auth-reset-ip:' . $request->ip()),
            ];
        });

        RateLimiter::for('auth-token-refresh', function (Request $request): array {
            $key = $request->user()?->id
                ? 'auth-refresh-user:' . $request->user()->id
                : 'auth-refresh-ip:' . $request->ip();

            return [
                Limit::perMinute(10)->by($key),
                Limit::perMinute(30)->by('auth-refresh-ip:' . $request->ip()),
            ];
        });
    }
}
