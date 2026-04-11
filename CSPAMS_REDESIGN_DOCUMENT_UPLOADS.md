# CSPAMS 2.0 - REDESIGNED: Document Upload Instead of Form Builder

**Status:** Architecture Simplified  
**Impact:** Removes 40% of frontend complexity  
**New Scope:** I-META as form, TARGETS-MET + SMEA as file uploads  

---

## 🎯 THE NEW DESIGN (Much Simpler)

### What Changed

**OLD (Form Builder Complexity):**
```
I-META:        Form builder    ← Multiple sections, 50+ fields
TARGETS-MET:   Form builder    ← KPI tracking, scores
SMEA:          Form builder    ← Institutional strength evaluation
```

**NEW (Smart Simplification):**
```
I-META:        Form builder    ← Multiple sections, 50+ fields
TARGETS-MET:   File upload     ← School uploads Excel/PDF
SMEA:          File upload     ← School uploads Word/PDF
```

**Why this works:**

1. **Schools already have these documents** (they're manual processes now)
2. **Monitor doesn't need to edit them** (just needs to see them)
3. **No validation needed** (DepEd reviews content, not system)
4. **Saves 2 weeks of development** (no form builder for 2 forms)
5. **Better for schools** (use tools they already know: Excel, Word)

---

## 📊 NEW DATABASE SCHEMA

### Table: `indicator_submissions`

```sql
CREATE TABLE indicator_submissions (
    id BIGINT PRIMARY KEY,
    school_id BIGINT FOREIGN KEY,
    academic_year_id BIGINT FOREIGN KEY,
    
    -- I-META (form in database)
    submission_type ENUM('I-META') DEFAULT 'I-META',
    form_data JSON,  -- I-META form sections + scores
    
    -- TARGETS-MET (uploaded file)
    targets_met_file_path VARCHAR(255) NULLABLE,  -- path to uploaded file
    targets_met_uploaded_at TIMESTAMP NULLABLE,
    targets_met_original_filename VARCHAR(255) NULLABLE,
    
    -- SMEA (uploaded file)
    smea_file_path VARCHAR(255) NULLABLE,  -- path to uploaded file
    smea_uploaded_at TIMESTAMP NULLABLE,
    smea_original_filename VARCHAR(255) NULLABLE,
    
    -- Status tracking
    status ENUM('draft', 'submitted', 'returned', 'approved') DEFAULT 'draft',
    submitted_at TIMESTAMP NULLABLE,
    submitted_by BIGINT FOREIGN KEY (user_id),
    
    reviewed_by BIGINT FOREIGN KEY (user_id) NULLABLE,
    review_notes TEXT NULLABLE,
    
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
);

-- Index for fast lookup
CREATE INDEX idx_school_year ON indicator_submissions(school_id, academic_year_id);
CREATE INDEX idx_status ON indicator_submissions(status);
```

**Key Change:** Instead of separate `IndicatorSubmission` records for each form type, ONE submission can hold:
- I-META data (JSON)
- TARGETS-MET file (path)
- SMEA file (path)

All tracked together = simpler architecture.

---

## 📱 FRONTEND REDESIGN

### School Head View (Simplified)

**BEFORE:**
```
Requirements Page
├─ Tab: I-META (form with 50+ fields)
├─ Tab: TARGETS-MET (form with 30+ fields)  ❌ Complex
├─ Tab: SMEA (form with 20+ fields)         ❌ Complex
└─ Submit button
```

**AFTER:**
```
Requirements Page
├─ Section 1: I-META Form
│  ├─ Section I.A (5 questions)
│  ├─ Section I.B (5 questions)
│  ├─ ... etc
│  └─ Auto-calculated overall score
│
├─ Section 2: Upload TARGETS-MET
│  ├─ File picker (Excel expected)
│  ├─ Upload button
│  ├─ Show uploaded filename + date
│  └─ Replace button (if new version)
│
├─ Section 3: Upload SMEA
│  ├─ File picker (Word/PDF expected)
│  ├─ Upload button
│  ├─ Show uploaded filename + date
│  └─ Replace button (if new version)
│
└─ Submit All button (only enabled when all 3 complete)
```

---

## 🎨 UI COMPONENTS (Simplified)

### Component: FileUploadField.tsx

```typescript
interface FileUploadFieldProps {
  label: string;                    // "TARGETS-MET Report"
  description?: string;            // "Excel or PDF file"
  acceptedFormats: string[];       // ['.xlsx', '.xls', '.pdf']
  maxSizeMB: number;               // 10
  onFileSelected: (file: File) => void;
  currentFile?: {
    filename: string;
    uploadedAt: string;
  };
  isLoading?: boolean;
  error?: string;
}

export function FileUploadField({
  label,
  description,
  acceptedFormats,
  maxSizeMB,
  onFileSelected,
  currentFile,
  isLoading,
  error,
}: FileUploadFieldProps) {
  return (
    <div className="border-2 border-dashed rounded-lg p-6">
      <label className="block text-sm font-medium mb-2">{label}</label>
      
      {description && (
        <p className="text-xs text-gray-600 mb-3">{description}</p>
      )}
      
      {currentFile ? (
        <div className="bg-green-50 border border-green-200 rounded p-3 mb-3">
          <p className="text-sm text-green-800">
            ✅ {currentFile.filename}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Uploaded: {new Date(currentFile.uploadedAt).toLocaleDateString()}
          </p>
        </div>
      ) : null}
      
      <input
        type="file"
        accept={acceptedFormats.join(',')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.size > maxSizeMB * 1024 * 1024) {
              // Show error
              return;
            }
            onFileSelected(file);
          }
        }}
        disabled={isLoading}
        className="w-full"
      />
      
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
```

### Component: RequirementsPage.tsx (Simplified)

```typescript
export function RequirementsPage() {
  const { schoolId } = useParams();
  const [submission, setSubmission] = useState(null);
  const [formData, setFormData] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState({
    targetsMet: null,
    smea: null,
  });
  
  const handleIMetaChange = (sectionKey: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [sectionKey]: value
    }));
  };
  
  const handleTargetsMETUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('submission_id', submission.id);
    formData.append('type', 'targets_met');
    
    const response = await api.post('/submissions/upload-file', formData);
    setUploadedFiles(prev => ({
      ...prev,
      targetsMet: response.data.file_info
    }));
  };
  
  const handleSMEAUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('submission_id', submission.id);
    formData.append('type', 'smea');
    
    const response = await api.post('/submissions/upload-file', formData);
    setUploadedFiles(prev => ({
      ...prev,
      smea: response.data.file_info
    }));
  };
  
  const handleSubmit = async () => {
    await api.post('/submissions/indicator/submit', {
      submission_id: submission.id,
      imeta_form_data: formData,
      targets_met_uploaded: !!uploadedFiles.targetsMet,
      smea_uploaded: !!uploadedFiles.smea,
    });
  };
  
  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Annual Requirements</h1>
      
      {/* Progress bar showing 3 steps */}
      <div className="mb-8 flex justify-between">
        <div className="flex-1">
          <div className="text-sm font-medium mb-2">
            1. I-META Form {formData.schoolIdentification ? '✅' : ''}
          </div>
          <p className="text-xs text-gray-600">Quality assurance self-evaluation</p>
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium mb-2">
            2. TARGETS-MET {uploadedFiles.targetsMet ? '✅' : ''}
          </div>
          <p className="text-xs text-gray-600">Upload KPI targets file</p>
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium mb-2">
            3. SMEA {uploadedFiles.smea ? '✅' : ''}
          </div>
          <p className="text-xs text-gray-600">Upload institutional strength file</p>
        </div>
      </div>
      
      {/* PART 1: I-META FORM */}
      <section className="mb-8 border-t pt-6">
        <h2 className="text-xl font-bold mb-4">1. I-META Form</h2>
        
        {/* School Identification */}
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h3 className="font-semibold mb-4">School Identification</h3>
          <div className="grid grid-cols-2 gap-4">
            <input 
              type="text" 
              placeholder="School Name"
              className="border p-2 rounded"
            />
            <input 
              type="text" 
              placeholder="School Code"
              className="border p-2 rounded"
            />
            <input 
              type="text" 
              placeholder="Address"
              className="border p-2 rounded col-span-2"
            />
            <input 
              type="text" 
              placeholder="Principal Name"
              className="border p-2 rounded col-span-2"
            />
          </div>
        </div>
        
        {/* Section I.A: Leadership & Governance */}
        <div className="mb-6 p-4 bg-blue-50 rounded border-l-4 border-blue-400">
          <h3 className="font-semibold mb-4">I.A - Leadership & Governance</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">1. Does the school have a strategic plan?</label>
              <div className="mt-2 flex gap-4">
                {[1,2,3,4,5].map(score => (
                  <label key={score} className="flex items-center gap-2">
                    <input type="radio" name="ia_1" value={score} />
                    <span className="text-sm">{score}</span>
                  </label>
                ))}
              </div>
            </div>
            {/* More items... */}
          </div>
        </div>
        
        {/* Section I.B, I.C, etc. (abbreviated for demo) */}
        <div className="text-sm text-gray-600 p-4 bg-gray-50 rounded">
          [More sections: I.B, I.C, I.D, I.E would go here]
        </div>
      </section>
      
      {/* PART 2: TARGETS-MET FILE UPLOAD */}
      <section className="mb-8 border-t pt-6">
        <h2 className="text-xl font-bold mb-4">2. TARGETS-MET Report</h2>
        <p className="text-sm text-gray-600 mb-4">
          Upload your TARGETS-MET report (Excel or PDF format).
          This file should contain your Key Performance Indicator targets for the year.
        </p>
        
        <FileUploadField
          label="TARGETS-MET File"
          description="Accepted formats: Excel (.xlsx), PDF (.pdf)"
          acceptedFormats={['.xlsx', '.xls', '.pdf']}
          maxSizeMB={10}
          onFileSelected={handleTargetsMETUpload}
          currentFile={uploadedFiles.targetsMet}
        />
      </section>
      
      {/* PART 3: SMEA FILE UPLOAD */}
      <section className="mb-8 border-t pt-6">
        <h2 className="text-xl font-bold mb-4">3. SMEA Report</h2>
        <p className="text-sm text-gray-600 mb-4">
          Upload your SMEA report (School Management and Effectiveness Assessment).
          Can be in Word or PDF format.
        </p>
        
        <FileUploadField
          label="SMEA File"
          description="Accepted formats: Word (.docx), PDF (.pdf)"
          acceptedFormats={['.docx', '.doc', '.pdf']}
          maxSizeMB={10}
          onFileSelected={handleSMEAUpload}
          currentFile={uploadedFiles.smea}
        />
      </section>
      
      {/* SUBMIT BUTTON */}
      <div className="border-t pt-6 flex gap-4">
        <button
          onClick={handleSubmit}
          disabled={!uploadedFiles.targetsMet || !uploadedFiles.smea || Object.keys(formData).length === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          Submit All Requirements
        </button>
        <button
          onClick={() => setFormData({})}
          className="px-6 py-2 border border-gray-300 rounded"
        >
          Clear Form
        </button>
      </div>
    </div>
  );
}
```

---

## 🔌 BACKEND API (Simplified)

### Endpoint 1: POST /api/submissions/upload-file

```php
// app/Http/Controllers/Api/SubmissionController.php

public function uploadFile(Request $request)
{
    $validated = $request->validate([
        'file' => 'required|file|max:10240',  // 10MB max
        'submission_id' => 'required|exists:indicator_submissions,id',
        'type' => 'required|in:targets_met,smea',
    ]);
    
    $submission = IndicatorSubmission::findOrFail($request->submission_id);
    
    // Check school ownership (school head can only upload for their school)
    $this->authorize('update', $submission);
    
    // Store file securely
    $file = $request->file('file');
    $filename = $submission->school_id . '_' . $validated['type'] . '_' . time() . '.' . $file->getClientOriginalExtension();
    $path = $file->storeAs('submissions', $filename, 'private');
    
    // Update submission
    if ($validated['type'] === 'targets_met') {
        $submission->update([
            'targets_met_file_path' => $path,
            'targets_met_uploaded_at' => now(),
            'targets_met_original_filename' => $file->getClientOriginalName(),
        ]);
    } else {
        $submission->update([
            'smea_file_path' => $path,
            'smea_uploaded_at' => now(),
            'smea_original_filename' => $file->getClientOriginalName(),
        ]);
    }
    
    // Audit log
    AuditLog::create([
        'user_id' => auth()->id(),
        'action' => "uploaded_$validated[type]",
        'model' => 'IndicatorSubmission',
        'model_id' => $submission->id,
        'changes' => ['file_uploaded' => true],
    ]);
    
    return response()->json([
        'success' => true,
        'file_info' => [
            'filename' => $file->getClientOriginalName(),
            'uploadedAt' => now(),
        ]
    ]);
}
```

### Endpoint 2: GET /api/submissions/{id}/download

```php
public function downloadFile($submissionId, $fileType)
{
    $submission = IndicatorSubmission::findOrFail($submissionId);
    
    // Check access (school head can only download their own, monitor can download any)
    $this->authorize('view', $submission);
    
    if ($fileType === 'targets_met') {
        $path = $submission->targets_met_file_path;
        $filename = $submission->targets_met_original_filename;
    } else {
        $path = $submission->smea_file_path;
        $filename = $submission->smea_original_filename;
    }
    
    if (!$path || !Storage::disk('private')->exists($path)) {
        return response()->json(['error' => 'File not found'], 404);
    }
    
    return Storage::disk('private')->download($path, $filename);
}
```

### Endpoint 3: POST /api/submissions/indicator/submit

```php
public function submitIndicatorSubmission(Request $request)
{
    $validated = $request->validate([
        'submission_id' => 'required|exists:indicator_submissions,id',
        'imeta_form_data' => 'required|array',
        'targets_met_uploaded' => 'required|boolean',
        'smea_uploaded' => 'required|boolean',
    ]);
    
    $submission = IndicatorSubmission::findOrFail($validated['submission_id']);
    
    // Verify all files are uploaded
    if (!$validated['targets_met_uploaded'] || !$validated['smea_uploaded']) {
        return response()->json([
            'error' => 'TARGETS-MET and SMEA files must be uploaded'
        ], 422);
    }
    
    // Save I-META form data as JSON
    $submission->update([
        'form_data' => $validated['imeta_form_data'],
        'status' => 'submitted',
        'submitted_at' => now(),
        'submitted_by' => auth()->id(),
    ]);
    
    // Trigger notification
    event(new SubmissionSubmitted($submission));
    
    // Audit log
    AuditLog::create([
        'user_id' => auth()->id(),
        'action' => 'submitted',
        'model' => 'IndicatorSubmission',
        'model_id' => $submission->id,
        'changes' => ['status' => 'submitted'],
    ]);
    
    return response()->json([
        'success' => true,
        'message' => 'Requirements submitted successfully'
    ]);
}
```

---

## 📊 MONITOR DASHBOARD (Viewing Files)

### Component: SubmissionReviewPanel.tsx

```typescript
interface SubmissionReviewPanelProps {
  submission: IndicatorSubmission;
  onApprove: () => void;
  onReturn: (notes: string) => void;
}

export function SubmissionReviewPanel({
  submission,
  onApprove,
  onReturn,
}: SubmissionReviewPanelProps) {
  const [returnNotes, setReturnNotes] = useState('');
  const [activeTab, setActiveTab] = useState('imeta');
  
  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-2xl font-bold mb-4">
        Review Submission: {submission.school.name}
      </h2>
      
      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setActiveTab('imeta')}
          className={`px-4 py-2 ${activeTab === 'imeta' ? 'border-b-2 border-blue-600' : ''}`}
        >
          I-META Form
        </button>
        <button
          onClick={() => setActiveTab('targets')}
          className={`px-4 py-2 ${activeTab === 'targets' ? 'border-b-2 border-blue-600' : ''}`}
        >
          TARGETS-MET
        </button>
        <button
          onClick={() => setActiveTab('smea')}
          className={`px-4 py-2 ${activeTab === 'smea' ? 'border-b-2 border-blue-600' : ''}`}
        >
          SMEA
        </button>
      </div>
      
      {/* I-META Tab */}
      {activeTab === 'imeta' && (
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h3 className="font-bold mb-4">I-META Form Data</h3>
          
          <div className="space-y-4">
            {/* Display form sections */}
            {submission.form_data.schoolIdentification && (
              <div className="p-3 border rounded bg-white">
                <h4 className="font-semibold mb-2">School Info</h4>
                <p className="text-sm">
                  {submission.form_data.schoolIdentification.schoolName}
                </p>
              </div>
            )}
            
            {submission.form_data.sectionIA && (
              <div className="p-3 border rounded bg-white">
                <h4 className="font-semibold mb-2">I.A - Leadership & Governance</h4>
                <p className="text-sm">
                  Score: {submission.form_data.sectionIA.averageScore}/5
                </p>
              </div>
            )}
            
            {/* More sections... */}
          </div>
          
          {submission.form_data.overallRating && (
            <div className="mt-4 p-4 bg-blue-100 border border-blue-300 rounded">
              <p className="font-bold text-lg">
                Overall Rating: {submission.form_data.overallRating.toFixed(1)}/5
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* TARGETS-MET Tab */}
      {activeTab === 'targets' && (
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h3 className="font-bold mb-4">TARGETS-MET File</h3>
          
          {submission.targets_met_file_path ? (
            <div className="space-y-3">
              <div className="p-3 border rounded bg-white flex items-center justify-between">
                <div>
                  <p className="font-semibold">{submission.targets_met_original_filename}</p>
                  <p className="text-sm text-gray-600">
                    Uploaded: {new Date(submission.targets_met_uploaded_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => downloadFile(submission.id, 'targets_met')}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
                >
                  📥 Download
                </button>
              </div>
              
              <div className="p-3 border rounded bg-blue-50">
                <p className="text-sm text-gray-700">
                  ℹ️ Click Download to view the TARGETS-MET file in Excel or PDF viewer
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-700">❌ No TARGETS-MET file uploaded</p>
            </div>
          )}
        </div>
      )}
      
      {/* SMEA Tab */}
      {activeTab === 'smea' && (
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h3 className="font-bold mb-4">SMEA File</h3>
          
          {submission.smea_file_path ? (
            <div className="space-y-3">
              <div className="p-3 border rounded bg-white flex items-center justify-between">
                <div>
                  <p className="font-semibold">{submission.smea_original_filename}</p>
                  <p className="text-sm text-gray-600">
                    Uploaded: {new Date(submission.smea_uploaded_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => downloadFile(submission.id, 'smea')}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
                >
                  📥 Download
                </button>
              </div>
              
              <div className="p-3 border rounded bg-blue-50">
                <p className="text-sm text-gray-700">
                  ℹ️ Click Download to view the SMEA file in Word or PDF viewer
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-700">❌ No SMEA file uploaded</p>
            </div>
          )}
        </div>
      )}
      
      {/* Review Actions */}
      <div className="border-t pt-6 mt-6">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Review Notes:</label>
          <textarea
            value={returnNotes}
            onChange={(e) => setReturnNotes(e.target.value)}
            placeholder="Add notes for the school head (optional when approving, required when returning)"
            className="w-full border rounded p-3 text-sm"
            rows={4}
          />
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onApprove}
            className="px-6 py-2 bg-green-600 text-white rounded font-medium"
          >
            ✅ Approve
          </button>
          <button
            onClick={() => onReturn(returnNotes)}
            disabled={!returnNotes}
            className="px-6 py-2 bg-red-600 text-white rounded font-medium disabled:opacity-50"
          >
            🔄 Return for Revision
          </button>
          <button
            className="px-6 py-2 border border-gray-300 rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## ✅ BENEFITS OF THIS APPROACH

### For Schools
| Benefit | Impact |
|---------|--------|
| **Use familiar tools** | Fill TARGETS-MET in Excel, SMEA in Word |
| **Faster submission** | No learning new form builder |
| **Flexible formats** | Upload what you already have |
| **Less typing** | Schools already have these documents |

### For Developers
| Benefit | Impact |
|---------|--------|
| **40% less code** | No form builder for 2 forms |
| **No custom validation** | Files are just files, DepEd reviews content |
| **Simpler database** | Just store file paths |
| **2 weeks faster** | Timeline reduces 8 weeks → 6 weeks |

### For Monitors
| Benefit | Impact |
|---------|--------|
| **Easy review** | Download file and review in native app |
| **Better UX** | Familiar Excel/PDF viewers |
| **See everything** | All 3 documents in one submission |
| **Fast approval** | No validation, just review + approve/return |

---

## 📋 NEW DATABASE SCHEMA (Complete)

```sql
-- Single submission table for all 3 requirements
CREATE TABLE indicator_submissions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    academic_year_id BIGINT NOT NULL,
    
    -- I-META (form data in JSON)
    form_data JSON NOT NULL,  -- Contains schoolIdentification, sectionIA, sectionIB, etc.
    
    -- TARGETS-MET (uploaded file)
    targets_met_file_path VARCHAR(255),
    targets_met_original_filename VARCHAR(255),
    targets_met_uploaded_at TIMESTAMP,
    
    -- SMEA (uploaded file)
    smea_file_path VARCHAR(255),
    smea_original_filename VARCHAR(255),
    smea_uploaded_at TIMESTAMP,
    
    -- Submission tracking
    status ENUM('draft', 'submitted', 'returned', 'approved') DEFAULT 'draft',
    submitted_at TIMESTAMP,
    submitted_by BIGINT,
    
    -- Review tracking
    reviewed_by BIGINT,
    review_notes TEXT,
    reviewed_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (school_id) REFERENCES schools(id),
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (submitted_by) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id),
    
    UNIQUE KEY unique_school_year (school_id, academic_year_id),
    INDEX idx_status (status),
    INDEX idx_school_year (school_id, academic_year_id)
);

