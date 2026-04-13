# CSPAMS 2.0 - Detailed Implementation Guide

```ts
// NEW 2026 COMPLIANCE UI: BMEF tab replaces TARGETS-MET
// 4-tab layout (School Achievements | Key Performance | BMEF | SMEA)
// Monitor & School Head views updated for DepEd standards
```

> April 2026 compliance UI refactor - TARGETS-MET renamed to BMEF with 4-tab layout.


---

## SECTION 1: NEW MODELS & MIGRATIONS

### Migration 1: Create welfare_concerns Table

```php
// database/migrations/2025_04_11_create_welfare_concerns_table.php

<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('welfare_concerns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->foreignId('flagged_by')->constrained('users');
            $table->timestamp('flagged_at')->useCurrent();
            
            // Student context (no LRN, no name stored)
            $table->string('grade_level'); // e.g., "Grade 5"
            $table->string('section'); // e.g., "Masigasig"
            
            // Concern categorization
            $table->enum('category', [
                'child_protection',
                'financial_difficulty',
                'dropout_risk',
                'irregular_attendance',
                'family_situation',
                'health_medical',
                'bullying',
                'other'
            ])->default('other');
            
            // Concern details
            $table->text('description');
            $table->json('metadata')->nullable(); // Store extra fields if needed
            
            // Status workflow
            $table->enum('status', ['open', 'in_progress', 'resolved'])
                  ->default('open');
            $table->timestamp('acknowledged_at')->nullable();
            $table->foreignId('acknowledged_by')->nullable()->constrained('users');
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users');
            
            // Audit
            $table->timestamps();
            $table->softDeletes();
            
            // Indices
            $table->index(['school_id', 'status']);
            $table->index('category');
            $table->index('flagged_at');
        });
    }

    public function down(): void {
        Schema::dropIfExists('welfare_concerns');
    }
};
```

---

### Migration 2: Create welfare_concern_attachments Table

```php
// database/migrations/2025_04_11_create_welfare_concern_attachments_table.php

<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('welfare_concern_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('concern_id')->constrained('welfare_concerns')->cascadeOnDelete();
            $table->string('file_path'); // Encrypted path
            $table->string('original_filename');
            $table->enum('file_type', ['pdf', 'jpg', 'png', 'doc', 'docx']);
            $table->foreignId('uploaded_by')->constrained('users');
            $table->timestamps();
        });
    }

    public function down(): void {
        Schema::dropIfExists('welfare_concern_attachments');
    }
};
```

---

### Migration 3: Create welfare_concern_threads Table

```php
// database/migrations/2025_04_11_create_welfare_concern_threads_table.php

<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('welfare_concern_threads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('concern_id')->constrained('welfare_concerns')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users');
            $table->text('message');
            $table->timestamps();
            
            $table->index(['concern_id', 'created_at']);
        });
    }

    public function down(): void {
        Schema::dropIfExists('welfare_concern_threads');
    }
};
```

---

### Migration 4: Create enrollment_records Table

```php
// database/migrations/2025_04_11_create_enrollment_records_table.php

<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('enrollment_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('school_id')->constrained()->cascadeOnDelete();
            $table->foreignId('academic_year_id')->constrained();
            
            // Numbers reported by school head
            $table->integer('total_enrolled');
            $table->integer('dropouts')->default(0);
            $table->integer('transferees_in')->default(0);
            $table->integer('transferees_out')->default(0);
            $table->integer('completers')->default(0);
            $table->integer('retained')->default(0);
            
            // Computed values (for reporting)
            $table->decimal('retention_rate', 5, 2)->nullable();
            $table->decimal('dropout_rate', 5, 2)->nullable();
            
            // Submission tracking
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('submitted_by')->nullable()->constrained('users');
            
            // Audit
            $table->timestamps();
            $table->unique(['school_id', 'academic_year_id']);
        });
    }

    public function down(): void {
        Schema::dropIfExists('enrollment_records');
    }
};
```

---

### Model 1: WelfareConcern

