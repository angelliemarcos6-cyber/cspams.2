<?php

namespace App\Filament\Pages\Auth;

use App\Support\Auth\UserRoleResolver;
use Filament\Facades\Filament;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Form;
use Filament\Http\Responses\Auth\Contracts\LoginResponse;
use Filament\Pages\Auth\Login as BaseLogin;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class CspamsLogin extends BaseLogin
{
    /**
     * Matches your actual folder:
     * resources/views/filament/pages/auth/cspams-login.blade.php
     */
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
     * Ensure Blade $wire.set('data.role', ...) works.
     */
    public function form(Form $form): Form
    {
        return $form
            ->schema($this->getFormSchema())
            ->statePath('data');
    }

    /**
     * Login form schema for CSPAMS.
     */
    protected function getFormSchema(): array
    {
        return [
            Hidden::make('role')
                ->default(UserRoleResolver::MONITOR)
                ->dehydrated(),

            TextInput::make('email')
                ->label('DepEd Email')
                ->email()
                ->required()
                ->rules(['email', 'ends_with:@deped.gov.ph'])
                ->autocomplete('username')
                ->autofocus()
                ->placeholder('name@deped.gov.ph')
                ->helperText('Use your official DepEd email address.')
                ->maxLength(255)
                ->dehydrateStateUsing(fn (?string $state) => $state ? mb_strtolower(trim($state)) : null),

            TextInput::make('password')
                ->label('Password')
                ->password()
                ->revealable()
                ->required()
                ->rule(Password::min(6))
                ->autocomplete('current-password')
                ->placeholder('Enter your password'),
        ];
    }

    /**
     * Redirect after login depending on role.
     */
    protected function getRedirectUrl(): string
    {
        $user = Filament::auth()->user();

        if (UserRoleResolver::isDivisionLevel($user)) {
            return Route::has('filament.admin.pages.monitor-dashboard')
                ? route('filament.admin.pages.monitor-dashboard')
                : url('/admin');
        }

        // school_head default landing
        return Route::has('filament.admin.resources.students.index')
            ? route('filament.admin.resources.students.index')
            : url('/admin');
    }

    /**
     * Enforce that chosen tab matches account role.
     * Tabs must set:
     * - data.role = 'monitor'
     * - data.role = 'school_head'
     */
    public function authenticate(): ?LoginResponse
    {
        $response = parent::authenticate();

        $rolePicked = $this->selectedRole();
        $user = Filament::auth()->user();

        $roleOk = match ($rolePicked) {
            UserRoleResolver::MONITOR => UserRoleResolver::isDivisionLevel($user),
            UserRoleResolver::SCHOOL_HEAD => UserRoleResolver::has($user, UserRoleResolver::SCHOOL_HEAD),
            default => false,
        };

        if (! $roleOk) {
            Filament::auth()->logout();

            request()->session()->invalidate();
            request()->session()->regenerateToken();

            throw ValidationException::withMessages([
                // Filament login form is under "data"
                'data.email' => 'This account does not match the selected role tab.',
            ]);
        }

        return $response;
    }

    private function selectedRole(): string
    {
        $state = $this->form->getState(); // because statePath('data')
        $role = $state['role'] ?? UserRoleResolver::MONITOR;

        return in_array($role, UserRoleResolver::loginRoles(), true)
            ? $role
            : UserRoleResolver::MONITOR;
    }
}
