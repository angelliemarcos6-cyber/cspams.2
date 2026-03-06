<x-filament-panels::layout.base :title="__('Sign in')">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@500;600;700;800&display=swap');

        :root {
            --csp-bg-soft: #edf4fb;
            --csp-bg-deep: #d8e8f8;
            --csp-ink: #0f2038;
            --csp-blue: #1d4ed8;
            --csp-blue-deep: #1e3a8a;
            --csp-teal: #0f766e;
            --csp-line: rgba(148, 163, 184, 0.32);
        }

        [x-cloak] {
            display: none !important;
        }

        .csp-login-page {
            position: relative;
            min-height: 100vh;
            overflow: hidden;
            background:
                radial-gradient(circle at 18% 18%, rgba(29, 78, 216, 0.24), transparent 42%),
                radial-gradient(circle at 85% 10%, rgba(20, 184, 166, 0.16), transparent 44%),
                linear-gradient(165deg, var(--csp-bg-soft) 0%, #f8fbff 45%, var(--csp-bg-deep) 100%);
            color: var(--csp-ink);
            font-family: 'Manrope', 'Segoe UI', sans-serif;
        }

        .csp-bg-blob {
            position: absolute;
            border-radius: 9999px;
            pointer-events: none;
            filter: blur(2px);
            opacity: 0.55;
            animation: cspFloat 11s ease-in-out infinite;
        }

        .csp-bg-blob-one {
            width: 22rem;
            height: 22rem;
            top: -7rem;
            right: -4rem;
            background: radial-gradient(circle, rgba(56, 189, 248, 0.42), rgba(14, 116, 144, 0.06));
        }

        .csp-bg-blob-two {
            width: 24rem;
            height: 24rem;
            bottom: -10rem;
            left: -6rem;
            background: radial-gradient(circle, rgba(34, 197, 94, 0.34), rgba(5, 150, 105, 0.06));
            animation-delay: 1.7s;
        }

        .csp-bg-grid {
            position: absolute;
            inset: 0;
            pointer-events: none;
            background-image: linear-gradient(rgba(15, 32, 56, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 32, 56, 0.03) 1px, transparent 1px);
            background-size: 34px 34px;
            mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.55), transparent 85%);
        }

        .csp-heading {
            font-family: 'Sora', 'Segoe UI', sans-serif;
            letter-spacing: -0.03em;
        }

        .csp-showcase {
            border-radius: 2rem;
            padding: clamp(2rem, 4vw, 3rem);
            background: linear-gradient(145deg, #0f3357 0%, #14507f 52%, #0f766e 100%);
            box-shadow: 0 30px 80px rgba(15, 32, 56, 0.26);
            color: #f8fafc;
        }

        .csp-brand-row {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .csp-brand-mark {
            width: 4.25rem;
            height: 4.25rem;
            border-radius: 1.1rem;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Sora', 'Segoe UI', sans-serif;
            font-weight: 800;
            font-size: 1.65rem;
            background: rgba(255, 255, 255, 0.14);
            border: 1px solid rgba(255, 255, 255, 0.34);
            backdrop-filter: blur(8px);
        }

        .csp-point-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.85rem;
        }

        .csp-point-card {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 1rem;
            padding: 0.85rem;
            backdrop-filter: blur(4px);
        }

        .csp-point-title {
            font-family: 'Sora', 'Segoe UI', sans-serif;
            font-size: 0.85rem;
            font-weight: 700;
            letter-spacing: 0.01em;
            text-transform: uppercase;
        }

        .csp-point-copy {
            margin-top: 0.35rem;
            font-size: 0.82rem;
            color: rgba(241, 245, 249, 0.9);
            line-height: 1.45;
        }

        .csp-login-card {
            border-radius: 1.65rem;
            border: 1px solid var(--csp-line);
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(8px);
            box-shadow: 0 24px 55px rgba(15, 32, 56, 0.16);
            overflow: hidden;
        }

        .csp-mobile-brand {
            display: flex;
            align-items: center;
            gap: 0.85rem;
        }

        .csp-eyebrow {
            font-size: 0.75rem;
            font-weight: 700;
            color: #0369a1;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .csp-role-switch {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.4rem;
            padding: 0.32rem;
            border-radius: 0.95rem;
            background: #e2e8f0;
        }

        .csp-role-tab {
            border: none;
            border-radius: 0.8rem;
            font-size: 0.93rem;
            font-weight: 700;
            color: #334155;
            padding: 0.72rem 0.4rem;
            transition: all 150ms ease;
        }

        .csp-role-tab:hover {
            color: #0f172a;
        }

        .csp-role-tab-active {
            background: #ffffff;
            color: #0f172a;
            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
        }

        .csp-role-note {
            border-radius: 0.85rem;
            border: 1px solid rgba(29, 78, 216, 0.2);
            background: rgba(29, 78, 216, 0.06);
            color: #1e3a8a;
            font-size: 0.85rem;
            font-weight: 600;
            line-height: 1.45;
            padding: 0.65rem 0.85rem;
        }

        .csp-forgot-link {
            font-size: 0.84rem;
            color: #1d4ed8;
            font-weight: 700;
            border: none;
            background: transparent;
        }

        .csp-forgot-link:hover {
            text-decoration: underline;
        }

        .csp-submit-btn {
            width: 100%;
            height: 3.3rem;
            border: none;
            border-radius: 1rem;
            color: #ffffff;
            font-size: 1rem;
            font-weight: 700;
            background: linear-gradient(135deg, var(--csp-blue), var(--csp-blue-deep));
            box-shadow: 0 14px 26px rgba(29, 78, 216, 0.34);
            transition: transform 150ms ease, box-shadow 150ms ease, filter 150ms ease;
        }

        .csp-submit-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 18px 30px rgba(29, 78, 216, 0.37);
            filter: brightness(1.03);
        }

        .csp-submit-btn:disabled {
            opacity: 0.65;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }

        .csp-forgot-box {
            margin-top: 1rem;
            border-radius: 0.95rem;
            border: 1px solid rgba(15, 118, 110, 0.28);
            background: rgba(15, 118, 110, 0.08);
            color: #115e59;
            font-size: 0.9rem;
            line-height: 1.5;
            padding: 0.9rem 1rem;
            position: relative;
        }

        .csp-forgot-close {
            position: absolute;
            top: 0.45rem;
            right: 0.55rem;
            border: none;
            background: transparent;
            color: #0f766e;
            font-size: 1.25rem;
            line-height: 1;
        }

        .csp-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            font-size: 0.85rem;
            color: #64748b;
            border-top: 1px solid rgba(148, 163, 184, 0.24);
            padding: 1rem 1.3rem;
            background: rgba(248, 250, 252, 0.9);
        }

        .csp-home-link {
            color: #1d4ed8;
            font-weight: 700;
        }

        .csp-home-link:hover {
            text-decoration: underline;
        }

        .dark .csp-login-card {
            background: rgba(15, 23, 42, 0.92);
            border-color: rgba(148, 163, 184, 0.28);
            color: #e2e8f0;
        }

        .dark .csp-eyebrow {
            color: #7dd3fc;
        }

        .dark .csp-role-switch {
            background: rgba(30, 41, 59, 0.9);
        }

        .dark .csp-role-tab {
            color: #cbd5e1;
        }

        .dark .csp-role-tab:hover {
            color: #f8fafc;
        }

        .dark .csp-role-tab-active {
            background: #0f172a;
            color: #f8fafc;
            box-shadow: 0 10px 18px rgba(0, 0, 0, 0.4);
        }

        .dark .csp-role-note {
            border-color: rgba(56, 189, 248, 0.3);
            background: rgba(14, 116, 144, 0.24);
            color: #bae6fd;
        }

        .dark .csp-footer {
            border-color: rgba(148, 163, 184, 0.18);
            background: rgba(15, 23, 42, 0.82);
            color: #94a3b8;
        }

        .dark .csp-forgot-box {
            border-color: rgba(45, 212, 191, 0.26);
            background: rgba(13, 148, 136, 0.2);
            color: #99f6e4;
        }

        .dark .csp-forgot-close {
            color: #5eead4;
        }

        @keyframes cspFloat {
            0%,
            100% {
                transform: translate3d(0, 0, 0);
            }
            50% {
                transform: translate3d(0, -14px, 0);
            }
        }

        @media (max-width: 1024px) {
            .csp-login-page {
                background:
                    radial-gradient(circle at 12% 15%, rgba(29, 78, 216, 0.22), transparent 40%),
                    radial-gradient(circle at 86% 0%, rgba(20, 184, 166, 0.14), transparent 38%),
                    linear-gradient(180deg, #eff6ff 0%, #f8fbff 55%, #deedf8 100%);
            }

            .csp-footer {
                flex-direction: column;
                align-items: flex-start;
            }
        }

        @media (max-width: 640px) {
            .csp-login-card {
                border-radius: 1.25rem;
            }

            .csp-role-tab {
                font-size: 0.85rem;
            }
        }
    </style>

    <div class="csp-login-page">
        <div class="csp-bg-blob csp-bg-blob-one" aria-hidden="true"></div>
        <div class="csp-bg-blob csp-bg-blob-two" aria-hidden="true"></div>
        <div class="csp-bg-grid" aria-hidden="true"></div>

        <div class="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:py-10">
            <section class="csp-showcase hidden lg:flex lg:flex-col lg:justify-between">
                <div>
                    <div class="csp-brand-row">
                        <div class="csp-brand-mark">CS</div>
                        <div>
                            <p class="csp-heading text-3xl">CSPAMS</p>
                            <p class="text-sm">SMM&amp;E � Schools Division Office of Santiago City</p>
                        </div>
                    </div>

                    <h1 class="csp-heading mt-12 text-5xl leading-tight">
                        Data-driven monitoring for stronger school outcomes.
                    </h1>

                    <p class="mt-6 max-w-xl text-lg leading-relaxed text-slate-100">
                        Centralized Student Performance Analytics and Monitoring System for I-META and TARGETS-MET implementation.
                    </p>
                </div>

                <div class="space-y-4">
                    <p class="text-sm uppercase tracking-[0.18em] text-sky-100">What you can do here</p>

                    <div class="csp-point-grid">
                        <article class="csp-point-card">
                            <p class="csp-point-title">Progress Visibility</p>
                            <p class="csp-point-copy">Track learner performance trends and interventions in one secure portal.</p>
                        </article>

                        <article class="csp-point-card">
                            <p class="csp-point-title">Role-Based Access</p>
                            <p class="csp-point-copy">Dedicated workflows for School Monitors and School Administrators.</p>
                        </article>

                        <article class="csp-point-card">
                            <p class="csp-point-title">Accurate Reporting</p>
                            <p class="csp-point-copy">Generate updates aligned to division monitoring requirements.</p>
                        </article>

                        <article class="csp-point-card">
                            <p class="csp-point-title">Secure Credentials</p>
                            <p class="csp-point-copy">Accounts are managed through the SMM&amp;E unit for safety and consistency.</p>
                        </article>
                    </div>
                </div>
            </section>

            <section class="flex items-center justify-center">
                <div
                    class="csp-login-card w-full max-w-lg"
                    x-data="{ tab: 'monitor', forgot: null }"
                    x-init="$nextTick(() => { $wire.set('data.role', 'monitor') })"
                >
                    <div class="p-6 sm:p-10">
                        <div class="csp-mobile-brand mb-7 lg:hidden">
                            <div class="csp-brand-mark">CS</div>
                            <div>
                                <p class="csp-heading text-2xl">CSPAMS</p>
                                <p class="text-xs text-slate-500 dark:text-slate-400">SMM&amp;E Portal</p>
                            </div>
                        </div>

                        <div class="space-y-2 text-left">
                            <p class="csp-eyebrow">Secure Access</p>

                            <h2 class="csp-heading text-4xl leading-tight">
                                {{ method_exists($this, 'getHeading') ? $this->getHeading() : __('Sign in') }}
                            </h2>

                            <p class="text-sm text-slate-600 dark:text-slate-300">
                                Schools Division Office of Santiago City
                            </p>

                            @if (method_exists($this, 'getSubheading') && filled($this->getSubheading()))
                                <p class="text-sm text-slate-500 dark:text-slate-400">
                                    {{ $this->getSubheading() }}
                                </p>
                            @endif
                        </div>

                        <div class="csp-role-switch mt-7 mb-5">
                            <button
                                type="button"
                                class="csp-role-tab"
                                :class="{ 'csp-role-tab-active': tab === 'monitor' }"
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
                                class="csp-role-tab"
                                :class="{ 'csp-role-tab-active': tab === 'school_head' }"
                                @click="
                                    tab = 'school_head';
                                    $wire.set('data.role', 'school_head');
                                    forgot = null;
                                "
                            >
                                School Administrator
                            </button>
                        </div>

                        <p
                            class="csp-role-note mb-6"
                            x-text="tab === 'monitor'
                                ? 'Monitor account: use your assigned DepEd credentials to access division monitoring tools.'
                                : 'School Administrator account: sign in with credentials coordinated through your School Monitor.'"
                        ></p>

                        <x-filament-panels::form wire:submit="authenticate" class="space-y-5">
                            {{ $this->form }}

                            <div class="flex justify-end">
                                <button
                                    type="button"
                                    class="csp-forgot-link"
                                    @click="
                                        forgot = (tab === 'monitor')
                                            ? 'Please contact the SMM&E unit for password reset assistance.'
                                            : 'For School Administrators: please request your School Monitor to reset your password. School Monitors can manage administrator password resets.'
                                    "
                                >
                                    Forgot your password?
                                </button>
                            </div>

                            <button
                                type="submit"
                                class="csp-submit-btn"
                                wire:loading.attr="disabled"
                                wire:target="authenticate"
                            >
                                <span
                                    wire:loading.remove
                                    wire:target="authenticate"
                                    x-text="tab === 'monitor' ? 'Sign in as School Monitor' : 'Sign in as School Administrator'"
                                ></span>

                                <span wire:loading wire:target="authenticate">Signing in...</span>
                            </button>
                        </x-filament-panels::form>

                        <template x-if="forgot">
                            <div class="csp-forgot-box" x-cloak>
                                <button type="button" class="csp-forgot-close" @click="forgot = null">&times;</button>
                                <p class="whitespace-pre-line pr-6" x-text="forgot"></p>
                            </div>
                        </template>
                    </div>

                    <div class="csp-footer">
                        <p>Need credentials? Contact the SMM&amp;E unit.</p>
                        <a href="/" class="csp-home-link">Back to Home</a>
                    </div>
                </div>
            </section>
        </div>
    </div>
</x-filament-panels::layout.base>