```php
// app/Models/WelfareConcern.php

<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class WelfareConcern extends Model {
    use SoftDeletes;

    protected $fillable = [
        'school_id',
        'flagged_by',
        'grade_level',
        'section',
        'category',
        'description',
        'metadata',
        'status',
        'acknowledged_at',
        'acknowledged_by',
        'resolved_at',
        'resolved_by',
    ];

    protected $casts = [
        'flagged_at' => 'datetime',
        'acknowledged_at' => 'datetime',
        'resolved_at' => 'datetime',
        'metadata' => 'json',
    ];

    // Relationships
    public function school(): BelongsTo {
        return $this->belongsTo(School::class);
    }

    public function flaggedBy(): BelongsTo {
        return $this->belongsTo(User::class, 'flagged_by');
    }

    public function acknowledgedBy(): BelongsTo {
        return $this->belongsTo(User::class, 'acknowledged_by');
    }

    public function resolvedBy(): BelongsTo {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function attachments(): HasMany {
        return $this->hasMany(WelfareConcernAttachment::class, 'concern_id');
    }

    public function threads(): HasMany {
        return $this->hasMany(WelfareConcernThread::class, 'concern_id')
                    ->orderBy('created_at', 'asc');
    }

    // Scopes
    public function scopeOpen($query) {
        return $query->where('status', 'open');
    }

    public function scopeInProgress($query) {
        return $query->where('status', 'in_progress');
    }

    public function scopeResolved($query) {
        return $query->where('status', 'resolved');
    }

    public function scopeBySchool($query, $schoolId) {
        return $query->where('school_id', $schoolId);
    }

    public function scopeByCategory($query, $category) {
        return $query->where('category', $category);
    }

    public function scopeRecentFirst($query) {
        return $query->orderBy('flagged_at', 'desc');
    }

    // Accessors
    public function getDaysOpenAttribute(): int {
        return $this->flagged_at->diffInDays(now());
    }

    public function isOverdue(): bool {
        // Alert if open for >30 days
        return $this->status === 'open' && $this->days_open > 30;
    }
}
```

---

### Model 2: WelfareConcernThread

```php
// app/Models/WelfareConcernThread.php

<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WelfareConcernThread extends Model {
    protected $fillable = ['concern_id', 'user_id', 'message'];
    public $timestamps = true;

    public function concern(): BelongsTo {
        return $this->belongsTo(WelfareConcern::class);
    }

    public function user(): BelongsTo {
        return $this->belongsTo(User::class);
    }
}
```

---

### Model 3: WelfareConcernAttachment

```php
// app/Models/WelfareConcernAttachment.php

<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class WelfareConcernAttachment extends Model {
    protected $fillable = [
        'concern_id',
        'file_path',
        'original_filename',
        'file_type',
        'uploaded_by',
    ];

    public $timestamps = true;

    public function concern(): BelongsTo {
        return $this->belongsTo(WelfareConcern::class);
    }

    public function uploadedBy(): BelongsTo {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    // Encrypt file path before storage
    public function setFilePathAttribute($value) {
        $this->attributes['file_path'] = Crypt::encrypt($value);
    }

    // Decrypt on retrieval
    public function getFilePathAttribute($value) {
        return Crypt::decrypt($value);
    }
}
```

---

### Model 4: EnrollmentRecord

```php
// app/Models/EnrollmentRecord.php

<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EnrollmentRecord extends Model {
    protected $fillable = [
        'school_id',
        'academic_year_id',
        'total_enrolled',
        'dropouts',
        'transferees_in',
        'transferees_out',
        'completers',
        'retained',
        'submitted_at',
        'submitted_by',
    ];

    protected $casts = [
        'submitted_at' => 'datetime',
    ];

    public function school(): BelongsTo {
        return $this->belongsTo(School::class);
    }

    public function academicYear(): BelongsTo {
        return $this->belongsTo(AcademicYear::class);
    }

    public function submittedBy(): BelongsTo {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    // Boot: auto-calculate rates
    protected static function boot() {
        parent::boot();

        static::saving(function ($model) {
            // Retention rate = (total - dropouts - transferees_out) / total
            if ($model->total_enrolled > 0) {
                $retained_count = $model->total_enrolled - $model->dropouts - $model->transferees_out;
                $model->retention_rate = ($retained_count / $model->total_enrolled) * 100;
            }

            // Dropout rate = dropouts / total
            if ($model->total_enrolled > 0) {
                $model->dropout_rate = ($model->dropouts / $model->total_enrolled) * 100;
            }
        });
    }

    // Scopes
    public function scopeBySchool($query, $schoolId) {
        return $query->where('school_id', $schoolId);
    }

    public function scopeByAcademicYear($query, $yearId) {
        return $query->where('academic_year_id', $yearId);
    }

    public function scopeSubmitted($query) {
        return $query->whereNotNull('submitted_at');
    }
}
```

