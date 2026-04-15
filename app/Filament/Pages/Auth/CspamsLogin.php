<?php

namespace App\Filament\Pages\Auth;

use App\Models\User;
use App\Support\Auth\UserRoleResolver;
use App\Support\Domain\AccountStatus;
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
        $roleField = Hidden::make('role')
            ->default(UserRoleResolver::MONITOR)
            ->dehydrated();

        $loginField = TextInput::make('login')
            ->label('Account ID')
            ->required()
            ->autocomplete('username')
            ->autofocus()
            ->placeholder('Monitor email or 6-digit school code')
            ->helperText('Division Monitor: email only. School Head: 6-digit school code only.')
            ->maxLength(255)
            ->extraInputAttributes([
                'x-on:blur' => 'applyLoginNormalization()',
                'x-on:keydown.enter' => 'applyLoginNormalization()',
            ])
            ->dehydrateStateUsing(function (?string $state): ?string {
                $normalized = trim((string) $state);

                return $normalized !== '' ? $normalized : null;
            });

        $passwordField = TextInput::make('password')
            ->label('Password')
            ->password()
            ->revealable()
            ->required()
            ->rule(Password::min(6))
            ->autocomplete('current-password')
            ->placeholder('Enter your password');

        $rememberField = Checkbox::make('remember')
            ->label('Remember me');

        return [
            $roleField,
            $loginField,
            $passwordField,
            $rememberField,
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

        if (! $user || ! Hash::check($password, $user->password)) {
            $this->throwFailedLoginException($rolePicked);
        }

        if (! $user->canAuthenticate()) {
            $this->throwInactiveAccountException($user);
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
            $normalizedSchoolCode = $this->normalizeSchoolCode($login);
            if ($normalizedSchoolCode === null) {
                return null;
            }

            $normalizedSchoolCodeKey = strtolower($normalizedSchoolCode);
            $roleAliases = UserRoleResolver::roleAliases(UserRoleResolver::SCHOOL_HEAD);

            return User::query()
                ->with('school')
                ->whereHas('school', function ($builder) use ($normalizedSchoolCodeKey): void {
                    $builder->where('school_code_normalized', $normalizedSchoolCodeKey);
                })
                ->whereHas('roles', function ($builder) use ($roleAliases): void {
                    $builder->whereIn('name', $roleAliases);
                })
                ->first();
        }

        $normalizedEmail = strtolower(trim($login));
        if (filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL) === false) {
            return null;
        }
        $roleAliases = UserRoleResolver::roleAliases(UserRoleResolver::MONITOR);

        return User::query()
            ->with('school')
            ->where('email_normalized', $normalizedEmail)
            ->whereHas('roles', function ($builder) use ($roleAliases): void {
                $builder->whereIn('name', $roleAliases);
            })
            ->first();
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

    private function throwInactiveAccountException(User $user): never
    {
        $message = match ($user->accountStatus()) {
            AccountStatus::SUSPENDED => 'Your account is suspended. Please contact your administrator.',
            AccountStatus::LOCKED => 'Your account is locked. Please contact your administrator.',
            AccountStatus::ARCHIVED => 'Your account is archived and can no longer sign in.',
            default => 'This account is not active.',
        };

        throw ValidationException::withMessages([
            'data.login' => $message,
        ]);
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
