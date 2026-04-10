<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\Audit\AuthAuditLogger;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\RequestAuthModeResolver;
use App\Support\Auth\UserRoleResolver;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasswordResetSatisfied
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = ApiUserResolver::fromRequest($request);

        if (! $user instanceof User || ! $user->must_reset_password) {
            return $next($request);
        }

        $role = UserRoleResolver::has($user, UserRoleResolver::MONITOR)
            ? UserRoleResolver::MONITOR
            : UserRoleResolver::SCHOOL_HEAD;

        $user->loadMissing('school');

        $identifier = $role === UserRoleResolver::SCHOOL_HEAD
            ? (string) $user->school?->school_code
            : (string) $user->email;
        $authMode = RequestAuthModeResolver::resolveAuthMode($request);

        AuthAuditLogger::record(
            $request,
            'auth.password_reset.required',
            'failure',
            $user,
            $role,
            $identifier,
            [
                'auth_mode' => $authMode,
                'show_reset_ui' => (bool) config('auth_security.password_reset.show_in_app_reset_ui', true),
            ],
        );

        if ($authMode === RequestAuthModeResolver::TOKEN) {
            $user->currentAccessToken()?->delete();
        } else {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'message' => 'Password reset is required before dashboard access.',
            'requiresPasswordReset' => true,
            'showResetUi' => (bool) config('auth_security.password_reset.show_in_app_reset_ui', true),
        ], Response::HTTP_FORBIDDEN);
    }
}
