<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\IndicatorSubmissionController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\SchoolRecordController;
use App\Http\Controllers\Api\SchoolHeadAccountController;
use App\Http\Controllers\Api\SubmissionController;
use App\Http\Controllers\Api\StudentRecordController;
use App\Http\Controllers\Api\TeacherRecordController;
use App\Http\Middleware\AuthenticateApiRequest;
use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Middleware\EnsurePasswordResetSatisfied;
use App\Http\Middleware\InstrumentStudentCrudTiming;
use App\Http\Middleware\RejectExpiredApiToken;
use App\Http\Middleware\StandardizeAuthApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;

$protectedApiMiddleware = [
    RejectExpiredApiToken::class,
    AuthenticateApiRequest::class,
    EnsureAccountIsActive::class,
    EnsurePasswordResetSatisfied::class,
];

Route::middleware(StandardizeAuthApiResponse::class)->prefix('auth')->group(function () use ($protectedApiMiddleware): void {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:auth-login');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:auth-forgot-password');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:auth-reset-password');
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
    Route::post('/setup-link/recovery', [AuthController::class, 'requestSchoolHeadSetupLinkRecovery'])
        ->middleware('throttle:auth-school-head-setup-recovery');
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::middleware($protectedApiMiddleware)->group(function (): void {
        Route::get('/me', [AuthController::class, 'me']);
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
        Route::get('/mfa/reset/requests/{ticket}', [AuthController::class, 'monitorMfaResetRequestDetail']);
        Route::post('/mfa/reset/requests/{ticket}/approve', [AuthController::class, 'approveMonitorMfaReset'])
            ->middleware('throttle:auth-mfa-reset-approve');
        Route::post('/mfa/reset/requests/{ticket}/reveal', [AuthController::class, 'revealMonitorMfaResetApprovalToken'])
            ->middleware('throttle:auth-mfa-reset-approve');
        Route::post('/mfa/reset/requests/{ticket}/resend', [AuthController::class, 'resendMonitorMfaResetApprovalToken'])
            ->middleware('throttle:auth-mfa-reset-approve');
    });
});

Route::middleware($protectedApiMiddleware)->post('/broadcasting/auth', static function (Request $request) {
    return Broadcast::auth($request);
});

Route::middleware($protectedApiMiddleware)->prefix('dashboard')->group(function (): void {
    Route::get('/records', [SchoolRecordController::class, 'index']);
    Route::post('/records', [SchoolRecordController::class, 'store']);
    Route::post('/records/bulk-import', [SchoolRecordController::class, 'bulkImport']);
    Route::get('/records/archived', [SchoolRecordController::class, 'archived']);
    Route::get('/records/{school}/delete-preview', [SchoolRecordController::class, 'deletePreview']);
    Route::post('/records/{school}/send-reminder', [SchoolRecordController::class, 'sendReminder']);
    Route::put('/records/{school}/school-head-account/profile', [SchoolHeadAccountController::class, 'upsertProfile'])
        ->middleware('throttle:auth-account-management');
    Route::patch('/records/{school}/school-head-account', [SchoolHeadAccountController::class, 'update'])
        ->middleware('throttle:auth-account-management');
    Route::post('/records/{school}/school-head-account/activate', [SchoolHeadAccountController::class, 'activate'])
        ->middleware('throttle:auth-account-management');
    Route::post('/records/{school}/school-head-account/verification-code', [SchoolHeadAccountController::class, 'issueActionVerificationCode'])
        ->middleware('throttle:auth-account-management');
    Route::post('/records/{school}/school-head-account/setup-link', [SchoolHeadAccountController::class, 'issueSetupLink'])
        ->middleware('throttle:auth-account-management');
    Route::post('/records/{school}/school-head-account/setup-link/recover', [SchoolHeadAccountController::class, 'recoverSetupLink'])
        ->middleware('throttle:auth-account-management');
    Route::get('/records/{school}/school-head-account/setup-link', [SchoolHeadAccountController::class, 'pendingSetupLink'])
        ->middleware('throttle:auth-account-management');
    Route::post('/records/{school}/school-head-account/setup-link/reveal', [SchoolHeadAccountController::class, 'revealPendingSetupLink'])
        ->middleware('throttle:auth-account-management');
    Route::post('/records/{school}/school-head-account/setup-link/resend', [SchoolHeadAccountController::class, 'resendPendingSetupLink'])
        ->middleware('throttle:auth-account-management');
    Route::post('/records/{school}/school-head-account/password-reset-link', [SchoolHeadAccountController::class, 'issuePasswordResetLink'])
        ->middleware('throttle:auth-account-management');
    Route::delete('/records/{school}/school-head-account', [SchoolHeadAccountController::class, 'destroy'])
        ->middleware('throttle:auth-account-management');
    Route::post('/records/{school}/restore', [SchoolRecordController::class, 'restore']);
    Route::put('/records/{school}', [SchoolRecordController::class, 'update']);
    Route::patch('/records/{school}', [SchoolRecordController::class, 'update']);
    Route::delete('/records/{school}', [SchoolRecordController::class, 'destroy']);

    Route::get('/students', [StudentRecordController::class, 'index']);
    Route::post('/students', [StudentRecordController::class, 'store'])
        ->middleware(InstrumentStudentCrudTiming::class);
    Route::delete('/students', [StudentRecordController::class, 'batchDestroy']);
    Route::get('/students/{student}/history', [StudentRecordController::class, 'history']);
    Route::put('/students/{student}', [StudentRecordController::class, 'update']);
    Route::patch('/students/{student}', [StudentRecordController::class, 'update']);
    Route::delete('/students/{student}', [StudentRecordController::class, 'destroy'])
        ->middleware(InstrumentStudentCrudTiming::class);

    Route::get('/teachers', [TeacherRecordController::class, 'index']);
    Route::post('/teachers', [TeacherRecordController::class, 'store']);
    Route::put('/teachers/{teacher}', [TeacherRecordController::class, 'update']);
    Route::patch('/teachers/{teacher}', [TeacherRecordController::class, 'update']);
    Route::delete('/teachers/{teacher}', [TeacherRecordController::class, 'destroy']);
});

Route::middleware($protectedApiMiddleware)->prefix('indicators')->group(function (): void {
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

Route::middleware($protectedApiMiddleware)->prefix('submissions')->group(function (): void {
    Route::post('/create', [SubmissionController::class, 'create']);
    Route::post('/{submission}/imeta-form', [SubmissionController::class, 'saveImetaForm']);
    Route::post('/{submission}/upload-file', [SubmissionController::class, 'uploadFile']);
    Route::get('/{submission}/download/{type}', [SubmissionController::class, 'downloadFile']);
    Route::post('/{submission}/submit', [SubmissionController::class, 'submit']);
    Route::get('/{submission}', [SubmissionController::class, 'show']);
});

Route::middleware($protectedApiMiddleware)->prefix('notifications')->group(function (): void {
    Route::get('/', [NotificationController::class, 'index']);
    Route::post('/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::post('/{notification}/read', [NotificationController::class, 'markAsRead']);
});
