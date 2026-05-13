import { useCallback, useMemo, useState } from "react";
import type {
  MonitorSchoolHeadAccountRow,
  MonitorSchoolHeadAccountsPanelProps,
  SchoolHeadAccountsStatusFilter,
} from "@/pages/monitor/MonitorSchoolHeadAccountsPanel";
import type { MonitorSchoolRecordsListRow } from "@/pages/monitor/MonitorSchoolRecordsList";
import { useSchoolHeadAccountActions } from "@/pages/monitor/useSchoolHeadAccountActions";
import type {
  SchoolHeadAccountActivationResult,
  SchoolHeadAccountActionVerificationCodeResult,
  SchoolHeadAccountBatchRemovalResult,
  SchoolHeadAccountPayload,
  SchoolHeadAccountProfileUpsertResult,
  SchoolHeadAccountRemovalResult,
  SchoolRecordDeletePreview,
  SchoolHeadAccountStatusUpdatePayload,
  SchoolHeadAccountStatusUpdateResult,
  SchoolHeadPasswordResetLinkResult,
  SchoolHeadSetupLinkResult,
  SchoolHeadTemporaryPasswordResult,
  SchoolRecord,
} from "@/types";

type ToastTone = "success" | "info" | "warning";

interface UseMonitorSchoolHeadAccountsPanelStateOptions {
  isMobileViewport: boolean;
  isSaving: boolean;
  compactSchoolRows: MonitorSchoolRecordsListRow[];
  recordBySchoolKey: Map<string, SchoolRecord>;
  pushToast: (message: string, tone: ToastTone) => void;
  updateSchoolHeadAccountStatus: (
    schoolId: string,
    payload: SchoolHeadAccountStatusUpdatePayload,
  ) => Promise<SchoolHeadAccountStatusUpdateResult>;
  activateSchoolHeadAccount: (
    schoolId: string,
    payload?: { reason?: string | null },
  ) => Promise<SchoolHeadAccountActivationResult>;
  issueSchoolHeadAccountActionVerificationCode: (
    schoolId: string,
    targetStatus: "suspended" | "locked" | "archived" | "deleted" | "password_reset" | "email_change" | "temporary_password",
  ) => Promise<SchoolHeadAccountActionVerificationCodeResult>;
  issueSchoolHeadSetupLink: (schoolId: string, reason?: string | null) => Promise<SchoolHeadSetupLinkResult>;
  issueSchoolHeadPasswordResetLink: (
    schoolId: string,
    payload: { reason: string; verificationChallengeId: string; verificationCode: string },
  ) => Promise<SchoolHeadPasswordResetLinkResult>;
  issueSchoolHeadTemporaryPassword: (
    schoolId: string,
    payload: { reason: string; verificationChallengeId: string; verificationCode: string },
  ) => Promise<SchoolHeadTemporaryPasswordResult>;
  upsertSchoolHeadAccountProfile: (
    schoolId: string,
    payload: SchoolHeadAccountPayload,
  ) => Promise<SchoolHeadAccountProfileUpsertResult>;
  removeSchoolHeadAccount: (
    schoolId: string,
    payload: { reason?: string | null },
  ) => Promise<SchoolHeadAccountRemovalResult>;
  removeSchoolHeadAccountsBatch?: (
    schoolIds: string[],
    payload?: { reason?: string | null },
  ) => Promise<SchoolHeadAccountBatchRemovalResult>;
  deleteRecord: (id: string) => Promise<void>;
  previewDeleteRecord: (id: string) => Promise<SchoolRecordDeletePreview>;
  onOpenSchoolRecord: (record: SchoolRecord) => void;
  formatDateTime: (value: string) => string;
}

export interface UseMonitorSchoolHeadAccountsPanelStateResult {
  showSchoolHeadAccountsPanel: boolean;
  toggleSchoolHeadAccountsPanel: () => void;
  schoolHeadAccountsPanelProps: MonitorSchoolHeadAccountsPanelProps | null;
}

