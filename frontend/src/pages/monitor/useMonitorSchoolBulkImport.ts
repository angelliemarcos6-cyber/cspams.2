import { useCallback, useMemo, useRef, useState, type ChangeEvent, type MutableRefObject } from "react";
import type { MonitorSchoolMessagesProps } from "@/pages/monitor/MonitorSchoolMessages";
import type { SchoolBulkImportResult, SchoolBulkImportRowPayload } from "@/types";
import { parseSchoolBulkImportCsv } from "./monitorSchoolBulkImportCsv";

type ToastTone = "success" | "info" | "warning";

interface UseMonitorSchoolBulkImportOptions {
  bulkImportRecords: (
    rows: SchoolBulkImportRowPayload[],
    options?: { updateExisting?: boolean; restoreArchived?: boolean },
  ) => Promise<SchoolBulkImportResult>;
  showArchivedRecords: boolean;
  loadArchivedRecords: () => Promise<void>;
  pushToast: (message: string, tone: ToastTone) => void;
}

export interface UseMonitorSchoolBulkImportResult {
  bulkImportInputRef: MutableRefObject<HTMLInputElement | null>;
  isBulkImporting: boolean;
  openBulkImportPicker: () => void;
  handleBulkImportFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  clearBulkImportError: () => void;
  clearBulkImportFeedback: () => void;
  schoolMessagesProps: MonitorSchoolMessagesProps;
}

export function useMonitorSchoolBulkImport({
  bulkImportRecords,
  showArchivedRecords,
  loadArchivedRecords,
  pushToast,
}: UseMonitorSchoolBulkImportOptions): UseMonitorSchoolBulkImportResult {
  const [bulkImportSummary, setBulkImportSummary] = useState<SchoolBulkImportResult | null>(null);
  const [bulkImportError, setBulkImportError] = useState("");
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const bulkImportInputRef = useRef<HTMLInputElement | null>(null);

  const clearBulkImportError = useCallback(() => {
    setBulkImportError("");
  }, []);

  const clearBulkImportFeedback = useCallback(() => {
    setBulkImportError("");
    setBulkImportSummary(null);
  }, []);

  const openBulkImportPicker = useCallback(() => {
    bulkImportInputRef.current?.click();
  }, []);

  const handleBulkImportFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      clearBulkImportFeedback();
      setIsBulkImporting(true);

      try {
        const content = await file.text();
        const parsed = parseSchoolBulkImportCsv(content);
        if (parsed.errors.length > 0) {
          setBulkImportError(parsed.errors.slice(0, 5).join(" "));
          return;
        }

        if (parsed.rows.length === 0) {
          setBulkImportError("No valid rows found in the CSV file.");
          return;
        }

        const summary = await bulkImportRecords(parsed.rows, {
          updateExisting: true,
          restoreArchived: true,
        });

        setBulkImportSummary(summary);
        pushToast(
          `Import complete: ${summary.created} created, ${summary.updated} updated, ${summary.restored} restored.`,
          "success",
        );

        if (showArchivedRecords) {
          await loadArchivedRecords();
        }
      } catch (err) {
        setBulkImportError(err instanceof Error ? err.message : "Bulk import failed.");
      } finally {
        setIsBulkImporting(false);
      }
    },
    [bulkImportRecords, clearBulkImportFeedback, loadArchivedRecords, pushToast, showArchivedRecords],
  );

  const schoolMessagesProps = useMemo<MonitorSchoolMessagesProps>(
    () => ({
      deleteError: "",
      bulkImportError,
      bulkImportSummary,
    }),
    [bulkImportError, bulkImportSummary],
  );

  return {
    bulkImportInputRef,
    isBulkImporting,
    openBulkImportPicker,
    handleBulkImportFileChange,
    clearBulkImportError,
    clearBulkImportFeedback,
    schoolMessagesProps,
  };
}
