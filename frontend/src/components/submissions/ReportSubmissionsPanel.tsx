import { useState, useRef, useCallback } from "react";
import { Upload, RefreshCw, Download, FileText, CheckCircle, Clock, AlertCircle, X } from "lucide-react";
import { useReportSubmissionData } from "@/context/ReportSubmissionData";
import { useAuth } from "@/context/Auth";
import type { ReportSubmission, ReportType, ReportStatus } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPORT_LABELS: Record<ReportType, string> = {
  bmef: "BMEF",
  targets_met: "TARGETS-MET",
};

const REPORT_DESCRIPTIONS: Record<ReportType, string> = {
  bmef: "Basic Monitoring and Evaluation Form",
  targets_met: "School Performance Targets Met Report",
};

const STATUS_CONFIG: Record<ReportStatus, { label: string; colorClass: string; icon: React.ReactNode }> = {
  pending: {
    label: "Pending",
    colorClass: "text-gray-500 bg-gray-100",
    icon: <Clock className="w-4 h-4" />,
  },
  submitted: {
    label: "Submitted",
    colorClass: "text-blue-700 bg-blue-100",
    icon: <AlertCircle className="w-4 h-4" />,
  },
  approved: {
    label: "Approved",
    colorClass: "text-green-700 bg-green-100",
    icon: <CheckCircle className="w-4 h-4" />,
  },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Single Report Card
// ---------------------------------------------------------------------------

interface ReportCardProps {
  reportType: ReportType;
  submission: ReportSubmission | null;
  isSchoolHead: boolean;
  isMonitor: boolean;
  academicYearId: string | null;
  onUpload: (reportType: ReportType, file: File) => Promise<void>;
  onReplace: (submissionId: string, file: File) => Promise<void>;
  onApprove: (submissionId: string) => Promise<void>;
  downloadUrl: (submissionId: string) => string;
}

function ReportCard({
  reportType,
  submission,
  isSchoolHead,
  isMonitor,
  academicYearId,
  onUpload,
  onReplace,
  onApprove,
  downloadUrl,
}: ReportCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const status: ReportStatus = submission?.status ?? "pending";
  const statusCfg = STATUS_CONFIG[status];

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelected(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  }

  async function handleFileSelected(file: File) {
    if (!academicYearId && !submission) {
      setUploadError("No active academic year found.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      if (submission) {
        await onReplace(submission.id, file);
      } else {
        await onUpload(reportType, file);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleApprove() {
    if (!submission) return;
    setApproving(true);
    try {
      await onApprove(submission.id);
    } finally {
      setApproving(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      {/* Card header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">{REPORT_LABELS[reportType]}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{REPORT_DESCRIPTIONS[reportType]}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.colorClass}`}>
          {statusCfg.icon}
          {statusCfg.label}
        </span>
      </div>

      {/* File info */}
      {submission?.originalFilename && (
        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-gray-800 truncate">{submission.originalFilename}</p>
              <p className="text-xs text-gray-400">
                {submission.fileSize ? formatFileSize(submission.fileSize) : ""}
                {submission.submittedAt
                  ? ` · Submitted ${new Date(submission.submittedAt).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
          </div>
          <a
            href={downloadUrl(submission.id)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 flex-shrink-0 ml-3"
          >
            <Download className="w-3.5 h-3.5" /> View
          </a>
        </div>
      )}

      {/* Approval info */}
      {submission?.status === "approved" && submission.approvedAt && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5" />
          Approved on {new Date(submission.approvedAt).toLocaleDateString()}
          {submission.approvedBy?.name ? ` by ${submission.approvedBy.name}` : ""}
        </p>
      )}

      {uploadError && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> {uploadError}
        </p>
      )}

      {/* Actions */}
      {isSchoolHead && submission?.status !== "approved" && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".pdf,.docx,.doc,.xlsx,.xls"
            onChange={handleFileChange}
            disabled={uploading}
          />
          {uploading ? (
            <p className="text-sm text-blue-600 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Uploading...
            </p>
          ) : (
            <div className="space-y-1">
              <Upload className="w-5 h-5 text-gray-400 mx-auto" />
              <p className="text-sm text-gray-600">
                {submission ? "Replace file" : "Upload file"}
              </p>
              <p className="text-xs text-gray-400">PDF, DOCX, XLSX · Max 10 MB</p>
            </div>
          )}
        </div>
      )}

      {isMonitor && submission?.status === "submitted" && (
        <button
          onClick={handleApprove}
          disabled={approving}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          {approving ? "Approving..." : "Approve Submission"}
        </button>
      )}

      {!submission && !isSchoolHead && (
        <p className="text-sm text-center text-gray-400 italic py-2">No file submitted yet.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export default function ReportSubmissionsPanel() {
  const { user } = useAuth();
  const { submissions, loading, error, uploadReport, replaceReport, approveReport, getDownloadUrl } = useReportSubmissionData();

  const isSchoolHead = user?.role === "school_head";
  const isMonitor = user?.role === "monitor";

  // Find the current academic year from submissions or use null
  const currentAcademicYearId = submissions.find((s) => s.academicYear?.isCurrent)?.academicYearId ?? null;

  function findSubmission(type: ReportType): ReportSubmission | null {
    return submissions.find((s) => s.reportType === type && (s.academicYear?.isCurrent ?? false)) ?? null;
  }

  const handleUpload = useCallback(async (reportType: ReportType, file: File) => {
    if (!currentAcademicYearId) throw new Error("No active academic year.");
    await uploadReport(reportType, currentAcademicYearId, file);
  }, [uploadReport, currentAcademicYearId]);

  const bmefSubmission = findSubmission("bmef");
  const targetMetSubmission = findSubmission("targets_met");

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">File Reports</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload required file-based reports for the current academic year.
          These are separate from encoded I-META indicators.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading submissions...</div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-500">{error}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReportCard
            reportType="bmef"
            submission={bmefSubmission}
            isSchoolHead={isSchoolHead}
            isMonitor={isMonitor}
            academicYearId={currentAcademicYearId}
            onUpload={handleUpload}
            onReplace={replaceReport}
            onApprove={approveReport}
            downloadUrl={getDownloadUrl}
          />
          <ReportCard
            reportType="targets_met"
            submission={targetMetSubmission}
            isSchoolHead={isSchoolHead}
            isMonitor={isMonitor}
            academicYearId={currentAcademicYearId}
            onUpload={handleUpload}
            onReplace={replaceReport}
            onApprove={approveReport}
            downloadUrl={getDownloadUrl}
          />
        </div>
      )}

      {/* Divider — visual separation from I-META below */}
      <div className="pt-2">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center">
            <span className="px-3 bg-white text-xs font-medium text-gray-400 uppercase tracking-wide">
              Encoded Indicators (I-META) below
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
