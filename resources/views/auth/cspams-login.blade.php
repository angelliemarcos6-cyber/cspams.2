{{-- resources/views/auth/cspams-login.blade.php --}}

<x-filament-panels::page.simple>
<x-slot name="heading"></x-slot>
<x-slot name="subheading"></x-slot>

@php
$role = data_get($this->data, 'role', 'school_head');
@endphp

<div class="bg-[#F0F4F8] px-4 py-10">
<div class="mx-auto w-full max-w-md">
<div class="mb-8 flex flex-col items-center gap-3">
<img
src="{{ asset('depedlogo.png') }}"
alt="Department of Education logo"
class="h-24 w-auto object-contain"
/>

<div class="text-center">
<h1 class="text-4xl font-bold text-primary-700">SMM&amp;E</h1>
<p class="mt-1 text-sm font-medium text-primary-600">
School Management, Monitoring &amp; Evaluation
</p>
<p class="mt-2 text-xs text-slate-500">
Authorized access for School Heads and Monitors
</p>
</div>
</div>

<div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
<div class="mb-5 rounded-xl bg-slate-100 p-1">
<div class="grid grid-cols-2 gap-1">
<button
type="button"
wire:click="$set('data.role', 'school_head')"
class="rounded-lg px-3 py-2 text-sm font-medium transition-colors {{ $role === 'school_head' ? 'bg-white text-primary-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900' }}"
>
School Head
</button>

<button
type="button"
wire:click="$set('data.role', 'monitor')"
class="rounded-lg px-3 py-2 text-sm font-medium transition-colors {{ $role === 'monitor' ? 'bg-white text-primary-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900' }}"
>
Monitor
</button>
</div>
</div>

<div class="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
@if ($role === 'school_head')
<div class="font-semibold text-slate-900">School Head login</div>
<div class="mt-1">
Enter your <span class="font-medium">School ID</span> (School Code)
and <span class="font-medium">Passcode</span>.
</div>
@else
<div class="font-semibold text-slate-900">Monitor login</div>
<div class="mt-1">
Enter your <span class="font-medium">Monitor Email</span>
and <span class="font-medium">Passcode</span>.
</div>
@endif
</div>

<x-filament-panels::form wire:submit="authenticate" class="space-y-5">
{{ $this->form }}

<button
type="submit"
class="flex w-full items-center justify-center rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
wire:loading.attr="disabled"
wire:target="authenticate"
>
<span wire:loading.remove wire:target="authenticate">Sign In</span>
<span wire:loading wire:target="authenticate">Signing in…</span>
</button>
</x-filament-panels::form>
</div>
</div>
</div>
</x-filament-panels::page.simple>