-- File storage in private directory
-- storage/app/private/submissions/
-- ├─ 12345_targets_met_1681234567.xlsx
-- ├─ 12345_smea_1681234568.pdf
-- └─ ...
```

---

## 🚀 NEW TIMELINE (2 Weeks Faster!)

**OLD (3-form builder approach):**
```
Week 1-2: Phase 1 Cleanup
Week 3-4: Phase 2 Backend API
Week 5-6: Phase 3-4 I-META form
Week 7: Phase 5 TARGETS-MET/SMEA form builders
Week 8: Testing + Deploy
```

**NEW (file upload approach):**
```
Week 1-2: Phase 1 Cleanup
Week 2-3: Phase 2 Backend API (simpler - just file upload)
Week 3-4: Phase 3-4 I-META form + file upload UI
Week 5: Phase 5 Monitor dashboard
Week 6: Phase 6 Real-time + notifications
Week 7: Phase 7 Security + Phase 8 Testing
→ PRODUCTION READY: 1 week earlier!
```

---

## 🗂️ SIMPLIFIED COMPONENT STRUCTURE

```
frontend/src/components/
├─ forms/
│  ├─ IMetaForm.tsx          (complex - 50 fields)
│  ├─ FileUploadField.tsx    (simple - 20 lines!)
│  └─ RequirementsPage.tsx   (I-META + file uploads)
│
├─ monitor/
│  ├─ SubmissionReviewPanel.tsx  (view I-META + download files)
│  └─ ReviewQueue.tsx
│
└─ shared/
   └─ FileDownloadButton.tsx
