import { useCallback, useMemo, useState } from "react";
import type {
  MonitorSchoolHeadAccountRow,
  MonitorSchoolHeadAccountsPanelProps,
  SchoolHeadAccountsStatusFilter,
} from "@/pages/monitor/MonitorSchoolHeadAccountsPanel";
import type { MonitorSchoolRecordsListRow } from "@/pages/monitor/MonitorSchoolRecordsList";
import { useSchoolHeadAccountActions } from "@/pages/monitor/useSchoolHeadAccountActions";
import { ACCOUNT_STATUS } from "@/types";
import type {
  SchoolHeadAccountActionVerificationTarget,
  SchoolHeadAccountRestoreResult,
  SchoolHeadAccountActivationResult,
  SchoolHeadAccountActionVerificationCodeResult,
  SchoolHeadAccountPayload,
  SchoolHeadAccountProfileUpsertResult,
  SchoolHeadAccountRemovalResult,
  SchoolHeadAccountStatusUpdatePayload,
  SchoolHeadAccountStatusUpdateResult,
  SchoolHeadPasswordResetLinkResult,
  SchoolHeadSetupLinkResult,
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
    targetStatus: SchoolHeadAccountActionVerificationTarget,
  ) => Promise<SchoolHeadAccountActionVerificationCodeResult>;
  issueSchoolHeadSetupLink: (schoolId: string, reason?: string | null) => Promise<SchoolHeadSetupLinkResult>;
  recoverSchoolHeadSetupLink: (
    schoolId: string,
    payload: { reason: string; verificationChallengeId: string; verificationCode: string },
  ) => Promise<SchoolHeadAccountRestoreResult>;
  issueSchoolHeadPasswordResetLink: (
    schoolId: string,
    payload: { reason: string; verificationChallengeId: string; verificationCode: string },
  ) => Promise<SchoolHeadPasswordResetLinkResult>;
  upsertSchoolHeadAccountProfile: (
    schoolId: string,
    payload: SchoolHeadAccountPayload,
  ) => Promise<SchoolHeadAccountProfileUpsertResult>;
  removeSchoolHeadAccount: (
    schoolId: string,
    payload: { reason: string; verificationChallengeId: string; verificationCode: string },
  ) => Promise<SchoolHeadAccountRemovalResult>;
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
  recoverSchoolHeadSetupLink,
  issueSchoolHeadPasswordResetLink,
  upsertSchoolHeadAccountProfile,
  removeSchoolHeadAccount,
  onOpenSchoolRecord,
  formatDateTime,
}: UseMonitorSchoolHeadAccountsPanelStateOptions): UseMonitorSchoolHeadAccountsPanelStateResult {
  const [showSchoolHeadAccountsPanel, setShowSchoolHeadAccountsPanel] = useState(false);
  const [schoolHeadAccountsQuery, setSchoolHeadAccountsQuery] = useState("");
  const [schoolHeadAccountsStatusFilter, setSchoolHeadAccountsStatusFilter] =
    useState<SchoolHeadAccountsStatusFilter>("all");
  const [schoolHeadAccountsOnlyFlagged, setSchoolHeadAccountsOnlyFlagged] = useState(false);
  const [schoolHeadAccountsOnlyDeleteFlagged, setSchoolHeadAccountsOnlyDeleteFlagged] = useState(false);

  const recordById = useMemo(() => {
    const map = new Map<string, SchoolRecord>();

    for (const record of recordBySchoolKey.values()) {
      map.set(record.id, record);
    }

    return map;
  }, [recordBySchoolKey]);

  const schoolHeadAccountActions = useSchoolHeadAccountActions({
    isPanelOpen: showSchoolHeadAccountsPanel,
    isSaving,
    pushToast,
    findRecordById: (schoolId) => recordById.get(schoolId) ?? null,
    updateSchoolHeadAccountStatus,
    activateSchoolHeadAccount,
    issueSchoolHeadAccountActionVerificationCode,
    issueSchoolHeadSetupLink,
    recoverSchoolHeadSetupLink,
    issueSchoolHeadPasswordResetLink,
    upsertSchoolHeadAccountProfile,
    removeSchoolHeadAccount,
  });

  const closeSchoolHeadAccountsPanel = useCallback(() => {
    setShowSchoolHeadAccountsPanel(false);
    schoolHeadAccountActions.resetPanelState();
  }, [schoolHeadAccountActions]);

  const toggleSchoolHeadAccountsPanel = useCallback(() => {
    setShowSchoolHeadAccountsPanel((current) => {
      const next = !current;
      if (!next) {
        schoolHeadAccountActions.resetPanelState();
      }
      return next;
    });
  }, [schoolHeadAccountActions]);

  const filteredSchoolHeadAccountRows = useMemo(() => {
    const query = schoolHeadAccountsQuery.trim().toLowerCase();
    const statusFilter = schoolHeadAccountsStatusFilter;

    const rows = compactSchoolRows.filter(({ summary, record }) => {
      const resolvedRecord = record ?? recordBySchoolKey.get(summary.schoolKey) ?? null;
      const account = resolvedRecord?.schoolHeadAccount ?? null;
      const normalizedAccountStatus = String(account?.accountStatus ?? "").toLowerCase();
      const needsSetup = account ? normalizedAccountStatus === ACCOUNT_STATUS.pendingSetup : true;

      if (statusFilter !== "all") {
        if (statusFilter === "needs_setup") {
          if (!needsSetup) return false;
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

      if (account?.deleteRecordFlagged) return 0;
      if (!account) return 1;
      if (normalizedAccountStatus === ACCOUNT_STATUS.pendingSetup) return 2;
      if (normalizedAccountStatus === ACCOUNT_STATUS.pendingVerification) return 3;
      if (account.flagged) return 4;
      if (normalizedAccountStatus === ACCOUNT_STATUS.active) return 5;
      if (normalizedAccountStatus === ACCOUNT_STATUS.suspended) return 6;
      if (normalizedAccountStatus === ACCOUNT_STATUS.locked) return 7;
      if (normalizedAccountStatus === ACCOUNT_STATUS.archived) return 8;
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
          formatDateTime: (value: string | null) => (value ? formatDateTime(value) : "-"),
          actions: schoolHeadAccountActions,
        }
      : null,
  };
}
