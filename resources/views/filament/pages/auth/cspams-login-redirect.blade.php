<x-filament-panels::page>
    <div class="space-y-3 text-sm">
        <p>Redirecting to the main sign-in page…</p>
        <p>
            If you are not redirected automatically,
            <a href="{{ rtrim((string) config('app.frontend_url', url('/')), '/') . '/#/' }}"
               class="text-primary-600 underline">
                click here
            </a>.
        </p>
    </div>
</x-filament-panels::page>