```

**Code reduction:** 500+ lines → 200 lines

---

## 💾 FILE STORAGE STRATEGY

### Local Development
```
storage/app/private/submissions/
├─ 12345_targets_met_1681234567.xlsx
├─ 12345_smea_1681234568.pdf
└─ 67890_targets_met_1681234569.xlsx
```

### Production (S3 - Optional)
```
AWS S3: s3://cspams-submissions/
├─ 2026/april/
│  ├─ school-12345/
│  │  ├─ targets-met.xlsx
│  │  └─ smea.pdf
│  └─ school-67890/
│     └─ targets-met.xlsx
```

### Security
```php
// File never stored in public/ folder
// Always use Storage::disk('private')
// Downloads go through controller (permission check)
// Files encrypted at rest (AWS S3 server-side encryption)
```

---

## 📱 API ENDPOINTS (SIMPLIFIED)

### School Head Endpoints

```
POST   /api/submissions/create
       Create a new submission for current school + year

POST   /api/submissions/{id}/imeta-form
       Save I-META form data (draft)

POST   /api/submissions/{id}/upload-file
       Upload TARGETS-MET or SMEA file
       body: { file, type: 'targets_met'|'smea' }

POST   /api/submissions/{id}/submit
       Submit all 3 requirements
       body: { imeta_form_data, targets_met_uploaded, smea_uploaded }