export function useMonitorSchoolHeadAccountsPanelState({
  isMobileViewport,
  isSaving,
  compactSchoolRows,
  recordBySchoolKey,
  pushToast,
  updateSchoolHeadAccountStatus,
  activateSchoolHeadAccount,
  issueSchoolHeadAccountActionVerificationCode,
  issueSchoolHeadSetupLink,
  issueSchoolHeadPasswordResetLink,
  issueSchoolHeadTemporaryPassword,
  upsertSchoolHeadAccountProfile,
  removeSchoolHeadAccount,
  removeSchoolHeadAccountsBatch = async () => {
    throw new Error("Batch delete is unavailable.");
  },
  deleteRecord,
  previewDeleteRecord,
  onOpenSchoolRecord,
  formatDateTime,
}: UseMonitorSchoolHeadAccountsPanelStateOptions): UseMonitorSchoolHeadAccountsPanelStateResult {
  const [showSchoolHeadAccountsPanel, setShowSchoolHeadAccountsPanel] = useState(false);
  const [schoolHeadAccountsQuery, setSchoolHeadAccountsQuery] = useState("");
  const [schoolHeadAccountsStatusFilter, setSchoolHeadAccountsStatusFilter] =
    useState<SchoolHeadAccountsStatusFilter>("all");
  const [schoolHeadAccountsOnlyFlagged, setSchoolHeadAccountsOnlyFlagged] = useState(false);
  const [schoolHeadAccountsOnlyDeleteFlagged, setSchoolHeadAccountsOnlyDeleteFlagged] = useState(false);
  const [pendingDeleteSchoolRecord, setPendingDeleteSchoolRecord] = useState<SchoolRecord | null>(null);
  const [pendingDeleteSchoolRecordPreview, setPendingDeleteSchoolRecordPreview] = useState<SchoolRecordDeletePreview | null>(null);
  const [pendingDeleteSchoolRecordError, setPendingDeleteSchoolRecordError] = useState("");
  const [isDeleteSchoolRecordLoading, setIsDeleteSchoolRecordLoading] = useState(false);
  const [isBatchDeleteSchoolRecordsLoading, setIsBatchDeleteSchoolRecordsLoading] = useState(false);
  const [isBatchDeleteSchoolRecordsPending, setIsBatchDeleteSchoolRecordsPending] = useState(false);
  const [batchDeleteSchoolRecordsError, setBatchDeleteSchoolRecordsError] = useState("");

  const schoolHeadAccountActions = useSchoolHeadAccountActions({
    isPanelOpen: showSchoolHeadAccountsPanel,
    isSaving,
    pushToast,
    updateSchoolHeadAccountStatus,
    activateSchoolHeadAccount,
    issueSchoolHeadAccountActionVerificationCode,
    issueSchoolHeadSetupLink,
    issueSchoolHeadPasswordResetLink,
    issueSchoolHeadTemporaryPassword,
    upsertSchoolHeadAccountProfile,
    removeSchoolHeadAccount,
  });

  const closeSchoolHeadAccountsPanel = useCallback(() => {
    setShowSchoolHeadAccountsPanel(false);
    schoolHeadAccountActions.resetPanelState();
    setPendingDeleteSchoolRecord(null);
    setPendingDeleteSchoolRecordPreview(null);
    setPendingDeleteSchoolRecordError("");
    setIsDeleteSchoolRecordLoading(false);
    setIsBatchDeleteSchoolRecordsLoading(false);
    setIsBatchDeleteSchoolRecordsPending(false);
    setBatchDeleteSchoolRecordsError("");
  }, [schoolHeadAccountActions]);

  const toggleSchoolHeadAccountsPanel = useCallback(() => {
    setShowSchoolHeadAccountsPanel((current) => {
      const next = !current;
      if (!next) {
        schoolHeadAccountActions.resetPanelState();
        setPendingDeleteSchoolRecord(null);
        setPendingDeleteSchoolRecordPreview(null);
        setPendingDeleteSchoolRecordError("");
        setIsDeleteSchoolRecordLoading(false);
        setIsBatchDeleteSchoolRecordsLoading(false);
        setIsBatchDeleteSchoolRecordsPending(false);
        setBatchDeleteSchoolRecordsError("");
      }
      return next;
    });
  }, [schoolHeadAccountActions]);

  const closePendingDeleteSchoolRecord = useCallback(() => {
    setPendingDeleteSchoolRecord(null);
    setPendingDeleteSchoolRecordPreview(null);
    setPendingDeleteSchoolRecordError("");
    setIsDeleteSchoolRecordLoading(false);
  }, []);

  const closePendingBatchDeleteSchoolRecords = useCallback(() => {
    setIsBatchDeleteSchoolRecordsPending(false);
    setIsBatchDeleteSchoolRecordsLoading(false);
    setBatchDeleteSchoolRecordsError("");
  }, []);

  const openPendingDeleteSchoolRecord = useCallback(
    async (record: SchoolRecord) => {
      schoolHeadAccountActions.toggleAccountRowMenu(record.id);
      setPendingDeleteSchoolRecord(record);
      setPendingDeleteSchoolRecordPreview(null);
      setPendingDeleteSchoolRecordError("");
      setIsDeleteSchoolRecordLoading(true);

      try {
        const preview = await previewDeleteRecord(record.id);
        setPendingDeleteSchoolRecordPreview(preview);
      } catch (err) {
        setPendingDeleteSchoolRecordError(
          err instanceof Error ? err.message : "Unable to load school archive preview.",
        );
      } finally {
        setIsDeleteSchoolRecordLoading(false);
      }
    },
    [previewDeleteRecord, schoolHeadAccountActions],
  );

  const confirmDeleteSchoolRecord = useCallback(async () => {
    if (!pendingDeleteSchoolRecord) {
      return;
    }

    setPendingDeleteSchoolRecordError("");
    setIsDeleteSchoolRecordLoading(true);

    try {
      await deleteRecord(pendingDeleteSchoolRecord.id);
      pushToast(`${pendingDeleteSchoolRecord.schoolName} moved to Archived Schools.`, "success");
      closePendingDeleteSchoolRecord();
    } catch (err) {
      setPendingDeleteSchoolRecordError(
        err instanceof Error ? err.message : "Unable to archive school record.",
      );
    } finally {
      setIsDeleteSchoolRecordLoading(false);
    }
  }, [closePendingDeleteSchoolRecord, deleteRecord, pendingDeleteSchoolRecord, pushToast]);

  const deleteFlaggedSchoolIds = useMemo(
    () =>
      compactSchoolRows
        .map(({ summary, record }) => record ?? recordBySchoolKey.get(summary.schoolKey) ?? null)
        .filter((record): record is SchoolRecord => Boolean(record?.schoolHeadAccount?.deleteRecordFlagged))
        .map((record) => record.id),
    [compactSchoolRows, recordBySchoolKey],
  );

  const openPendingBatchDeleteSchoolRecords = useCallback(() => {
    if (deleteFlaggedSchoolIds.length === 0) {
      return;
    }

    setBatchDeleteSchoolRecordsError("");
    setIsBatchDeleteSchoolRecordsPending(true);
  }, [deleteFlaggedSchoolIds.length]);

  const confirmBatchDeleteSchoolRecords = useCallback(async () => {
    if (deleteFlaggedSchoolIds.length === 0) {
      setBatchDeleteSchoolRecordsError("There are no delete-flagged schools to remove.");
      return;
    }

    setBatchDeleteSchoolRecordsError("");
    setIsBatchDeleteSchoolRecordsLoading(true);

    try {
      const result = await removeSchoolHeadAccountsBatch(deleteFlaggedSchoolIds, {
        reason: "Batch remove delete-flagged school records and linked School Head accounts.",
      });

      if (result.deletedCount > 0) {
        pushToast(
          `${result.deletedCount} flagged school${result.deletedCount === 1 ? "" : "s"} permanently deleted.`,
          "success",
        );
      }

      if (result.blocked.length > 0) {
        pushToast(
          `${result.blocked.length} school${result.blocked.length === 1 ? " was" : "s were"} blocked from batch delete.`,
          "warning",
        );
      }

      if (result.missingSchoolIds.length > 0) {
        pushToast(
          `${result.missingSchoolIds.length} school${result.missingSchoolIds.length === 1 ? " was" : "s were"} already missing.`,
          "warning",
        );
      }

      if (result.deletedCount === 0 && result.blocked.length === 0 && result.missingSchoolIds.length === 0) {
        pushToast("No flagged schools were deleted.", "info");
      }

      closePendingBatchDeleteSchoolRecords();
    } catch (err) {
      setBatchDeleteSchoolRecordsError(
        err instanceof Error ? err.message : "Unable to batch delete flagged schools.",
      );
    } finally {
      setIsBatchDeleteSchoolRecordsLoading(false);
    }
  }, [
    closePendingBatchDeleteSchoolRecords,
    deleteFlaggedSchoolIds,
    pushToast,
    removeSchoolHeadAccountsBatch,
  ]);

  const filteredSchoolHeadAccountRows = useMemo(() => {
    const query = schoolHeadAccountsQuery.trim().toLowerCase();
    const statusFilter = schoolHeadAccountsStatusFilter;

    const rows = compactSchoolRows.filter(({ summary, record }) => {
      const resolvedRecord = record ?? recordBySchoolKey.get(summary.schoolKey) ?? null;
      const account = resolvedRecord?.schoolHeadAccount ?? null;
      const normalizedAccountStatus = String(account?.accountStatus ?? "").toLowerCase();
      const lifecycleState = String(account?.lifecycleState ?? "").toLowerCase();
      const hasNoAccount = !account;
      const isPendingSetup = normalizedAccountStatus === "pending_setup";

      if (statusFilter !== "all") {
        if (statusFilter === "no_account") {
          if (!hasNoAccount) return false;
        } else if (statusFilter === "pending_setup") {
          if (!isPendingSetup) return false;
        } else if (statusFilter === "password_reset_required" || statusFilter === "temporary_password_expired") {
          if (lifecycleState !== statusFilter) return false;
        } else if (normalizedAccountStatus !== statusFilter) {
          return false;
        }
      }

      if (schoolHeadAccountsOnlyFlagged && !(account?.flagged ?? false)) {
        return false;
      }

      if (schoolHeadAccountsOnlyDeleteFlagged && !(account?.deleteRecordFlagged ?? false)) {
        return false;
      }

      if (query.length === 0) {
        return true;
      }

      const haystack = [summary.schoolCode, summary.schoolName, account?.name ?? "", account?.email ?? ""]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });

    const priorityFor = ({ summary, record }: MonitorSchoolRecordsListRow) => {
      const resolvedRecord = record ?? recordBySchoolKey.get(summary.schoolKey) ?? null;
      const account = resolvedRecord?.schoolHeadAccount ?? null;
      const normalizedAccountStatus = String(account?.accountStatus ?? "").toLowerCase();
      const lifecycleState = String(account?.lifecycleState ?? "").toLowerCase();

      if (account?.deleteRecordFlagged) return 0;
      if (!account) return 1;
      if (lifecycleState === "pending_setup") return 2;
      if (lifecycleState === "pending_verification") return 3;
      if (account.flagged) return 4;
      if (lifecycleState === "temporary_password_expired") return 5;
      if (lifecycleState === "password_reset_required") return 6;
      if (lifecycleState === "temporary_password_active") return 7;
      if (normalizedAccountStatus === "active") return 8;
      if (normalizedAccountStatus === "locked") return 9;
      if (normalizedAccountStatus === "suspended") return 10;
      if (normalizedAccountStatus === "archived") return 11;
      return 99;
    };

    rows.sort((a, b) => {
      const priorityDiff = priorityFor(a) - priorityFor(b);
      if (priorityDiff !== 0) return priorityDiff;
      return a.summary.schoolName.localeCompare(b.summary.schoolName);
    });

    return rows;
  }, [
    compactSchoolRows,
    recordBySchoolKey,
    schoolHeadAccountsOnlyDeleteFlagged,
    schoolHeadAccountsOnlyFlagged,
    schoolHeadAccountsQuery,
    schoolHeadAccountsStatusFilter,
  ]);

  const schoolHeadAccountRows = useMemo<MonitorSchoolHeadAccountRow[]>(
    () =>
      filteredSchoolHeadAccountRows.map(({ summary, record }) => ({
        schoolKey: summary.schoolKey,
        schoolCode: summary.schoolCode,
        schoolName: summary.schoolName,
        record: record ?? recordBySchoolKey.get(summary.schoolKey) ?? null,
      })),
    [filteredSchoolHeadAccountRows, recordBySchoolKey],
  );

  return {
    showSchoolHeadAccountsPanel,
    toggleSchoolHeadAccountsPanel,
    schoolHeadAccountsPanelProps: showSchoolHeadAccountsPanel
      ? {
          isOpen: showSchoolHeadAccountsPanel,
          isSaving,
          isMobileViewport,
          rows: schoolHeadAccountRows,
          totalCount: compactSchoolRows.length,
          query: schoolHeadAccountsQuery,
          statusFilter: schoolHeadAccountsStatusFilter,
          onlyFlagged: schoolHeadAccountsOnlyFlagged,
          onlyDeleteFlagged: schoolHeadAccountsOnlyDeleteFlagged,
          onQueryChange: setSchoolHeadAccountsQuery,
          onStatusFilterChange: setSchoolHeadAccountsStatusFilter,
          onOnlyFlaggedChange: setSchoolHeadAccountsOnlyFlagged,
          onOnlyDeleteFlaggedChange: setSchoolHeadAccountsOnlyDeleteFlagged,
          onClearFilters: () => {
            setSchoolHeadAccountsQuery("");
            setSchoolHeadAccountsStatusFilter("all");
            setSchoolHeadAccountsOnlyFlagged(false);
            setSchoolHeadAccountsOnlyDeleteFlagged(false);
          },
          onClose: closeSchoolHeadAccountsPanel,
          onOpenSchoolRecord,
          pendingDeleteSchoolRecord,
          pendingDeleteSchoolRecordPreview,
          pendingDeleteSchoolRecordError,
          isDeleteSchoolRecordLoading,
          onPreviewDeleteSchoolRecord: openPendingDeleteSchoolRecord,
          onClosePendingDeleteSchoolRecord: closePendingDeleteSchoolRecord,
          onConfirmDeleteSchoolRecord: confirmDeleteSchoolRecord,
          deleteFlaggedSchoolCount: deleteFlaggedSchoolIds.length,
          isBatchDeleteSchoolRecordsPending,
          isBatchDeleteSchoolRecordsLoading,
          batchDeleteSchoolRecordsError,
          onOpenPendingBatchDeleteSchoolRecords: openPendingBatchDeleteSchoolRecords,
          onClosePendingBatchDeleteSchoolRecords: closePendingBatchDeleteSchoolRecords,
          onConfirmBatchDeleteSchoolRecords: confirmBatchDeleteSchoolRecords,
          formatDateTime: (value: string | null) => (value ? formatDateTime(value) : "-"),
          actions: schoolHeadAccountActions,
        }
      : null,
  };
}
