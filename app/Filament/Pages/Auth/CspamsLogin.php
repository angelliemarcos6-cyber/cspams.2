<?php

namespace App\Filament\Pages\Auth;

use Filament\Pages\SimplePage;

class CspamsLogin extends SimplePage
{
    protected static string $view = 'filament.pages.auth.cspams-login-redirect';

    protected static bool $shouldRegisterNavigation = false;

    public function mount(): void
    {
        $frontend = rtrim((string) config('app.frontend_url', url('/')), '/');
        $target = $frontend . '/#/';

        redirect()->away($target)->send();
        exit;
    }
}