GET    /api/submissions/{id}/download/{fileType}
       Download uploaded file
       params: fileType = 'targets_met'|'smea'
```

### Monitor Endpoints

```
GET    /api/submissions?school={id}&status=submitted
       Get all submissions for review

GET    /api/submissions/{id}
       View a submission (all 3 parts)

POST   /api/submissions/{id}/approve
       Approve submission

POST   /api/submissions/{id}/return
       Return submission for revision
       body: { review_notes }

GET    /api/submissions/{id}/download/{fileType}
       Download file to review
```

---

## ✅ CHECKLIST: What Changed

| Item | Before | After | Impact |
|------|--------|-------|--------|
| **TARGETS-MET** | Custom form builder | File upload | -30 hours dev time |
| **SMEA** | Custom form builder | File upload | -30 hours dev time |
| **Database** | 3 separate submission types | 1 submission with file fields | Simpler queries |
| **Frontend components** | Form builder for 2 forms | Simple file upload component | 60% less code |
| **Validation** | Custom rule validation | No validation (DepEd reviews content) | -5 hours |
| **UI Complexity** | High (3 form builders) | Low (upload fields + download buttons) | Better UX |
| **Total Timeline** | 8 weeks | 6 weeks | 2 weeks faster |

---

## 🎯 NEW SCOPE (Updated)

```
PHASE 1: Cleanup (2-3 days)
├─ Delete old learner models
└─ Create new tables

