<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\LoginRequest;
use App\Http\Requests\Api\ResetRequiredPasswordRequest;
use App\Models\User;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $role = UserRoleResolver::normalizeLoginRole($request->string('role')->toString());
        $rawLogin = trim($request->string('login')->toString());
        $login = $role === UserRoleResolver::SCHOOL_HEAD
            ? (string) $this->normalizeSchoolCode($rawLogin)
            : $rawLogin;
        $password = $request->string('password')->toString();

        $user = $this->resolveUserForLogin($role, $login);

        if (! $user || ! Hash::check($password, $user->password) || ! UserRoleResolver::has($user, $role)) {
            $message = $role === UserRoleResolver::SCHOOL_HEAD
                ? 'Invalid school code or password.'
                : 'Invalid credentials for the selected role.';

            return response()->json(
                ['message' => $message],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if ($user->must_reset_password) {
            return response()->json(
                [
                    'message' => 'Password reset is required before dashboard access.',
                    'requiresPasswordReset' => true,
                ],
                Response::HTTP_FORBIDDEN,
            );
        }

        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }

        // Keep bearer token response for backward-compatible non-SPA clients.
        $tokenPayload = $this->issueDashboardToken($user, $role, true);

        return response()->json([
            'token' => $tokenPayload['token'],
            'tokenType' => 'Bearer',
            'expiresAt' => $tokenPayload['expiresAt'],
            'refreshAfter' => $tokenPayload['refreshAfter'],
            'user' => $this->serializeUser($user, $role),
        ]);
    }

    public function resetRequiredPassword(ResetRequiredPasswordRequest $request): JsonResponse
    {
        $role = UserRoleResolver::normalizeLoginRole($request->string('role')->toString());
        $rawLogin = trim($request->string('login')->toString());
        $login = $role === UserRoleResolver::SCHOOL_HEAD
            ? (string) $this->normalizeSchoolCode($rawLogin)
            : $rawLogin;
        $currentPassword = $request->string('current_password')->toString();
        $newPassword = $request->string('new_password')->toString();

        $user = $this->resolveUserForLogin($role, $login);

        if (! $user || ! Hash::check($currentPassword, $user->password) || ! UserRoleResolver::has($user, $role)) {
            $message = $role === UserRoleResolver::SCHOOL_HEAD
                ? 'Invalid school code or password.'
                : 'Invalid credentials for the selected role.';

            return response()->json(
                ['message' => $message],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (! $user->must_reset_password) {
            return response()->json(
                ['message' => 'Password reset is not required for this account.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        if (Hash::check($newPassword, $user->password)) {
            return response()->json(
                ['message' => 'New password must be different from your current password.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $user->forceFill([
            'password' => Hash::make($newPassword),
            'must_reset_password' => false,
            'password_changed_at' => now(),
        ])->save();

        // Password resets invalidate all existing API tokens immediately.
        $user->tokens()->delete();
        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }
        $tokenPayload = $this->issueDashboardToken($user, $role, false);

        return response()->json([
            'token' => $tokenPayload['token'],
            'tokenType' => 'Bearer',
            'expiresAt' => $tokenPayload['expiresAt'],
            'refreshAfter' => $tokenPayload['refreshAfter'],
            'user' => $this->serializeUser($user->fresh('school'), $role),
        ]);
    }

    public function refreshToken(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $currentToken = $user->currentAccessToken();
        if (! $currentToken) {
            return response()->json(
                ['message' => 'Token refresh is only available for bearer-token clients.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $role = $this->resolveRoleForUser($user);
        $tokenPayload = $this->issueDashboardToken($user, $role, false);

        // Rotate by revoking the old token immediately after issuing a replacement.
        $currentToken->delete();

        return response()->json([
            'token' => $tokenPayload['token'],
            'tokenType' => 'Bearer',
            'expiresAt' => $tokenPayload['expiresAt'],
            'refreshAfter' => $tokenPayload['refreshAfter'],
            'user' => $this->serializeUser($user->fresh('school'), $role),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $user->loadMissing('school');

        $role = UserRoleResolver::has($user, UserRoleResolver::MONITOR)
            ? UserRoleResolver::MONITOR
            : UserRoleResolver::SCHOOL_HEAD;

        return response()->json([
            'user' => $this->serializeUser($user, $role),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = ApiUserResolver::fromRequest($request);
        if ($user) {
            $user->currentAccessToken()?->delete();
        }

        Auth::guard('web')->logout();
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([], Response::HTTP_NO_CONTENT);
    }

    private function resolveUserForLogin(string $role, string $login): ?User
    {
        if ($role === UserRoleResolver::SCHOOL_HEAD) {
            $normalizedSchoolCode = $this->normalizeSchoolCode($login);
            if ($normalizedSchoolCode === null) {
                return null;
            }

            return User::query()
                ->with('school')
                ->whereHas('school', function ($builder) use ($normalizedSchoolCode): void {
                    $builder->where('school_code', $normalizedSchoolCode);
                })
                ->get()
                ->first(
                    fn (User $candidate): bool => UserRoleResolver::has($candidate, UserRoleResolver::SCHOOL_HEAD),
                );
        }

        $normalizedEmail = strtolower(trim($login));
        $query = User::query()
            ->with('school')
            ->whereRaw('LOWER(email) = ?', [$normalizedEmail]);

        /** @var \Illuminate\Support\Collection<int, User> $candidates */
        $candidates = $query->limit(5)->get();

        return $candidates->first(
            fn (User $candidate): bool => UserRoleResolver::has($candidate, $role),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeUser(User $user, string $role): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $role,
            'schoolId' => $user->school_id,
            'schoolCode' => $user->school?->school_code,
            'schoolName' => $user->school?->name,
            'mustResetPassword' => (bool) $user->must_reset_password,
        ];
    }

    private function normalizeSchoolCode(string $value): ?string
    {
        $normalized = trim($value);

        if (preg_match('/^\d{6}$/', $normalized) !== 1) {
            return null;
        }

        return $normalized;
    }

    /**
     * @return array{token: string, expiresAt: string|null, refreshAfter: string|null}
     */
    private function issueDashboardToken(User $user, string $role, bool $revokeExistingDashboardTokens): array
    {
        $this->purgeExpiredTokens($user);

        if ($revokeExistingDashboardTokens) {
            $user->tokens()
                ->where('name', 'like', $this->dashboardTokenNamePrefix() . '%')
                ->delete();
        }

        $expirationMinutes = $this->tokenExpirationMinutes();
        $expiresAt = $expirationMinutes !== null
            ? CarbonImmutable::now()->addMinutes($expirationMinutes)
            : null;

        $token = $expiresAt !== null
            ? $user->createToken($this->dashboardTokenName($role), ['*'], $expiresAt)->plainTextToken
            : $user->createToken($this->dashboardTokenName($role))->plainTextToken;

        return [
            'token' => $token,
            'expiresAt' => $expiresAt?->toISOString(),
            'refreshAfter' => $this->refreshAfterTimestamp($expiresAt, $expirationMinutes)?->toISOString(),
        ];
    }

    private function purgeExpiredTokens(User $user): void
    {
        $now = CarbonImmutable::now();
        $expirationMinutes = $this->tokenExpirationMinutes();

        $user->tokens()
            ->where(function ($query) use ($now, $expirationMinutes): void {
                $query->where(function ($subQuery) use ($now): void {
                    $subQuery->whereNotNull('expires_at')
                        ->where('expires_at', '<=', $now);
                });

                if ($expirationMinutes !== null) {
                    $query->orWhere('created_at', '<=', $now->subMinutes($expirationMinutes));
                }
            })
            ->delete();
    }

    private function tokenExpirationMinutes(): ?int
    {
        $value = config('sanctum.expiration');

        if (! is_numeric($value)) {
            return null;
        }

        $minutes = (int) $value;

        return $minutes > 0 ? $minutes : null;
    }

    private function refreshAfterTimestamp(?CarbonImmutable $expiresAt, ?int $expirationMinutes): ?CarbonImmutable
    {
        if ($expiresAt === null || $expirationMinutes === null) {
            return null;
        }

        $refreshBefore = max(1, (int) config('sanctum.refresh_before', 5));

        if ($refreshBefore >= $expirationMinutes) {
            return CarbonImmutable::now()->addMinute();
        }

        return $expiresAt->subMinutes($refreshBefore);
    }

    private function dashboardTokenNamePrefix(): string
    {
        return 'cspams-dashboard-';
    }

    private function dashboardTokenName(string $role): string
    {
        return $this->dashboardTokenNamePrefix() . $role . '-' . now()->timestamp;
    }

    private function resolveRoleForUser(User $user): string
    {
        $currentToken = $user->currentAccessToken();
        if ($currentToken instanceof PersonalAccessToken) {
            foreach ($currentToken->abilities as $ability) {
                if ($ability === 'role:' . UserRoleResolver::MONITOR) {
                    return UserRoleResolver::MONITOR;
                }

                if ($ability === 'role:' . UserRoleResolver::SCHOOL_HEAD) {
                    return UserRoleResolver::SCHOOL_HEAD;
                }
            }
        }

        return UserRoleResolver::has($user, UserRoleResolver::MONITOR)
            ? UserRoleResolver::MONITOR
            : UserRoleResolver::SCHOOL_HEAD;
    }
}
