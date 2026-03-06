<?php

namespace App\Filament\Pages\Auth;

use App\Models\School;
use App\Models\User;
use DanHarrin\LivewireRateLimiting\Exceptions\TooManyRequestsException;
use Filament\Facades\Filament;
use Filament\Forms\Components\Checkbox;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Form;
use Filament\Forms\Get;
use Filament\Http\Responses\Auth\Contracts\LoginResponse;
use Filament\Notifications\Notification;
use Filament\Pages\Auth\Login as BaseLogin;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class CspamsLogin extends BaseLogin
{
    protected static string $view = 'auth.cspams-login';

    protected static bool $shouldRegisterNavigation = false;

    public ?array $data = [];

    public function mount(): void
    {
        parent::mount();

        $this->form->fill([
            'role' => 'school_head',
            'login' => '',
            'password' => '',
            'remember' => false,
        ]);
    }

    public function form(Form $form): Form
    {
        return $form
        ->schema([
            Hidden::make('role')
            ->default('school_head')
            ->dehydrated(),

                 TextInput::make('login')
                 ->label(fn (Get $get): string => $get('role') === 'monitor' ? 'Monitor Email' : 'School ID')
                 ->placeholder(fn (Get $get): string => $get('role') === 'monitor' ? 'monitor@example.com' : 'Enter school code')
                 ->required()
                 ->autofocus()
                 ->maxLength(255)
                 ->autocomplete('username'),

                 TextInput::make('password')
                 ->label('Passcode')
                 ->placeholder('Enter your password')
                 ->password()
                 ->revealable()
                 ->required()
                 ->autocomplete('current-password'),

                 Checkbox::make('remember')
                 ->label('Remember me'),
        ])
        ->statePath('data');
    }

    public function authenticate(): ?LoginResponse
    {
        try {
            $this->rateLimit(5);
        } catch (TooManyRequestsException $exception) {
            Notification::make()
            ->title(__('filament-panels::pages/auth/login.messages.throttled.title'))
            ->body(__('filament-panels::pages/auth/login.messages.throttled.body', [
                'seconds' => $exception->secondsUntilAvailable,
                'minutes' => ceil($exception->secondsUntilAvailable / 60),
            ]))
            ->danger()
            ->send();

            return null;
        }

        $data = $this->form->getState();

        $role = $data['role'] ?? 'school_head';
        $login = trim((string) ($data['login'] ?? ''));
        $password = (string) ($data['password'] ?? '');
        $remember = (bool) ($data['remember'] ?? false);

        if ($role === 'school_head') {
            $login = strtoupper($login);
        }

        $user = $this->resolveUser($role, $login);

        if (! $user || ! Hash::check($password, $user->password)) {
            $this->throwFailureValidationException();
        }

        if (
            method_exists($user, 'canAccessPanel') &&
            ! $user->canAccessPanel(Filament::getCurrentPanel())
        ) {
            $this->throwFailureValidationException();
        }

        Filament::auth()->login($user, $remember);
        session()->regenerate();

        return app(LoginResponse::class);
    }

    protected function resolveUser(string $role, string $login): ?User
    {
        if ($role === 'monitor') {
            return User::query()
            ->where('email', $login)
            ->role('monitor')
            ->first();
        }

        $school = School::query()
        ->whereRaw('UPPER(code) = ?', [$login])
        ->first();

        if (! $school) {
            return null;
        }

        return User::query()
        ->where('school_id', $school->id)
        ->role('school_head')
        ->first();
    }

    protected function throwFailureValidationException(): never
    {
        throw ValidationException::withMessages([
            'data.login' => __('filament-panels::pages/auth/login.messages.failed'),
        ]);
    }
}
