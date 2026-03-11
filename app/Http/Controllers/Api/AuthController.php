<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\LoginRequest;
use App\Http\Requests\Api\ResetRequiredPasswordRequest;
use App\Models\User;
use App\Support\Auth\ApiUserResolver;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
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

        // Keep token response for backward-compatible non-SPA clients.
        $token = $user->createToken('cspams-dashboard-' . now()->timestamp)->plainTextToken;

        return response()->json([
            'token' => $token,
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

        $user->tokens()->delete();
        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }
        $token = $user->createToken('cspams-dashboard-' . now()->timestamp)->plainTextToken;

        return response()->json([
            'token' => $token,
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

        $query = User::query()
            ->with('school')
            ->where(function ($builder) use ($login): void {
                $builder->where('email', $login)
                    ->orWhere('name', $login);
            });

        /** @var \Illuminate\Support\Collection<int, User> $candidates */
        $candidates = $query->limit(10)->get();

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
}
