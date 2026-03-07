<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\FormSubmissionController;
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

Route::middleware('auth:sanctum')->prefix('forms')->group(function (): void {
    Route::get('/sf1', [FormSubmissionController::class, 'indexSf1']);
    Route::post('/sf1/generate', [FormSubmissionController::class, 'generateSf1']);
    Route::post('/sf1/{submission}/submit', [FormSubmissionController::class, 'submitSf1']);
    Route::post('/sf1/{submission}/validate', [FormSubmissionController::class, 'validateSf1']);
    Route::get('/sf1/{submission}/history', [FormSubmissionController::class, 'sf1History']);

    Route::get('/sf5', [FormSubmissionController::class, 'indexSf5']);
    Route::post('/sf5/generate', [FormSubmissionController::class, 'generateSf5']);
    Route::post('/sf5/{submission}/submit', [FormSubmissionController::class, 'submitSf5']);
    Route::post('/sf5/{submission}/validate', [FormSubmissionController::class, 'validateSf5']);
    Route::get('/sf5/{submission}/history', [FormSubmissionController::class, 'sf5History']);
});
