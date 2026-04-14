import type { SchoolBulkImportResult } from "@/types";

export interface MonitorSchoolMessagesProps {
  deleteError: string;
  bulkImportError: string;
  bulkImportSummary: SchoolBulkImportResult | null;
}

export function MonitorSchoolMessages({
  deleteError,
  bulkImportError,
  bulkImportSummary,
}: MonitorSchoolMessagesProps) {
  return (
    <>
      {deleteError && (
        <div className="mx-5 mt-4 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
          {deleteError}
        </div>
      )}
      {bulkImportError && (
        <div className="mx-5 mt-4 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
          {bulkImportError}
        </div>
      )}
      {bulkImportSummary && (
        <div className="mx-5 mt-4 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
          Import complete: {bulkImportSummary.created} created, {bulkImportSummary.updated} updated,{" "}
          {bulkImportSummary.restored} restored, {bulkImportSummary.skipped} skipped, {bulkImportSummary.failed} failed.
        </div>
      )}
    </>
  );
}
