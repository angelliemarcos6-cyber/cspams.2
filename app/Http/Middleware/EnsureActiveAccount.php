<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveAccount
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        if ($user->canAuthenticate()) {
            return $next($request);
        }

        try {
            $user->currentAccessToken()?->delete();
        } catch (\Throwable) {
            // Ignore token revocation failures.
        }

        try {
            $user->tokens()->delete();
        } catch (\Throwable) {
            // Ignore token revocation failures.
        }

        if (Schema::hasTable('sessions')) {
            try {
                DB::table('sessions')
                    ->where('user_id', $user->id)
                    ->delete();
            } catch (\Throwable) {
                // Ignore session cleanup failures.
            }
        }

        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'message' => 'This account is not active.',
            'accountStatus' => $user->accountStatus()->value,
        ], Response::HTTP_FORBIDDEN);
    }
}

