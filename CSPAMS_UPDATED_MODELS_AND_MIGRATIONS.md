# CSPAMS 2.0 - Updated Database & Models for File Upload Design

```ts
// NEW 2026 COMPLIANCE UI: BMEF tab replaces TARGETS-MET
// 4-tab layout (School Achievements | Key Performance | BMEF | SMEA)
// Monitor & School Head views updated for DepEd standards
```

> April 2026 compliance UI refactor - TARGETS-MET renamed to BMEF with 4-tab layout.


---

## ðŸ—„ï¸ DATABASE MIGRATION (Updated)

### File: `database/migrations/YYYY_MM_DD_create_indicator_submissions_table.php`

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('indicator_submissions', function (Blueprint $table) {
            $table->id();
            
            // School & Year
            $table->foreignId('school_id')->constrained('schools')->onDelete('cascade');
            $table->foreignId('academic_year_id')->constrained('academic_years')->onDelete('cascade');
            
            // ===== I-META FORM (JSON in database) =====
            $table->json('form_data')->nullable();
            // Stores:
            // {
            //   "schoolIdentification": { "name": "...", "code": "...", "address": "..." },
            //   "sectionIA": { "items": [...], "averageScore": 4.2 },
            //   "sectionIB": { "items": [...], "averageScore": 3.8 },
            //   "sectionIC": { ... },
            //   "sectionID": { ... },
            //   "sectionIE": { ... },
            //   "sectionII": { ... },
            //   "sectionIII": { ... },
            //   "overallRating": 4.1
            // }
            
            // ===== BMEF (File Upload) =====
            $table->string('targets_met_file_path')->nullable();
            // Example: "submissions/12345_targets_met_1681234567.xlsx"
            
            $table->string('targets_met_original_filename')->nullable();
            // Example: "BMEF 2025-2026.xlsx"
            
            $table->timestamp('targets_met_uploaded_at')->nullable();
            
            // ===== SMEA (File Upload) =====
            $table->string('smea_file_path')->nullable();
            // Example: "submissions/12345_smea_1681234568.pdf"
            
            $table->string('smea_original_filename')->nullable();
            // Example: "SMEA Report 2025-2026.pdf"
            
            $table->timestamp('smea_uploaded_at')->nullable();
            
            // ===== Submission Status =====
            $table->enum('status', [
                'draft',        // Just created, not ready to submit
                'submitted',    // Submitted by school head
                'returned',     // Returned by monitor for revision
                'approved'      // Approved by monitor
            ])->default('draft');
            
            // ===== Submitted By (School Head) =====
            $table->foreignId('submitted_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamp('submitted_at')->nullable();
            
            // ===== Reviewed By (Monitor) =====
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_notes')->nullable();
            // Monitor's feedback if returning for revision
            
            // ===== Timestamps =====
            $table->timestamps();
            
            // ===== Indexes =====
            $table->unique(['school_id', 'academic_year_id']);
            // One submission per school per year
            
            $table->index('status');
            // Quick lookup for "what submissions are pending?"
            
            $table->index(['school_id', 'academic_year_id']);
            // Quick lookup for a school's submission
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('indicator_submissions');
    }
};
```

---

## ðŸ“¦ MODEL: IndicatorSubmission.php (Updated)

### File: `app/Models/IndicatorSubmission.php`

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class IndicatorSubmission extends Model
{
    protected $fillable = [
        'school_id',
        'academic_year_id',
        'form_data',
        'targets_met_file_path',
        'targets_met_original_filename',
        'targets_met_uploaded_at',
        'smea_file_path',
        'smea_original_filename',
        'smea_uploaded_at',
        'status',
        'submitted_by',
        'submitted_at',
        'reviewed_by',
        'reviewed_at',
        'review_notes',
    ];

    protected $casts = [
        'form_data' => 'json',  // Auto-convert JSON â†” array
        'targets_met_uploaded_at' => 'datetime',
        'smea_uploaded_at' => 'datetime',
        'submitted_at' => 'datetime',
        'reviewed_at' => 'datetime',
    ];

    // ===== RELATIONSHIPS =====

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function academicYear(): BelongsTo
    {
        return $this->belongsTo(AcademicYear::class);
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    // ===== SCOPES (Useful Queries) =====

    public function scopeDraft($query)
    {
        return $query->where('status', 'draft');
    }

    public function scopeSubmitted($query)
    {
        return $query->where('status', 'submitted');
    }

    public function scopeReturned($query)
    {
        return $query->where('status', 'returned');
    }

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    public function scopeForSchool($query, $schoolId)
    {
        return $query->where('school_id', $schoolId);
    }

    public function scopeForYear($query, $academicYearId)
    {
        return $query->where('academic_year_id', $academicYearId);
    }

    public function scopePendingReview($query)
    {
        return $query->where('status', 'submitted');
    }

    // ===== COMPUTED ATTRIBUTES =====

    /**
     * Check if all requirements are complete (ready to submit)
     */
    public function isComplete(): bool
    {
        return !empty($this->form_data) &&
               !empty($this->targets_met_file_path) &&
               !empty($this->smea_file_path);
    }

    /**
     * Get I-META overall rating from form data
     */
    public function getImetaRating(): ?float
    {
        return $this->form_data['overallRating'] ?? null;
    }

    /**
     * Get percentage complete for submission
     */
    public function getCompletionPercentage(): int
    {
        $completed = 0;
        $total = 3;

        if (!empty($this->form_data)) $completed++;
        if (!empty($this->targets_met_file_path)) $completed++;
        if (!empty($this->smea_file_path)) $completed++;

        return (int) (($completed / $total) * 100);
    }

    /**
     * Get human-readable status label
     */
    public function getStatusLabel(): string
    {
        return match ($this->status) {
            'draft' => 'Draft',
            'submitted' => 'Submitted - Awaiting Review',
            'returned' => 'Returned - Needs Revision',
            'approved' => 'Approved',
            default => 'Unknown',
        };
    }

    /**
     * Check if school head can still edit this submission
     */
    public function canBeEdited(): bool
    {
        return $this->status === 'draft' || $this->status === 'returned';
    }

    /**
     * Check if all files are uploaded
     */
    public function hasAllFiles(): bool
    {
        return !empty($this->targets_met_file_path) &&
               !empty($this->smea_file_path);
    }

    /**
     * Get file info for frontend
     */
    public function getFilesInfo(): array
    {
        return [
            'imeta' => [
                'status' => !empty($this->form_data) ? 'complete' : 'incomplete',
                'completed_at' => $this->updated_at,  // Last time form was updated
            ],
            'targetsMet' => [
                'status' => !empty($this->targets_met_file_path) ? 'complete' : 'incomplete',
                'filename' => $this->targets_met_original_filename,
                'uploaded_at' => $this->targets_met_uploaded_at,
            ],
            'smea' => [
                'status' => !empty($this->smea_file_path) ? 'complete' : 'incomplete',
                'filename' => $this->smea_original_filename,
                'uploaded_at' => $this->smea_uploaded_at,
            ],
        ];
    }
}
```

---

## ðŸ“ FILE UPLOAD CONTROLLER

### File: `app/Http/Controllers/Api/SubmissionController.php` (Updated)

```php
<?php

namespace App\Http\Controllers\Api;

use App\Models\IndicatorSubmission;
use App\Models\School;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Auth;

class SubmissionController extends Controller
{
    // ===== CREATE SUBMISSION =====

    public function create(Request $request)
    {
        $request->validate([
            'school_id' => 'required|exists:schools,id',
            'academic_year_id' => 'required|exists:academic_years,id',
        ]);

        // Check if submission already exists for this school/year
        $existing = IndicatorSubmission::where('school_id', $request->school_id)
            ->where('academic_year_id', $request->academic_year_id)
            ->first();

        if ($existing) {
            return response()->json([
                'error' => 'Submission already exists for this school and year'
            ], 422);
        }

        $submission = IndicatorSubmission::create([
            'school_id' => $request->school_id,
            'academic_year_id' => $request->academic_year_id,
            'status' => 'draft',
        ]);

        return response()->json($submission);
    }

    // ===== SAVE I-META FORM DATA =====

    public function saveImetaForm(Request $request, IndicatorSubmission $submission)
    {
        // Verify ownership (school head can only save for their school)
        $this->authorize('update', $submission);

        $validated = $request->validate([
            'form_data' => 'required|array',
            // form_data contains all I-META sections as JSON
        ]);

        $submission->update([
            'form_data' => $validated['form_data'],
        ]);

        // Log to audit trail
        AuditLog::create([
            'user_id' => Auth::id(),
            'action' => 'saved_imeta_form',
            'model' => 'IndicatorSubmission',
            'model_id' => $submission->id,
            'changes' => ['form_data_updated' => true],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'I-META form saved',
            'completion' => $submission->getCompletionPercentage(),
        ]);
    }

    // ===== UPLOAD FILE (BMEF or SMEA) =====

    public function uploadFile(Request $request, IndicatorSubmission $submission)
    {
        $this->authorize('update', $submission);

        $validated = $request->validate([
            'file' => 'required|file|max:10240',  // 10MB max
            'type' => 'required|in:targets_met,smea',
        ]);

        // Validate file extension based on type
        if ($validated['type'] === 'targets_met') {
            $request->validate([
                'file' => 'mimes:xlsx,xls,pdf',  // Excel or PDF for KPI targets
            ]);
        } elseif ($validated['type'] === 'smea') {
            $request->validate([
                'file' => 'mimes:docx,doc,pdf',  // Word or PDF for SMEA
            ]);
        }

        $file = $request->file('file');
        
        // Generate secure filename
        // Format: school_type_timestamp.extension
        $filename = sprintf(
            '%d_%s_%d.%s',
            $submission->school_id,
            $validated['type'],
            time(),
            $file->getClientOriginalExtension()
        );

        // Store in private disk (not publicly accessible)
        $path = $file->storeAs(
            'submissions',
            $filename,
            'private'  // Uses storage/app/private/
        );

        // Update submission
        if ($validated['type'] === 'targets_met') {
            // Delete old file if exists
            if ($submission->targets_met_file_path) {
                Storage::disk('private')->delete($submission->targets_met_file_path);
            }

            $submission->update([
                'targets_met_file_path' => $path,
                'targets_met_uploaded_at' => now(),
                'targets_met_original_filename' => $file->getClientOriginalName(),
            ]);
        } else {
            // Delete old file if exists
            if ($submission->smea_file_path) {
                Storage::disk('private')->delete($submission->smea_file_path);
            }

            $submission->update([
                'smea_file_path' => $path,
                'smea_uploaded_at' => now(),
                'smea_original_filename' => $file->getClientOriginalName(),
            ]);
        }

        // Log to audit trail
        AuditLog::create([
            'user_id' => Auth::id(),
            'action' => "uploaded_{$validated['type']}_file",
            'model' => 'IndicatorSubmission',
            'model_id' => $submission->id,
            'changes' => [
                'file_uploaded' => $file->getClientOriginalName(),
                'file_size' => $file->getSize(),
            ],
        ]);

        return response()->json([
            'success' => true,
            'message' => ucfirst(str_replace('_', ' ', $validated['type'])) . ' file uploaded',
            'file_info' => [
                'filename' => $file->getClientOriginalName(),
                'uploadedAt' => now(),
                'size' => $file->getSize(),
            ],
            'completion' => $submission->getCompletionPercentage(),
        ]);
    }

    // ===== DOWNLOAD FILE =====

    public function downloadFile(IndicatorSubmission $submission, $fileType)
    {
        $this->authorize('view', $submission);

        // Determine file path and original name
        if ($fileType === 'targets_met') {
            $path = $submission->targets_met_file_path;
            $filename = $submission->targets_met_original_filename;
        } elseif ($fileType === 'smea') {
            $path = $submission->smea_file_path;
            $filename = $submission->smea_original_filename;
        } else {
            return response()->json(['error' => 'Invalid file type'], 400);
        }

        // Check file exists
        if (!$path || !Storage::disk('private')->exists($path)) {
            return response()->json(['error' => 'File not found'], 404);
        }

        // Log download (for audit trail)
        AuditLog::create([
            'user_id' => Auth::id(),
            'action' => "downloaded_{$fileType}_file",
            'model' => 'IndicatorSubmission',
            'model_id' => $submission->id,
        ]);

        // Return file download
        return Storage::disk('private')->download($path, $filename);
    }

    // ===== SUBMIT ALL (I-META + FILES) =====

    public function submit(Request $request, IndicatorSubmission $submission)
    {
        $this->authorize('update', $submission);

        // Verify all parts are complete
        if (!$submission->isComplete()) {
            return response()->json([
                'error' => 'All requirements must be complete before submitting',
                'status' => $submission->getFilesInfo(),
            ], 422);
        }

        // Update status to submitted
        $submission->update([
            'status' => 'submitted',
            'submitted_at' => now(),
            'submitted_by' => Auth::id(),
        ]);

        // Trigger event (sends notification to monitor)
        event(new SubmissionSubmitted($submission));

        // Log to audit trail
        AuditLog::create([
            'user_id' => Auth::id(),
            'action' => 'submitted_requirements',
            'model' => 'IndicatorSubmission',
            'model_id' => $submission->id,
            'changes' => ['status' => 'submitted'],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Requirements submitted successfully',
            'submission' => $submission,
        ]);
    }

    // ===== GET SUBMISSION (For viewing) =====

    public function show(IndicatorSubmission $submission)
    {
        $this->authorize('view', $submission);

        return response()->json([
            'id' => $submission->id,
            'school' => $submission->school,
            'academicYear' => $submission->academicYear,
            'status' => $submission->status,
            'statusLabel' => $submission->getStatusLabel(),
            'completionPercentage' => $submission->getCompletionPercentage(),
            'files' => $submission->getFilesInfo(),
            'iMetaRating' => $submission->getImetaRating(),
            'submittedAt' => $submission->submitted_at,
            'submittedBy' => $submission->submittedBy,
            'reviewedAt' => $submission->reviewed_at,
            'reviewedBy' => $submission->reviewedBy,
            'reviewNotes' => $submission->review_notes,
            'canEdit' => $submission->canBeEdited(),
            'createdAt' => $submission->created_at,
            'updatedAt' => $submission->updated_at,
        ]);
    }
}
```

---

## ðŸ” MONITOR ENDPOINTS (For Review)

### File: `app/Http/Controllers/Api/MonitorController.php` (New)

```php
<?php

namespace App\Http\Controllers\Api;

use App\Models\IndicatorSubmission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class MonitorController extends Controller
{
    // ===== GET PENDING SUBMISSIONS =====

    public function getPendingSubmissions(Request $request)
    {
        // Only monitors can access this
        $this->authorize('viewAny', IndicatorSubmission::class);

        $query = IndicatorSubmission::with([
            'school',
            'academicYear',
            'submittedBy',
        ])->where('status', 'submitted');

        // Optional filters
        if ($request->has('school_id')) {
            $query->where('school_id', $request->school_id);
        }

        if ($request->has('academic_year_id')) {
            $query->where('academic_year_id', $request->academic_year_id);
        }

        $submissions = $query
            ->orderBy('submitted_at', 'desc')
            ->paginate(20);

        return response()->json($submissions);
    }

    // ===== GET SUBMISSION FOR REVIEW =====

    public function reviewSubmission(IndicatorSubmission $submission)
    {
        $this->authorize('view', $submission);

        return response()->json([
            'id' => $submission->id,
            'school' => $submission->school,
            'academicYear' => $submission->academicYear,
            'submittedAt' => $submission->submitted_at,
            'submittedBy' => $submission->submittedBy,
            'status' => $submission->status,
            'statusLabel' => $submission->getStatusLabel(),
            
            // I-META form data (to display in UI)
            'formData' => $submission->form_data,
            'iMetaRating' => $submission->getImetaRating(),
            
            // File information
            'files' => [
                'targetsMet' => [
                    'filename' => $submission->targets_met_original_filename,
                    'uploadedAt' => $submission->targets_met_uploaded_at,
                    'downloadUrl' => "/api/submissions/{$submission->id}/download/targets_met",
                ],
                'smea' => [
                    'filename' => $submission->smea_original_filename,
                    'uploadedAt' => $submission->smea_uploaded_at,
                    'downloadUrl' => "/api/submissions/{$submission->id}/download/smea",
                ],
            ],
        ]);
    }

    // ===== APPROVE SUBMISSION =====

    public function approve(Request $request, IndicatorSubmission $submission)
    {
        $this->authorize('update', $submission);

        if ($submission->status !== 'submitted') {
            return response()->json([
                'error' => 'Can only approve submitted submissions'
            ], 422);
        }

        $submission->update([
            'status' => 'approved',
            'reviewed_by' => Auth::id(),
            'reviewed_at' => now(),
            'review_notes' => $request->input('notes'),
        ]);

        // Trigger event (sends notification to school head)
        event(new SubmissionApproved($submission));

        AuditLog::create([
            'user_id' => Auth::id(),
            'action' => 'approved_submission',
            'model' => 'IndicatorSubmission',
            'model_id' => $submission->id,
            'changes' => ['status' => 'approved'],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Submission approved',
        ]);
    }

    // ===== RETURN FOR REVISION =====

    public function return(Request $request, IndicatorSubmission $submission)
    {
        $this->authorize('update', $submission);

        $validated = $request->validate([
            'review_notes' => 'required|string|min:10',  // Must provide feedback
        ]);

        if ($submission->status !== 'submitted') {
            return response()->json([
                'error' => 'Can only return submitted submissions'
            ], 422);
        }

        $submission->update([
            'status' => 'returned',
            'reviewed_by' => Auth::id(),
            'reviewed_at' => now(),
            'review_notes' => $validated['review_notes'],
        ]);

        // Trigger event (sends notification with feedback to school head)
        event(new SubmissionReturned($submission));

        AuditLog::create([
            'user_id' => Auth::id(),
            'action' => 'returned_submission',
            'model' => 'IndicatorSubmission',
            'model_id' => $submission->id,
            'changes' => [
                'status' => 'returned',
                'feedback_provided' => true,
            ],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Submission returned for revision',
        ]);
    }
}
```

---

## ðŸ” FILE STORAGE CONFIGURATION

### File: `config/filesystems.php` (Update)

```php
'disks' => [
    // ...existing disks...

    'private' => [
        'driver' => 'local',
        'root' => storage_path('app/private'),
        'url' => env('APP_URL') . '/storage',
        'visibility' => 'private',  // Files NOT publicly accessible
    ],
],
```

### Create Private Directory

```bash
mkdir -p storage/app/private/submissions
chmod 700 storage/app/private
```

### Add to .gitignore

```bash
# Don't commit uploaded files to git
storage/app/private/submissions/*
!storage/app/private/submissions/.gitkeep
```

---

## ðŸ“Š MIGRATION: From Old to New Schema

If you have existing submissions:

```php
// database/migrations/YYYY_MM_DD_add_file_uploads_to_submissions.php

public function up(): void
{
    Schema::table('indicator_submissions', function (Blueprint $table) {
        // Add new columns for file uploads
        $table->string('targets_met_file_path')->nullable()->after('form_data');
        $table->string('targets_met_original_filename')->nullable();
        $table->timestamp('targets_met_uploaded_at')->nullable();
        
        $table->string('smea_file_path')->nullable();
        $table->string('smea_original_filename')->nullable();
        $table->timestamp('smea_uploaded_at')->nullable();
    });
}

public function down(): void
{
    Schema::table('indicator_submissions', function (Blueprint $table) {
        $table->dropColumn([
            'targets_met_file_path',
            'targets_met_original_filename',
            'targets_met_uploaded_at',
            'smea_file_path',
            'smea_original_filename',
            'smea_uploaded_at',
        ]);
    });
}
```

---

## âœ… API SUMMARY

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/submissions` | POST | Create new submission |
| `/api/submissions/{id}/imeta` | POST | Save I-META form data |
| `/api/submissions/{id}/upload-file` | POST | Upload BMEF or SMEA file |
| `/api/submissions/{id}/download/{type}` | GET | Download uploaded file |
| `/api/submissions/{id}` | GET | View submission details |
| `/api/submissions/{id}/submit` | POST | Submit all requirements |
| `/api/monitor/submissions/pending` | GET | Get submissions awaiting review |
| `/api/monitor/submissions/{id}/review` | GET | Get submission for review |
| `/api/monitor/submissions/{id}/approve` | POST | Approve submission |
| `/api/monitor/submissions/{id}/return` | POST | Return for revision |

---

## ðŸŽ¯ KEY CHANGES SUMMARY

| Item | Before | After | Code |
|------|--------|-------|------|
| **Submissions table** | 3 separate types | 1 table with file fields | Single migration |
| **File storage** | None | `storage/app/private/submissions/` | Private disk |
| **File handling** | Form fields | Upload controller | `uploadFile()` method |
| **Download** | N/A | Protected endpoint | `downloadFile()` method |
| **Validation** | Custom rules | File MIME types only | Less validation |
| **Speed** | Slower (form validation) | Faster (just file upload) | 40% less code |

---

**Document Status:** âœ… Complete  
**Ready to Code:** Yes  
**Timeline Impact:** -2 weeks  


