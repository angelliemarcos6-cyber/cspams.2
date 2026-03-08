<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CSPAMS</title>
    <style>
        :root {
            color-scheme: light;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif;
            background: #e8eef6;
            color: #0f172a;
        }

        .wrap {
            width: min(720px, 92vw);
            border: 1px solid rgba(148, 163, 184, 0.42);
            background: #ffffff;
            box-shadow: 0 20px 40px -30px rgba(2, 46, 80, 0.5);
            padding: clamp(1.4rem, 2.5vw, 2.2rem);
        }

        .brand {
            margin: 0;
            font-size: clamp(1.8rem, 4vw, 2.4rem);
            line-height: 1.1;
            color: #022e50;
        }

        .subtitle {
            margin: 0.55rem 0 0;
            color: #334155;
            font-size: 0.96rem;
        }

        .actions {
            margin-top: 1.5rem;
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 2.8rem;
            padding: 0 1rem;
            border: 1px solid #1d4ed8;
            font-weight: 700;
            text-decoration: none;
            font-size: 0.92rem;
            transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
        }

        .btn-primary {
            background: #1d4ed8;
            color: #ffffff;
        }

        .btn-primary:hover {
            background: #1e40af;
            border-color: #1e40af;
        }

        .btn-secondary {
            background: #ffffff;
            color: #1d4ed8;
        }

        .btn-secondary:hover {
            background: #eff6ff;
        }
    </style>
</head>
<body>
    @php
        $loginUrl = \Illuminate\Support\Facades\Route::has('filament.admin.auth.login')
            ? route('filament.admin.auth.login')
            : url('/admin/login');
    @endphp

    <main class="wrap">
        <h1 class="brand">CSPAMS</h1>
        <p class="subtitle">Centralized Student Performance Analytics and Monitoring System</p>

        <div class="actions">
            <a class="btn btn-primary" href="{{ $loginUrl }}">Open Login</a>
            <a class="btn btn-secondary" href="/admin">Admin Panel</a>
        </div>
    </main>
</body>
</html>
