<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\RequestAuthModeResolver;
use App\Support\Audit\AuthAuditLogger;
use App\Support\Auth\UserRoleResolver;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountIsActive
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $authMode = RequestAuthModeResolver::resolveAuthMode($request);
        $user = ApiUserResolver::fromRequest($request);

        if (! $user instanceof User) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
                'data' => null,
            ], Response::HTTP_UNAUTHORIZED);
        }

        if ($user->canAuthenticate()) {
            return $next($request);
        }

        $user->loadMissing('school');

        $role = UserRoleResolver::has($user, UserRoleResolver::MONITOR)
            ? UserRoleResolver::MONITOR
            : UserRoleResolver::SCHOOL_HEAD;
        $identifier = $role === UserRoleResolver::SCHOOL_HEAD
            ? (string) $user->school?->school_code
            : (string) $user->email;

        AuthAuditLogger::record(
            $request,
            'auth.account_access.blocked',
            'failure',
            $user,
            $role,
            $identifier,
            [
                'reason' => 'account_not_active',
                'account_status' => $user->accountStatus()->value,
                'auth_mode' => $authMode,
            ],
        );

        Log::warning('auth.blocked', [
            'user_id' => $user->id,
            'email' => $user->email,
            'reason' => 'account_not_active',
            'account_status' => $user->accountStatus()->value,
            'auth_mode' => $authMode,
            'route' => $request->route()?->uri() ?? $request->path(),
            'ip' => $request->ip(),
        ]);

        if ($authMode === RequestAuthModeResolver::TOKEN) {
            $user->currentAccessToken()?->delete();
        } else {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'success' => false,
            'message' => 'This account is not active.',
            'data' => null,
            'accountStatus' => $user->accountStatus()->value,
        ], Response::HTTP_FORBIDDEN);
    }
}
