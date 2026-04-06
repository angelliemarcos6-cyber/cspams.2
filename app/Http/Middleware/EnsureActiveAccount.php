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
    private ?bool $sessionsTableExists = null;

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
            $user->tokens()->delete();

            if ($this->hasSessionsTable()) {
                DB::table('sessions')
                    ->where('user_id', $user->id)
                    ->delete();
            }
        } catch (\Throwable) {
            // Ignore token and session cleanup failures.
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

    private function hasSessionsTable(): bool
    {
        if ($this->sessionsTableExists !== null) {
            return $this->sessionsTableExists;
        }

        return $this->sessionsTableExists = Schema::hasTable('sessions');
    }
}
