import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { MonitorArchivedSchoolsProps } from "@/pages/monitor/MonitorArchivedSchools";
import type { MonitorSchoolHeadAccountsPanelProps } from "@/pages/monitor/MonitorSchoolHeadAccountsPanel";
import type { MonitorSchoolMessagesProps } from "@/pages/monitor/MonitorSchoolMessages";
import type { MonitorSchoolRecordFormProps } from "@/pages/monitor/MonitorSchoolRecordForm";
import type {
  MonitorSchoolRecordsListProps,
  MonitorSchoolRecordsListRow,
  MonitorSchoolRequirementSummary,
} from "@/pages/monitor/MonitorSchoolRecordsList";
import { useMonitorArchivedSchools } from "@/pages/monitor/useMonitorArchivedSchools";
import { useMonitorSchoolBulkImport } from "@/pages/monitor/useMonitorSchoolBulkImport";
import { useMonitorSchoolHeadAccountsPanelState } from "@/pages/monitor/useMonitorSchoolHeadAccountsPanelState";
import { useMonitorSchoolRecordForm } from "@/pages/monitor/useMonitorSchoolRecordForm";
import type {
  SchoolHeadAccountActivationResult,
  SchoolBulkImportResult,
  SchoolBulkImportRowPayload,
  SchoolHeadAccountActionVerificationCodeResult,
  SchoolHeadAccountPayload,
  SchoolHeadAccountProfileUpsertResult,
  SchoolHeadAccountProvisioningReceipt,
  SchoolHeadAccountRemovalResult,
  SchoolHeadAccountStatusUpdatePayload,
  SchoolHeadAccountStatusUpdateResult,
  SchoolHeadPasswordResetLinkResult,
  SchoolHeadSetupLinkResult,
  SchoolHeadTemporaryPasswordResult,
  SchoolRecord,
  SchoolRecordPayload,
  SchoolStatus,
} from "@/types";
import type { RequirementFilter, SchoolQuickPreset } from "./monitorFilters";

type ToastTone = "success" | "info" | "warning";

interface UseMonitorSchoolsSectionOptions {
  isMobileViewport: boolean;
  isLoading: boolean;
  isSaving: boolean;
  recordsLength: number;
  compactSchoolRows: MonitorSchoolRecordsListRow[];
  paginatedCompactSchoolRows: MonitorSchoolRecordsListRow[];
  recordBySchoolKey: Map<string, SchoolRecord>;
  safeRecordsPage: number;
  totalRecordPages: number;
  statusFilter: SchoolStatus | "all";
  requirementFilter: RequirementFilter;
  schoolQuickPreset: SchoolQuickPreset;
  setStatusFilter: Dispatch<SetStateAction<SchoolStatus | "all">>;
  setRequirementFilter: Dispatch<SetStateAction<RequirementFilter>>;
  setSchoolQuickPreset: Dispatch<SetStateAction<SchoolQuickPreset>>;
  setRecordsPage: Dispatch<SetStateAction<number>>;
  setActiveTopNavigator: Dispatch<SetStateAction<"overview" | "schools" | "reviews">>;
  addRecord: (record: SchoolRecordPayload) => Promise<SchoolHeadAccountProvisioningReceipt | null>;
  updateRecord: (id: string, updates: SchoolRecordPayload) => Promise<void>;
  listArchivedRecords: () => Promise<SchoolRecord[]>;
  restoreRecord: (id: string) => Promise<void>;
  bulkImportRecords: (
    rows: SchoolBulkImportRowPayload[],
    options?: { updateExisting?: boolean; restoreArchived?: boolean },
  ) => Promise<SchoolBulkImportResult>;
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
    payload: { reason: string; verificationChallengeId: string; verificationCode: string },
  ) => Promise<SchoolHeadAccountRemovalResult>;
  onOpenSchoolRecord: (record: SchoolRecord) => void;
  onOpenSchool: (summary: MonitorSchoolRequirementSummary) => void;
  onReviewSchool: (summary: MonitorSchoolRequirementSummary) => void;
  onResetQueueFilters: () => void;
  onClearAllFilters: () => void;
  pushToast: (message: string, tone: ToastTone) => void;
  formatDateTime: (value: string) => string;
  statusTone: (status: SchoolStatus) => string;
  statusLabel: (status: SchoolStatus) => string;
  isUrgentRequirement: (summary: MonitorSchoolRequirementSummary) => boolean;
  urgencyRowTone: (summary: MonitorSchoolRequirementSummary) => string;
}