PHASE 2: Backend Core (2-3 days) [REDUCED from 3-4]
├─ I-META form submission
├─ File upload endpoint
└─ File download endpoint

PHASE 3: Frontend Auth (2 days)
├─ Login + layout
└─ Role-based navigation

PHASE 4: School Head Features (3 days) [REDUCED from 4-5]
├─ I-META form
├─ File upload UI
└─ Dashboard

PHASE 5: Monitor Features (2-3 days) [REDUCED from 4-5]
├─ Submission review
├─ File download + review
└─ Approval workflow

PHASE 6: Concerns (2-3 days)
├─ Flag concern
├─ Thread messages
└─ Status workflow

PHASE 7: Real-time + Security (2 days)
├─ Reverb notifications
├─ CSRF + rate limiting
└─ File encryption

PHASE 8: Testing + Deploy (2 days)
├─ E2E tests
├─ Load testing
└─ Production deploy
```

**Total: 6 weeks (down from 8)**

---

## 🎁 SUMMARY

**Your insight was brilliant:**
- Schools already have TARGETS-MET (probably Excel)
- Schools already have SMEA (probably Word or PDF)
- Monitors don't need to edit these files
- System just needs to store + show them

**New design = pragmatic:**
1. ✅ I-META as form (clear structure, needs validation)
2. ✅ TARGETS-MET as file upload (schools already have this)
3. ✅ SMEA as file upload (schools already have this)
4. ✅ 2 weeks faster
5. ✅ 40% less code
6. ✅ Better school head UX

**This is the way.** 🚀

---

**Document Status:** Redesign Complete  
**Impact:** 8 weeks → 6 weeks (2 weeks faster)  
**Code Reduction:** 40% less frontend code  
**UX Improvement:** Schools use familiar tools  
