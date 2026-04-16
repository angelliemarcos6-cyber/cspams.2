import { Eye, Upload } from "lucide-react";

// NEW 2026 COMPLIANCE UI: BMEF tab replaces TARGETS-MET
// 4-tab layout (School Achievements | Key Performance | BMEF | SMEA)
// Monitor & School Head views updated for DepEd standards
interface UploadFileMetadata {
  filename: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
}

interface FileUploadFieldProps {
  label: string;
  description: string;
  file: UploadFileMetadata | null;
  submitted: boolean;
  canViewReport?: boolean;
  isUploading: boolean;
  disabled: boolean;
  onUploadClick: () => void;
  onViewClick?: () => void;
  onDownloadClick: () => void;
  error?: string;
}

function formatUploadedAt(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return parsed.toLocaleDateString();
}

export function FileUploadField({
  label,
  file,
  submitted,
  canViewReport = false,
  isUploading,
  disabled,
  onUploadClick,
  onViewClick,
  error = "",
}: FileUploadFieldProps) {
  const fileLabel = file?.filename?.trim() || "- (none)";
  const dateLabel = file?.uploadedAt ? formatUploadedAt(file.uploadedAt) : "-";
  const canOpenReport = canViewReport && submitted;
  const isPrimaryDisabled = disabled;

  const handlePrimaryAction = () => {
    if (canOpenReport) {
      onViewClick?.();
      return;
    }

    onUploadClick();
  };

  return (
    <article className="rounded-sm border border-slate-200 bg-white p-3">
      <div className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{label} REPORT</h3>
        <div className="space-y-1 text-sm text-slate-700">
          <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[12px] font-semibold text-slate-700">File</span>
            <span className="truncate text-sm font-semibold text-slate-500">{fileLabel}</span>
          </div>
          <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
            <span className="text-[12px] font-semibold text-slate-700">Date</span>
            <span className="text-sm font-semibold text-slate-500">{dateLabel}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handlePrimaryAction}
        disabled={isPrimaryDisabled}
        className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
          canOpenReport
            ? "border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
        }`}
      >
        {canOpenReport ? <Eye className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
        {canOpenReport ? `View ${label} Report` : (isUploading ? "Uploading..." : `Upload ${label} Report`)}
      </button>

      {error && (
        <p className="rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          {error}
        </p>
      )}
    </article>
  );
}