---

## SECTION 2: API CONTROLLERS

### Controller 1: ConcernController

```php
// app/Http/Controllers/Api/ConcernController.php

<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreConcernRequest;
use App\Http\Requests\UpdateConcernStatusRequest;
use App\Models\WelfareConcern;
use App\Models\WelfareConcernThread;
use App\Notifications\ConcernFlaggedNotification;
use App\Notifications\ConcernAcknowledgedNotification;
use App\Notifications\ConcernResolvedNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Notification;

class ConcernController extends Controller {
    
    // School Head: Flag a new concern
    public function store(StoreConcernRequest $request): JsonResponse {
        $concern = WelfareConcern::create([
            'school_id' => auth()->user()->school_id,
            'flagged_by' => auth()->id(),
            'grade_level' => $request->grade_level,
            'section' => $request->section,
            'category' => $request->category,
            'description' => $request->description,
            'metadata' => $request->metadata,
        ]);

        // Notify division monitor
        $monitors = \App\Models\User::where('role', 'monitor')->get();
        Notification::send($monitors, new ConcernFlaggedNotification($concern));

        return response()->json([
            'message' => 'Concern flagged successfully',
            'concern' => $concern,
        ], 201);
    }

    // School Head: View their school's concerns
    public function index(): JsonResponse {
        $concerns = WelfareConcern::where('school_id', auth()->user()->school_id)
                                  ->with('threads')
                                  ->orderBy('flagged_at', 'desc')
                                  ->paginate(20);

        return response()->json($concerns);
    }

    // School Head: View single concern
    public function show($id): JsonResponse {
        $concern = WelfareConcern::with(['threads', 'attachments'])
                                 ->findOrFail($id);

        // Check access
        if ($concern->school_id !== auth()->user()->school_id) {
            abort(403, 'Unauthorized');
        }

        return response()->json($concern);
    }

    // Monitor: View all concerns (division-wide)
    public function allDivisionConcerns(): JsonResponse {
        $concerns = WelfareConcern::with(['school', 'threads'])
                                  ->orderBy('flagged_at', 'desc')
                                  ->paginate(50);

        return response()->json($concerns);
    }

    // Monitor: Acknowledge a concern
    public function acknowledge($id, UpdateConcernStatusRequest $request): JsonResponse {
        $concern = WelfareConcern::findOrFail($id);

        $concern->update([
            'status' => 'in_progress',
            'acknowledged_at' => now(),
            'acknowledged_by' => auth()->id(),
        ]);

        // Notify school head
        Notification::send(
            $concern->flaggedBy,
            new ConcernAcknowledgedNotification($concern)
        );

        return response()->json([
            'message' => 'Concern acknowledged',
            'concern' => $concern,
        ]);
    }

    // Monitor: Resolve a concern
    public function resolve($id, UpdateConcernStatusRequest $request): JsonResponse {
        $concern = WelfareConcern::findOrFail($id);

        $concern->update([
            'status' => 'resolved',
            'resolved_at' => now(),
            'resolved_by' => auth()->id(),
        ]);

        // Notify school head
        Notification::send(
            $concern->flaggedBy,
            new ConcernResolvedNotification($concern)
        );

        return response()->json([
            'message' => 'Concern resolved',
            'concern' => $concern,
        ]);
    }

    // Add thread message
    public function addThread($id): JsonResponse {
        $concern = WelfareConcern::findOrFail($id);

        $thread = WelfareConcernThread::create([
            'concern_id' => $id,
            'user_id' => auth()->id(),
            'message' => request('message'),
        ]);

        return response()->json([
            'message' => 'Message added',
            'thread' => $thread,
        ], 201);
    }
}
```

---

### Controller 2: EnrollmentController