export interface UseMonitorSchoolsSectionResult {
  bulkImportInputRef: MutableRefObject<HTMLInputElement | null>;
  schoolActionsMenuRef: MutableRefObject<HTMLDivElement | null>;
  showSchoolHeadAccountsPanel: boolean;
  isSchoolActionsMenuOpen: boolean;
  isBulkImporting: boolean;
  showArchivedRecords: boolean;
  schoolHeadAccountsPanelProps: MonitorSchoolHeadAccountsPanelProps | null;
  schoolMessagesProps: MonitorSchoolMessagesProps;
  schoolRecordFormProps: MonitorSchoolRecordFormProps;
  schoolRecordsListProps: MonitorSchoolRecordsListProps;
  archivedSchoolsProps: MonitorArchivedSchoolsProps;
  handleBulkImportFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  openCreateRecordForm: () => void;
  toggleSchoolHeadAccountsPanel: () => void;
  toggleActionsMenu: () => void;
  closeActionsMenu: () => void;
  openBulkImportPicker: () => void;
  toggleArchivedRecords: () => Promise<void>;
}

export function useMonitorSchoolsSection({
  isMobileViewport,
  isLoading,
  isSaving,
  recordsLength,
  compactSchoolRows,
  paginatedCompactSchoolRows,
  recordBySchoolKey,
  safeRecordsPage,
  totalRecordPages,
  statusFilter,
  requirementFilter,
  schoolQuickPreset,
  setStatusFilter,
  setRequirementFilter,
  setSchoolQuickPreset,
  setRecordsPage,
  setActiveTopNavigator,
  addRecord,
  updateRecord,
  listArchivedRecords,
  restoreRecord,
  bulkImportRecords,
  updateSchoolHeadAccountStatus,
  activateSchoolHeadAccount,
  issueSchoolHeadAccountActionVerificationCode,
  issueSchoolHeadSetupLink,
  issueSchoolHeadPasswordResetLink,
  issueSchoolHeadTemporaryPassword,
  upsertSchoolHeadAccountProfile,
  removeSchoolHeadAccount,
  onOpenSchoolRecord,
  onOpenSchool,
  onReviewSchool,
  onResetQueueFilters,
  onClearAllFilters,
  pushToast,
  formatDateTime,
  statusTone,
  statusLabel,
  isUrgentRequirement,
  urgencyRowTone,
}: UseMonitorSchoolsSectionOptions): UseMonitorSchoolsSectionResult {
  const [isSchoolActionsMenuOpen, setIsSchoolActionsMenuOpen] = useState(false);
  const schoolActionsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSchoolActionsMenuOpen || typeof window === "undefined") return;

    const onPointerDown = (event: MouseEvent) => {
      const menu = schoolActionsMenuRef.current;
      if (!menu) return;
      if (menu.contains(event.target as Node)) return;
      setIsSchoolActionsMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSchoolActionsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSchoolActionsMenuOpen]);

  const archivedApi = useMonitorArchivedSchools({
    isSaving,
    listArchivedRecords,
    restoreRecord,
    pushToast,
    formatDateTime,
  });

  const bulkImportApi = useMonitorSchoolBulkImport({
    bulkImportRecords,
    showArchivedRecords: archivedApi.showArchivedRecords,
    loadArchivedRecords: archivedApi.loadArchivedRecords,
    pushToast,
  });

  const recordFormApi = useMonitorSchoolRecordForm({
    isSaving,
    setActiveTopNavigator,
    addRecord,
    updateRecord,
    clearDeleteError: archivedApi.clearDeleteError,
    clearBulkImportError: bulkImportApi.clearBulkImportError,
    clearBulkImportFeedback: bulkImportApi.clearBulkImportFeedback,
  });

  const schoolHeadAccountsApi = useMonitorSchoolHeadAccountsPanelState({
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
    onOpenSchoolRecord,
    formatDateTime,
  });

  const toggleActionsMenu = useCallback(() => {
    setIsSchoolActionsMenuOpen((current) => !current);
  }, []);

  const closeActionsMenu = useCallback(() => {
    setIsSchoolActionsMenuOpen(false);
  }, []);

  const openCreateRecordForm = useCallback(() => {
    closeActionsMenu();
    recordFormApi.openCreateRecordForm();
  }, [closeActionsMenu, recordFormApi]);

  const toggleSchoolHeadAccountsPanel = useCallback(() => {
    closeActionsMenu();
    schoolHeadAccountsApi.toggleSchoolHeadAccountsPanel();
  }, [closeActionsMenu, schoolHeadAccountsApi]);

  const openBulkImportPicker = useCallback(() => {
    closeActionsMenu();
    bulkImportApi.openBulkImportPicker();
  }, [bulkImportApi, closeActionsMenu]);

  const toggleArchivedRecords = useCallback(async () => {
    closeActionsMenu();
    await archivedApi.toggleArchivedRecords();
  }, [archivedApi, closeActionsMenu]);

  const schoolMessagesProps = useMemo<MonitorSchoolMessagesProps>(
    () => ({
      ...bulkImportApi.schoolMessagesProps,
      deleteError: archivedApi.deleteError,
    }),
    [archivedApi.deleteError, bulkImportApi.schoolMessagesProps],
  );

  const schoolRecordsListProps: MonitorSchoolRecordsListProps = {
    showLoadingSkeleton: isLoading && recordsLength === 0,
    compactSchoolRowsCount: compactSchoolRows.length,
    suppressEmptyState: recordFormApi.showRecordForm && recordFormApi.editingRecordId === null,
    paginatedRows: paginatedCompactSchoolRows,
    statusFilter,
    requirementFilter,
    schoolQuickPreset,
    safeRecordsPage,
    totalRecordPages,
    canGoPrevious: safeRecordsPage > 1,
    canGoNext: safeRecordsPage < totalRecordPages,
    onResetQueueFilters,
    onClearAllFilters,
    onToggleStatusFilter: (rowStatus) => setStatusFilter((current) => (current === rowStatus ? "all" : rowStatus)),
    onToggleRequirementFilter: (filter) =>
      setRequirementFilter((current) => (current === filter ? "all" : filter)),
    onToggleSchoolQuickPreset: (preset) =>
      setSchoolQuickPreset((current) => (current === preset ? "all" : preset)),
    onOpenSchool,
    onReviewSchool,
    onPreviousPage: () => setRecordsPage((current) => Math.max(1, current - 1)),
    onNextPage: () => setRecordsPage((current) => Math.min(totalRecordPages, current + 1)),
    formatDateTime,
    statusTone,
    statusLabel,
    isUrgentRequirement,
    urgencyRowTone,
  };

  return {
    bulkImportInputRef: bulkImportApi.bulkImportInputRef,
    schoolActionsMenuRef,
    showSchoolHeadAccountsPanel: schoolHeadAccountsApi.showSchoolHeadAccountsPanel,
    isSchoolActionsMenuOpen,
    isBulkImporting: bulkImportApi.isBulkImporting,
    showArchivedRecords: archivedApi.showArchivedRecords,
    schoolHeadAccountsPanelProps: schoolHeadAccountsApi.schoolHeadAccountsPanelProps,
    schoolMessagesProps,
    schoolRecordFormProps: recordFormApi.schoolRecordFormProps,
    schoolRecordsListProps,
    archivedSchoolsProps: archivedApi.archivedSchoolsProps,
    handleBulkImportFileChange: bulkImportApi.handleBulkImportFileChange,
    openCreateRecordForm,
    toggleSchoolHeadAccountsPanel,
    toggleActionsMenu,
    closeActionsMenu,
    openBulkImportPicker,
    toggleArchivedRecords,
  };
}
