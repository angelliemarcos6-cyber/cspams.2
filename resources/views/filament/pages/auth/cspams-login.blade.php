<x-filament-panels::layout.base :title="__('Sign in')">
<div class="min-h-screen grid grid-cols-1 lg:grid-cols-2 font-sans overflow-hidden">
{{-- LEFT: BACKGROUND IMAGE --}}
<div
class="hidden lg:flex relative bg-cover bg-center bg-no-repeat"
style="background-image: url('https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=2070&q=80');"
>
<div class="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent"></div>

<div class="relative z-10 flex flex-col justify-center px-16 max-w-lg text-white">
<div class="mb-8">
<div class="h-24 w-24 rounded-3xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/30">
<span class="text-white text-7xl font-black tracking-[-4px]">CS</span>
</div>
</div>

<h1 class="text-7xl font-bold tracking-tighter leading-none mb-4">CSPAMS</h1>

<p class="text-3xl font-light leading-tight text-white/90">
Centralized Student Performance Analytics<br />and Monitoring System
</p>

<div class="mt-16 text-lg opacity-90">
Supporting <span class="font-semibold">I-META</span> &amp;
<span class="font-semibold">TARGETS-MET</span> monitoring
</div>
</div>
</div>

{{-- RIGHT: SIGN IN FORM --}}
<div class="flex items-center justify-center bg-gradient-to-br from-slate-50 to-white dark:from-zinc-950 dark:to-zinc-900 p-6 lg:p-12">
<div
class="w-full max-w-md"
x-data="{ tab: 'monitor', forgot: null }"
x-init="$nextTick(() => { $wire.set('data.role', 'monitor') })"
>
{{-- Mobile Logo --}}
<div class="flex justify-center mb-10 lg:hidden">
<div class="h-24 w-24 rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center shadow-2xl">
<span class="text-white text-7xl font-black tracking-[-4px]">CS</span>
</div>
</div>

<div class="bg-white dark:bg-zinc-900 shadow-2xl border-0 rounded-2xl overflow-hidden">
{{-- Header --}}
<div class="space-y-1 text-center pb-2 px-8 pt-8">
<div class="text-3xl font-bold tracking-tight">
{{ method_exists($this, 'getHeading') ? $this->getHeading() : __('Sign in') }}
</div>

<div class="text-lg text-slate-500 dark:text-zinc-400">
SMM&amp;E - Schools Division Office of Santiago City
</div>

@if (method_exists($this, 'getSubheading') && filled($this->getSubheading()))
<div class="text-sm text-slate-500 dark:text-zinc-400">
{{ $this->getSubheading() }}
</div>
@endif
</div>

<div class="px-8 pb-8 pt-6">
{{-- Tabs --}}
<div class="grid grid-cols-2 mb-8 bg-slate-100 dark:bg-zinc-800 rounded-2xl p-1">
<button
type="button"
class="text-base py-3 rounded-2xl transition"
:class="tab === 'monitor'
? 'bg-white dark:bg-zinc-900 shadow font-semibold'
: 'text-slate-600 dark:text-zinc-300'"
@click="
tab = 'monitor';
$wire.set('data.role', 'monitor');
forgot = null;
"
>
School Monitor
</button>

<button
type="button"
class="text-base py-3 rounded-2xl transition"
:class="tab === 'school_head'
? 'bg-white dark:bg-zinc-900 shadow font-semibold'
: 'text-slate-600 dark:text-zinc-300'"
@click="
tab = 'school_head';
$wire.set('data.role', 'school_head');
forgot = null;
"
>
School Administrator
</button>
</div>

{{-- Filament Login Form --}}
<x-filament-panels::form wire:submit="authenticate" class="space-y-6">
{{ $this->form }}

<div class="flex justify-end pt-1">
<button
type="button"
class="text-sm text-blue-600 hover:underline font-medium"
@click="
forgot = (tab === 'monitor')
    ? 'Please contact the SMM&E unit for password reset assistance.'
    : 'For School Administrators:\n\nPlease request your School Monitor to reset your password.\n\n(The School Monitor has the power to change/reset administrator passwords.)'
    "
    >
    Forgot your password?
    </button>
    </div>

    <button
    type="submit"
    class="w-full h-14 text-xl rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-500/40 hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
    wire:loading.attr="disabled"
    wire:target="authenticate"
    >
    <span
    wire:loading.remove
    wire:target="authenticate"
    x-text="tab === 'monitor'
    ? 'Sign in as School Monitor'
    : 'Sign in as School Administrator'"
    ></span>

    <span wire:loading wire:target="authenticate">Signing in...</span>
    </button>
    </x-filament-panels::form>
    </div>

    {{-- Footer --}}
    <div class="flex flex-col items-center gap-3 text-sm text-slate-500 pb-8 border-t border-slate-100 dark:border-zinc-800 pt-6 px-8">
    <p>Contact SMM&amp;E unit for credentials</p>
    <a href="/" class="text-blue-600 hover:underline font-medium">&larr; Back to Home</a>
    </div>
    </div>

    {{-- Forgot Password Message Box --}}
    <template x-if="forgot">
    <div class="mt-6 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-2xl p-5 text-sm relative">
    <button
    type="button"
    class="absolute top-4 right-4 text-blue-500 hover:text-blue-700"
    @click="forgot=null"
    >
    &times;
    </button>

    <p class="text-blue-700 dark:text-blue-300 whitespace-pre-line leading-relaxed" x-text="forgot"></p>
    </div>
    </template>
    </div>
    </div>
    </div>
    </x-filament-panels::layout.base>