```php
// app/Http/Controllers/Api/EnrollmentController.php

<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreEnrollmentRequest;
use App\Models\EnrollmentRecord;
use App\Models\AcademicYear;
use Illuminate\Http\JsonResponse;

class EnrollmentController extends Controller {
    
    // Get current enrollment record
    public function current(): JsonResponse {
        $currentYear = AcademicYear::where('is_current', true)->firstOrFail();

        $enrollment = EnrollmentRecord::where('school_id', auth()->user()->school_id)
                                      ->where('academic_year_id', $currentYear->id)
                                      ->first();

        return response()->json($enrollment ?: [
            'total_enrolled' => 0,
            'dropouts' => 0,
            'transferees_in' => 0,
            'transferees_out' => 0,
            'completers' => 0,
            'retained' => 0,
        ]);
    }

    // Store/Update enrollment
    public function store(StoreEnrollmentRequest $request): JsonResponse {
        $currentYear = AcademicYear::where('is_current', true)->firstOrFail();

        $enrollment = EnrollmentRecord::updateOrCreate(
            [
                'school_id' => auth()->user()->school_id,
                'academic_year_id' => $currentYear->id,
            ],
            [
                'total_enrolled' => $request->total_enrolled,
                'dropouts' => $request->dropouts,
                'transferees_in' => $request->transferees_in,
                'transferees_out' => $request->transferees_out,
                'completers' => $request->completers,
                'retained' => $request->retained,
                'submitted_at' => now(),
                'submitted_by' => auth()->id(),
            ]
        );

        return response()->json([
            'message' => 'Enrollment record saved',
            'enrollment' => $enrollment,
        ]);
    }

    // Monitor: Division-wide enrollment summary
    public function divisionSummary(): JsonResponse {
        $currentYear = AcademicYear::where('is_current', true)->firstOrFail();

        $summary = EnrollmentRecord::where('academic_year_id', $currentYear->id)
                                   ->whereNotNull('submitted_at')
                                   ->selectRaw('
                                       SUM(total_enrolled) as total_enrolled,
                                       SUM(dropouts) as total_dropouts,
                                       SUM(completers) as total_completers,
                                       COUNT(*) as schools_reported
                                   ')
                                   ->first();

        return response()->json($summary);
    }
}
```

---

## SECTION 3: FORM VALIDATION

### Request: StoreConcernRequest

```php
// app/Http/Requests/StoreConcernRequest.php

<?php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreConcernRequest extends FormRequest {
    public function authorize(): bool {
        return auth()->check() && auth()->user()->role === 'school_head';
    }

    public function rules(): array {
        return [
            'grade_level' => 'required|string|max:50',
            'section' => 'required|string|max:100',
            'category' => 'required|in:child_protection,financial_difficulty,dropout_risk,irregular_attendance,family_situation,health_medical,bullying,other',
            'description' => 'required|string|min:10|max:1000',
            'metadata' => 'nullable|json',
            'attachments' => 'nullable|array|max:3',
            'attachments.*' => 'file|max:10000|mimes:pdf,jpg,jpeg,png,doc,docx',
        ];
    }

    public function messages(): array {
        return [
            'category.in' => 'Invalid concern category',
            'description.min' => 'Description must be at least 10 characters',
            'attachments.max' => 'Maximum 3 attachments allowed',
        ];
    }
}
```

---

### Request: StoreEnrollmentRequest

```php
// app/Http/Requests/StoreEnrollmentRequest.php

<?php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreEnrollmentRequest extends FormRequest {
    public function authorize(): bool {
        return auth()->check() && auth()->user()->role === 'school_head';
    }

    public function rules(): array {
        return [
            'total_enrolled' => 'required|integer|min:0|max:10000',
            'dropouts' => 'required|integer|min:0',
            'transferees_in' => 'required|integer|min:0',
            'transferees_out' => 'required|integer|min:0',
            'completers' => 'required|integer|min:0',
            'retained' => 'required|integer|min:0',
        ];
    }

    protected function prepareForValidation() {
        // Ensure dropouts + transferees_out don't exceed total
        $total = $this->total_enrolled;
        $leaving = $this->dropouts + $this->transferees_out;

        if ($leaving > $total) {
            $this->merge([
                'dropouts' => 0,
                'transferees_out' => 0,
            ]);
        }
    }
}
```

---

## SECTION 4: FRONTEND COMPONENTS (React/TypeScript)

