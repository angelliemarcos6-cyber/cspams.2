<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\IndicatorSubmissionController;
use App\Http\Controllers\Api\SchoolRecordController;
use App\Http\Controllers\Api\StudentRecordController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/reset-required-password', [AuthController::class, 'resetRequiredPassword']);

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
    Route::delete('/records/{school}', [SchoolRecordController::class, 'destroy']);

    Route::get('/students', [StudentRecordController::class, 'index']);
    Route::post('/students', [StudentRecordController::class, 'store']);
    Route::put('/students/{student}', [StudentRecordController::class, 'update']);
    Route::patch('/students/{student}', [StudentRecordController::class, 'update']);
    Route::delete('/students/{student}', [StudentRecordController::class, 'destroy']);
});

Route::middleware('auth:sanctum')->prefix('indicators')->group(function (): void {
    Route::get('/academic-years', [IndicatorSubmissionController::class, 'academicYears']);
    Route::get('/metrics', [IndicatorSubmissionController::class, 'metrics']);
    Route::get('/submissions', [IndicatorSubmissionController::class, 'index']);
    Route::post('/submissions', [IndicatorSubmissionController::class, 'store']);
    Route::get('/submissions/{submission}', [IndicatorSubmissionController::class, 'show']);
    Route::post('/submissions/{submission}/submit', [IndicatorSubmissionController::class, 'submit']);
    Route::post('/submissions/{submission}/review', [IndicatorSubmissionController::class, 'review']);
    Route::get('/submissions/{submission}/history', [IndicatorSubmissionController::class, 'history']);
});
