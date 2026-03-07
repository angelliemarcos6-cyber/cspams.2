<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\SchoolRecordController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
    });
});

Route::middleware('auth:sanctum')->prefix('dashboard')->group(function (): void {
    Route::get('/records', [SchoolRecordController::class, 'index']);
    Route::post('/records', [SchoolRecordController::class, 'store']);
    Route::put('/records/{school}', [SchoolRecordController::class, 'update']);
    Route::patch('/records/{school}', [SchoolRecordController::class, 'update']);
});