### Types Definition

```typescript
// frontend/src/types/concerns.ts

export interface WelfareConcern {
  id: number;
  school_id: number;
  flagged_by: number;
  flagged_at: string;
  grade_level: string;
  section: string;
  category: ConcernCategory;
  description: string;
  status: ConcernStatus;
  acknowledged_by?: number;
  acknowledged_at?: string;
  resolved_by?: number;
  resolved_at?: string;
  threads?: ConcernThread[];
  attachments?: ConcernAttachment[];
}

export type ConcernCategory =
  | 'child_protection'
  | 'financial_difficulty'
  | 'dropout_risk'
  | 'irregular_attendance'
  | 'family_situation'
  | 'health_medical'
  | 'bullying'
  | 'other';

export type ConcernStatus = 'open' | 'in_progress' | 'resolved';

export interface ConcernThread {
  id: number;
  concern_id: number;
  user_id: number;
  message: string;
  created_at: string;
}

export interface ConcernAttachment {
  id: number;
  concern_id: number;
  file_path: string;
  original_filename: string;
  file_type: string;
  uploaded_by: number;
  created_at: string;
}
```

---

### Component: FlagConcernModal

```typescript
// frontend/src/components/modals/FlagConcernModal.tsx

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { concernsService } from '@/services/concerns.service';

const CONCERN_CATEGORIES = [
  { value: 'child_protection', label: 'Child Protection / Abuse' },
  { value: 'financial_difficulty', label: 'Financial Difficulty' },
  { value: 'dropout_risk', label: 'Dropout Risk' },
  { value: 'irregular_attendance', label: 'Irregular Attendance' },
  { value: 'family_situation', label: 'Family Situation' },
  { value: 'health_medical', label: 'Health / Medical' },
  { value: 'bullying', label: 'Bullying' },
  { value: 'other', label: 'Other' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function FlagConcernModal({ open, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    grade_level: '',
    section: '',
    category: '',
    description: '',
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('grade_level', form.grade_level);
      formData.append('section', form.section);
      formData.append('category', form.category);
      formData.append('description', form.description);
      
      attachments.forEach((file) => {
        formData.append('attachments[]', file);
      });

      await concernsService.flagConcern(formData);

      toast({
        title: 'Success',
        description: 'Concern flagged successfully. Monitor has been notified.',
      });

      onSuccess();
      onClose();
      setForm({ grade_level: '', section: '', category: '', description: '' });
      setAttachments([]);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to flag concern. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Flag a Student Concern</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Grade Level</label>
              <Input
                value={form.grade_level}
                onChange={(e) => setForm({ ...form, grade_level: e.target.value })}
                placeholder="e.g., Grade 5"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Section</label>
              <Input
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
                placeholder="e.g., Masigasig"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CONCERN_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe the concern (no student names or personal identifiers)"
              rows={5}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Do NOT include student names, LRN, or other personal identifiers
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Attachments (Optional)</label>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(e) => setAttachments(Array.from(e.target.files || []))}
              className="block w-full text-sm border rounded px-3 py-2"
            />
            <p className="text-xs text-gray-500 mt-1">
              Max 3 files (PDF, JPG, PNG, DOC, DOCX)
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Flagging...' : 'Flag Concern'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

### Component: ConcernsList

```typescript
// frontend/src/components/concerns/ConcernsList.tsx

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { concernsService } from '@/services/concerns.service';
import { WelfareConcern, ConcernStatus } from '@/types/concerns';
import { format } from 'date-fns';

const STATUS_COLORS: Record<ConcernStatus, string> = {
  open: 'bg-red-100 text-red-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
};

const CATEGORY_LABELS: Record<string, string> = {
  child_protection: 'Child Protection',
  financial_difficulty: 'Financial Difficulty',
  dropout_risk: 'Dropout Risk',
  irregular_attendance: 'Irregular Attendance',
  family_situation: 'Family Situation',
  health_medical: 'Health / Medical',
  bullying: 'Bullying',
  other: 'Other',
};

