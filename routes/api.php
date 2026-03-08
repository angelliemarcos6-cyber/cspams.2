<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\FormSubmissionController;
use App\Http\Controllers\Api\IndicatorSubmissionController;
use App\Http\Controllers\Api\SchoolRecordController;
use App\Http\Controllers\Api\StudentRecordController;
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
    Route::delete('/records/{school}', [SchoolRecordController::class, 'destroy']);

    Route::get('/students', [StudentRecordController::class, 'index']);
    Route::post('/students', [StudentRecordController::class, 'store']);
    Route::put('/students/{student}', [StudentRecordController::class, 'update']);
    Route::patch('/students/{student}', [StudentRecordController::class, 'update']);
    Route::delete('/students/{student}', [StudentRecordController::class, 'destroy']);
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
