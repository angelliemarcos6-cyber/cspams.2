import { useCallback, useState } from "react";
import type { MonitorArchivedSchoolsProps } from "@/pages/monitor/MonitorArchivedSchools";
import type { SchoolRecord } from "@/types";

type ToastTone = "success" | "info" | "warning";

interface UseMonitorArchivedSchoolsOptions {
  isSaving: boolean;
  listArchivedRecords: () => Promise<SchoolRecord[]>;
  restoreRecord: (id: string) => Promise<void>;
  pushToast: (message: string, tone: ToastTone) => void;
  formatDateTime: (value: string) => string;
}

export interface UseMonitorArchivedSchoolsResult {
  deleteError: string;
  showArchivedRecords: boolean;
  loadArchivedRecords: () => Promise<void>;
  toggleArchivedRecords: () => Promise<void>;
  clearDeleteError: () => void;
  archivedSchoolsProps: MonitorArchivedSchoolsProps;
}

export function useMonitorArchivedSchools({
  isSaving,
  listArchivedRecords,
  restoreRecord,
  pushToast,
  formatDateTime,
}: UseMonitorArchivedSchoolsOptions): UseMonitorArchivedSchoolsResult {
  const [deleteError, setDeleteError] = useState("");
  const [archivedRecords, setArchivedRecords] = useState<SchoolRecord[]>([]);
  const [showArchivedRecords, setShowArchivedRecords] = useState(false);
  const [isArchivedRecordsLoading, setIsArchivedRecordsLoading] = useState(false);

  const clearDeleteError = useCallback(() => {
    setDeleteError("");
  }, []);

  const loadArchivedRecords = useCallback(async () => {
    setIsArchivedRecordsLoading(true);
    setDeleteError("");
    try {
      const archived = await listArchivedRecords();
      setArchivedRecords(archived);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Unable to load archived schools.");
    } finally {
      setIsArchivedRecordsLoading(false);
    }
  }, [listArchivedRecords]);

  const toggleArchivedRecords = useCallback(async () => {
    const next = !showArchivedRecords;
    setShowArchivedRecords(next);
    if (next) {
      await loadArchivedRecords();
    }
  }, [loadArchivedRecords, showArchivedRecords]);

  const handleRestoreArchivedRecord = useCallback(
    async (record: SchoolRecord) => {
      setDeleteError("");
      try {
        await restoreRecord(record.id);
        await loadArchivedRecords();
        pushToast(`Restored ${record.schoolName}.`, "success");
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Unable to restore school record.");
      }
    },
    [loadArchivedRecords, pushToast, restoreRecord],
  );

  return {
    deleteError,
    showArchivedRecords,
    loadArchivedRecords,
    toggleArchivedRecords,
    clearDeleteError,
    archivedSchoolsProps: {
      show: showArchivedRecords,
      archivedRecords,
      isLoading: isArchivedRecordsLoading,
      isSaving,
      onRefresh: loadArchivedRecords,
      onRestore: handleRestoreArchivedRecord,
      formatDateTime,
    },
  };
}