export function ConcernsList() {
  const { data: concerns, isLoading, refetch } = useQuery({
    queryKey: ['concerns'],
    queryFn: () => concernsService.getMySchoolConcerns(),
  });

  if (isLoading) return <div>Loading concerns...</div>;

  return (
    <div className="space-y-3">
      {concerns?.length === 0 ? (
        <p className="text-center text-gray-500">No concerns flagged yet</p>
      ) : (
        concerns?.map((concern: WelfareConcern) => (
          <div key={concern.id} className="border rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold">
                  {CATEGORY_LABELS[concern.category]} - {concern.grade_level} {concern.section}
                </h3>
                <p className="text-sm text-gray-600">
                  Flagged on {format(new Date(concern.flagged_at), 'MMM dd, yyyy')}
                </p>
              </div>
              <Badge className={STATUS_COLORS[concern.status]}>
                {concern.status}
              </Badge>
            </div>

            <p className="text-sm mb-3">{concern.description}</p>

            {concern.acknowledged_at && (
              <p className="text-xs text-green-600 mb-2">
                âœ“ Acknowledged on {format(new Date(concern.acknowledged_at), 'MMM dd, yyyy')}
              </p>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {/* Open detail view */}}
            >
              View Details & Messages
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
```

---

## SECTION 5: DATABASE QUERIES & AGGREGATION

### Dashboard KPI Queries

```php
// app/Services/DashboardService.php

<?php
namespace App\Services;

use App\Models\IndicatorSubmission;
use App\Models\WelfareConcern;
use App\Models\EnrollmentRecord;
use App\Models\School;
use Illuminate\Support\Collection;

class DashboardService {
    
    // Monitor: Overall KPIs
    public function getDivisionKPIs() {
        $currentYear = \App\Models\AcademicYear::where('is_current', true)->firstOrFail();
        $totalSchools = School::count();

        return [
            'submission_progress' => $this->getSubmissionProgress($currentYear),
            'pending_reviews' => $this->getPendingReviews(),
            'at_risk_schools' => $this->getAtRiskSchools($currentYear),
            'total_enrollment' => $this->getTotalEnrollment($currentYear),
            'dropout_rate' => $this->getDivisionDropoutRate($currentYear),
            'total_schools' => $totalSchools,
        ];
    }

    private function getSubmissionProgress($academicYear) {
        $totalSchools = School::count();
        
        $fullySubmitted = School::whereHas('indicatorSubmissions', function ($query) use ($academicYear) {
            $query->where('academic_year_id', $academicYear->id)
                  ->where('status', 'approved')
                  ->havingRaw('COUNT(DISTINCT submission_type) = 3');
        })->count();

        return [
            'submitted' => $fullySubmitted,
            'total' => $totalSchools,
            'percentage' => ($fullySubmitted / $totalSchools) * 100,
        ];
    }

    private function getPendingReviews() {
        return IndicatorSubmission::where('status', 'submitted')
                                  ->with(['school'])
                                  ->orderBy('created_at', 'asc')
                                  ->limit(10)
                                  ->get();
    }

    private function getAtRiskSchools($academicYear) {
        // Schools with high dropout rate OR open concerns
        $enrollments = EnrollmentRecord::where('academic_year_id', $academicYear->id)
                                       ->where('dropout_rate', '>=', 10)
                                       ->pluck('school_id');

        $concernSchools = WelfareConcern::where('status', 'open')
                                        ->groupBy('school_id')
                                        ->havingRaw('COUNT(*) >= 3')
                                        ->pluck('school_id');

        $atRiskIds = $enrollments->merge($concernSchools)->unique();

        return School::whereIn('id', $atRiskIds)->get();
    }

    private function getTotalEnrollment($academicYear) {
        return EnrollmentRecord::where('academic_year_id', $academicYear->id)
                               ->sum('total_enrolled');
    }

    private function getDivisionDropoutRate($academicYear) {
        $totalEnrolled = EnrollmentRecord::where('academic_year_id', $academicYear->id)
                                         ->sum('total_enrolled');
        $totalDropouts = EnrollmentRecord::where('academic_year_id', $academicYear->id)
                                         ->sum('dropouts');

        if ($totalEnrolled === 0) return 0;
        return ($totalDropouts / $totalEnrolled) * 100;
    }

    // Concerns breakdown (by category)
    public function getConcernsBreakdown() {
        return WelfareConcern::selectRaw('category, COUNT(*) as count, 
                                          SUM(CASE WHEN status = "open" THEN 1 ELSE 0 END) as open_count')
                            ->groupBy('category')
                            ->get()
                            ->map(function ($item) {
                                return [
                                    'category' => $item->category,
                                    'total' => $item->count,
                                    'open' => $item->open_count,
                                ];
                            });
    }

    // Compliance breakdown (pie chart)
    public function getComplianceBreakdown($academicYear) {
        return [
            'i_meta' => $this->getSubmissionStatusCounts('I-META', $academicYear),
            'targets_met' => $this->getSubmissionStatusCounts('BMEF', $academicYear),
            'smea' => $this->getSubmissionStatusCounts('SMEA', $academicYear),
        ];
    }

    private function getSubmissionStatusCounts($type, $academicYear) {
        return IndicatorSubmission::where('submission_type', $type)
                                  ->where('academic_year_id', $academicYear->id)
                                  ->selectRaw('status, COUNT(*) as count')
                                  ->groupBy('status')
                                  ->pluck('count', 'status')
                                  ->toArray();
    }
}
```

---

## SECTION 6: NOTIFICATION EVENTS

### Events

```php
// app/Events/ConcernFlagged.php
<?php
namespace App\Events;

use App\Models\WelfareConcern;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ConcernFlagged implements ShouldBroadcast {
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public WelfareConcern $concern) {}

    public function broadcastOn(): Channel {
        return new Channel('division-concerns');
    }

    public function broadcastAs(): string {
        return 'concern.flagged';
    }
}
```

---

## SECTION 7: TESTING STRATEGY

### API Test Example

```php
// tests/Feature/Api/ConcernControllerTest.php

<?php
namespace Tests\Feature\Api;

use App\Models\User;
use App\Models\School;
use App\Models\WelfareConcern;
use Tests\TestCase;

class ConcernControllerTest extends TestCase {
    
    private User $schoolHead;
    private User $monitor;
    private School $school;

    protected function setUp(): void {
        parent::setUp();
        
        $this->school = School::factory()->create();
        $this->schoolHead = User::factory()->create([
            'role' => 'school_head',
            'school_id' => $this->school->id,
        ]);
        $this->monitor = User::factory()->create(['role' => 'monitor']);
    }

    public function test_school_head_can_flag_concern() {
        $response = $this->actingAs($this->schoolHead)
                        ->postJson('/api/concerns/flag', [
                            'grade_level' => 'Grade 5',
                            'section' => 'Masigasig',
                            'category' => 'dropout_risk',
                            'description' => 'Student has been absent for 3 weeks and parents are not responsive.',
                        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('welfare_concerns', [
            'school_id' => $this->school->id,
            'flagged_by' => $this->schoolHead->id,
            'category' => 'dropout_risk',
        ]);
    }

    public function test_monitor_can_view_all_division_concerns() {
        WelfareConcern::factory()->count(5)->create();

        $response = $this->actingAs($this->monitor)
                        ->getJson('/api/concerns/division');

        $response->assertStatus(200);
        $response->assertJsonCount(5, 'data');
    }

    public function test_monitor_can_acknowledge_concern() {
        $concern = WelfareConcern::factory()->create();

        $response = $this->actingAs($this->monitor)
                        ->postJson("/api/concerns/{$concern->id}/acknowledge", [
                            'note' => 'We will follow up with the family.',
                        ]);

        $response->assertStatus(200);
        $this->assertEquals('in_progress', $concern->fresh()->status);
    }
}
```

---

## FINAL CHECKLIST BEFORE IMPLEMENTATION

- [ ] Create all 4 migrations
- [ ] Create all 4 models
- [ ] Create all controllers (ConcernController, EnrollmentController)
- [ ] Create all request validators
- [ ] Create frontend types
- [ ] Build modal components
- [ ] Implement notification events
- [ ] Write API tests
- [ ] Test end-to-end workflow
- [ ] Load test (100 concurrent concerns flagging)

---

**This guide covers:**
- âœ… Database schema & migrations
- âœ… Backend models & relationships
- âœ… API controllers & validation
- âœ… Frontend components & types
- âœ… Dashboard queries & KPI aggregation
- âœ… Notifications & events
- âœ… Testing strategy

**Ready to code!**


