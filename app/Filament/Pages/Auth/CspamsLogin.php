<?php

namespace App\Filament\Pages\Auth;

use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use DanHarrin\LivewireRateLimiting\Exceptions\TooManyRequestsException;
use Filament\Facades\Filament;
use Filament\Forms\Components\Checkbox;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Form;
use Filament\Http\Responses\Auth\Contracts\LoginResponse;
use Filament\Models\Contracts\FilamentUser;
use Filament\Pages\Auth\Login as BaseLogin;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class CspamsLogin extends BaseLogin
{
    protected static string $view = 'filament.pages.auth.cspams-login';

    protected static bool $shouldRegisterNavigation = false;

    public function getHeading(): string
    {
        return 'CSPAMS';
    }

    public function getSubheading(): ?string
    {
        return 'Sign in to continue';
    }

    /**
     * @return array<string, array<string, string>>
     */
    public function getLoginTabs(): array
    {
        return UserRoleResolver::loginTabConfig();
    }

    public function getDefaultLoginRole(): string
    {
        return UserRoleResolver::MONITOR;
    }

    public function form(Form $form): Form
    {
        return $form
            ->schema($this->getFormSchema())
            ->statePath('data');
    }

    protected function getFormSchema(): array
    {
        return [
            Hidden::make('role')
<<<<<<< ours
                ->default(UserRoleResolver::MONITOR)
                ->dehydrated(),

            TextInput::make('login')
                ->label('Account ID')
                ->required()
                ->autocomplete('username')
                ->autofocus()
                ->placeholder('Monitor email/name or School Code')
                ->helperText('Division Monitor: email/name. School Head: school code.')
                ->maxLength(255)
                ->dehydrateStateUsing(function (?string $state): ?string {
                    $normalized = trim((string) $state);

                    return $normalized !== '' ? $normalized : null;
                }),
=======
            ->default('monitor')
            ->dehydrated(true)
            ->required(),

            TextInput::make('email')
            ->label('DepEd Email')
            ->email()
            ->required()
            ->rules(['email', 'ends_with:@deped.gov.ph'])
            ->autocomplete('username')
            ->maxLength(255)
            ->dehydrateStateUsing(fn (?string $state) => $state ? mb_strtolower(trim($state)) : null),
>>>>>>> theirs

            TextInput::make('password')
                ->label('Password')
                ->password()
                ->revealable()
                ->required()
                ->rule(Password::min(6))
                ->autocomplete('current-password')
                ->placeholder('Enter your password'),

            Checkbox::make('remember')
                ->label('Remember me'),
        ];
    }

    protected function getRedirectUrl(): string
    {
        $user = Filament::auth()->user();

        if (UserRoleResolver::isDivisionLevel($user)) {
            return Route::has('filament.admin.pages.monitor-dashboard')
                ? route('filament.admin.pages.monitor-dashboard')
                : url('/admin');
        }

        if (Route::has('filament.admin.resources.students.index')) {
            return route('filament.admin.resources.students.index');
        }

        if (Route::has('filament.admin.resources.sections.index')) {
            return route('filament.admin.resources.sections.index');
        }

        return url('/admin');
    }

    public function authenticate(): ?LoginResponse
    {
        try {
            $this->rateLimit(5);
        } catch (TooManyRequestsException $exception) {
            $this->getRateLimitedNotification($exception)?->send();

            return null;
        }

        $data = $this->form->getState();
        $rolePicked = $this->selectedRole();
        $login = trim((string) ($data['login'] ?? ''));
        $remember = (bool) ($data['remember'] ?? false);
        $password = (string) ($data['password'] ?? '');

        $user = $this->resolveUserForRole($rolePicked, $login);

        if (! $user || ! Hash::check($password, $user->password) || ! UserRoleResolver::has($user, $rolePicked)) {
            $this->throwFailedLoginException($rolePicked);
        }

        Filament::auth()->login($user, $remember);

        if (($user instanceof FilamentUser) && (! $user->canAccessPanel(Filament::getCurrentPanel()))) {
            Filament::auth()->logout();
            $this->throwFailedLoginException($rolePicked);
        }

        session()->regenerate();

        return app(LoginResponse::class);
    }

    private function selectedRole(): string
    {
        $state = $this->form->getState();

        return UserRoleResolver::normalizeLoginRole($state['role'] ?? null);
    }

    private function resolveUserForRole(string $role, string $login): ?User
    {
        if ($role === UserRoleResolver::SCHOOL_HEAD) {
            $normalizedSchoolCode = strtoupper($login);

            return User::query()
                ->with('school')
                ->whereHas('school', function ($builder) use ($normalizedSchoolCode): void {
                    $builder->whereRaw('UPPER(school_code) = ?', [$normalizedSchoolCode]);
                })
                ->get()
                ->first(
                    fn (User $candidate): bool => UserRoleResolver::has($candidate, UserRoleResolver::SCHOOL_HEAD),
                );
        }

        /** @var \Illuminate\Support\Collection<int, User> $candidates */
        $candidates = User::query()
            ->with('school')
            ->where(function ($builder) use ($login): void {
                $builder->where('email', $login)
                    ->orWhere('name', $login);
            })
            ->limit(10)
            ->get();

        return $candidates->first(
            fn (User $candidate): bool => UserRoleResolver::has($candidate, UserRoleResolver::MONITOR),
        );
    }

    private function throwFailedLoginException(string $role): never
    {
        $message = $role === UserRoleResolver::SCHOOL_HEAD
            ? 'Invalid school code or password.'
            : 'Invalid credentials for the selected role.';

        throw ValidationException::withMessages([
            'data.login' => $message,
        ]);
    }
}

