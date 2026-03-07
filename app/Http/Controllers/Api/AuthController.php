<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\LoginRequest;
use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Response;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $role = UserRoleResolver::normalizeLoginRole($request->string('role')->toString());
        $login = trim($request->string('login')->toString());
        $password = $request->string('password')->toString();

        $user = $this->resolveUserForLogin($role, $login);

        if (! $user || ! Hash::check($password, $user->password) || ! UserRoleResolver::has($user, $role)) {
            return response()->json(
                ['message' => 'Invalid credentials for the selected role.'],
                Response::HTTP_UNPROCESSABLE_ENTITY,
            );
        }

        $token = $user->createToken('cspams-dashboard-' . now()->timestamp)->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->serializeUser($user, $role),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();

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
        /** @var User|null $user */
        $user = $request->user();
        if ($user) {
            $user->currentAccessToken()?->delete();
        }

        return response()->json([], Response::HTTP_NO_CONTENT);
    }

    private function resolveUserForLogin(string $role, string $login): ?User
    {
        $query = User::query()
            ->with('school')
            ->where(function ($builder) use ($login): void {
                $builder->where('email', $login)
                    ->orWhere('name', $login);
            });

        if ($role === UserRoleResolver::SCHOOL_HEAD) {
            $query->orWhereHas('school', function ($builder) use ($login): void {
                $builder->where('school_code', $login);
            });
        }

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
        ];
    }
}
