<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\IndicatorSubmissionController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\SchoolRecordController;
use App\Http\Controllers\Api\SchoolHeadAccountController;
use App\Http\Controllers\Api\StudentRecordController;
use App\Http\Controllers\Api\TeacherRecordController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function (): void {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:auth-login');
    Route::post('/reset-required-password', [AuthController::class, 'resetRequiredPassword'])
        ->middleware('throttle:auth-password-reset');
    Route::post('/setup-account', [AuthController::class, 'completeAccountSetup'])
        ->middleware('throttle:auth-account-setup');
    Route::post('/verify-mfa', [AuthController::class, 'verifyMonitorMfa'])
        ->middleware('throttle:auth-mfa-verify');
    Route::post('/mfa/reset/request', [AuthController::class, 'requestMonitorMfaReset'])
        ->middleware('throttle:auth-mfa-reset-request');
    Route::post('/mfa/reset/complete', [AuthController::class, 'completeMonitorMfaReset'])
        ->middleware('throttle:auth-mfa-reset-complete');

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::post('/refresh', [AuthController::class, 'refreshToken'])
            ->middleware('throttle:auth-token-refresh');
        Route::get('/sessions', [AuthController::class, 'activeSessions'])
            ->middleware('throttle:auth-session-management');
        Route::delete('/sessions/{session}', [AuthController::class, 'revokeSessionDevice'])
            ->middleware('throttle:auth-session-management');
        Route::post('/sessions/revoke-others', [AuthController::class, 'revokeOtherSessions'])
            ->middleware('throttle:auth-session-management');
        Route::post('/mfa/backup-codes/regenerate', [AuthController::class, 'regenerateMonitorMfaBackupCodes'])
            ->middleware('throttle:auth-mfa-backup-codes');
        Route::get('/mfa/reset/requests', [AuthController::class, 'monitorMfaResetRequests']);
        Route::post('/mfa/reset/requests/{ticket}/approve', [AuthController::class, 'approveMonitorMfaReset'])
            ->middleware('throttle:auth-mfa-reset-approve');
    });
});

Route::middleware('auth:sanctum')->post('/broadcasting/auth', static function (Request $request) {
    return Broadcast::auth($request);
});

Route::middleware('auth:sanctum')->prefix('dashboard')->group(function (): void {
    Route::get('/records', [SchoolRecordController::class, 'index']);
    Route::post('/records', [SchoolRecordController::class, 'store']);
    Route::post('/records/bulk-import', [SchoolRecordController::class, 'bulkImport']);
    Route::get('/records/archived', [SchoolRecordController::class, 'archived']);
    Route::get('/records/{school}/delete-preview', [SchoolRecordController::class, 'deletePreview']);
    Route::post('/records/{school}/send-reminder', [SchoolRecordController::class, 'sendReminder']);
    Route::patch('/records/{school}/school-head-account', [SchoolHeadAccountController::class, 'update'])
        ->middleware('throttle:auth-account-management');
    Route::post('/records/{school}/school-head-account/setup-link', [SchoolHeadAccountController::class, 'issueSetupLink'])
        ->middleware('throttle:auth-account-management');
    Route::post('/records/{school}/restore', [SchoolRecordController::class, 'restore']);
    Route::put('/records/{school}', [SchoolRecordController::class, 'update']);
    Route::patch('/records/{school}', [SchoolRecordController::class, 'update']);
    Route::delete('/records/{school}', [SchoolRecordController::class, 'destroy']);

    Route::get('/students', [StudentRecordController::class, 'index']);
    Route::post('/students', [StudentRecordController::class, 'store']);
    Route::put('/students/{student}', [StudentRecordController::class, 'update']);
    Route::patch('/students/{student}', [StudentRecordController::class, 'update']);
    Route::delete('/students/{student}', [StudentRecordController::class, 'destroy']);

    Route::get('/teachers', [TeacherRecordController::class, 'index']);
    Route::post('/teachers', [TeacherRecordController::class, 'store']);
    Route::put('/teachers/{teacher}', [TeacherRecordController::class, 'update']);
    Route::patch('/teachers/{teacher}', [TeacherRecordController::class, 'update']);
    Route::delete('/teachers/{teacher}', [TeacherRecordController::class, 'destroy']);
});

Route::middleware('auth:sanctum')->prefix('indicators')->group(function (): void {
    Route::get('/academic-years', [IndicatorSubmissionController::class, 'academicYears']);
    Route::get('/metrics', [IndicatorSubmissionController::class, 'metrics']);
    Route::get('/submissions', [IndicatorSubmissionController::class, 'index']);
    Route::post('/submissions', [IndicatorSubmissionController::class, 'store']);
    Route::get('/submissions/{submission}', [IndicatorSubmissionController::class, 'show']);
    Route::put('/submissions/{submission}', [IndicatorSubmissionController::class, 'update']);
    Route::patch('/submissions/{submission}', [IndicatorSubmissionController::class, 'update']);
    Route::post('/submissions/{submission}/submit', [IndicatorSubmissionController::class, 'submit']);
    Route::post('/submissions/{submission}/review', [IndicatorSubmissionController::class, 'review']);
    Route::get('/submissions/{submission}/history', [IndicatorSubmissionController::class, 'history']);
});

Route::middleware('auth:sanctum')->prefix('notifications')->group(function (): void {
    Route::get('/', [NotificationController::class, 'index']);
    Route::post('/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::post('/{notification}/read', [NotificationController::class, 'markAsRead']);
});
