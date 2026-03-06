<?php

use Illuminate\Support\Facades\Route;

/*
 | -----------------------------------------*---------------------------------
 | Web Routes
 |--------------------------------------------------------------------------
 | Keep the public root minimal for CSPAMS.
 | Filament panel is mounted under /admin.
 */

// Redirect the site root to Filament login (or /admin if you prefer)
Route::redirect('/', '/admin/login');

// Optional: if someone visits /admin directly, ensure they land on the login page
Route::redirect('/admin', '/admin/login');
