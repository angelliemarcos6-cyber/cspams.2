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
import { isApiError } from "@/lib/api";
import type { MonitorArchivedSchoolsProps } from "@/pages/monitor/MonitorArchivedSchools";
import type {
  MonitorSchoolHeadAccountRow,
  MonitorSchoolHeadAccountsPanelProps,
  SchoolHeadAccountsStatusFilter,
} from "@/pages/monitor/MonitorSchoolHeadAccountsPanel";
import type { MonitorSchoolMessagesProps } from "@/pages/monitor/MonitorSchoolMessages";
import type {
  MonitorSchoolRecordFormField,
  MonitorSchoolRecordFormProps,
  MonitorSchoolRecordFormState,
} from "@/pages/monitor/MonitorSchoolRecordForm";
import type {
  MonitorSchoolRecordsListProps,
  MonitorSchoolRecordsListRow,
  MonitorSchoolRequirementSummary,
} from "@/pages/monitor/MonitorSchoolRecordsList";
import { useSchoolHeadAccountActions } from "@/pages/monitor/useSchoolHeadAccountActions";
import type {
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
  SchoolRecord,
  SchoolRecordPayload,
  SchoolStatus,
} from "@/types";
import type { RequirementFilter, SchoolQuickPreset } from "./monitorFilters";

type ToastTone = "success" | "info" | "warning";

const EMPTY_MONITOR_RECORD_FORM: MonitorSchoolRecordFormState = {
  schoolId: "",
  schoolName: "",
  level: "Elementary",
  type: "public",
  district: "",
  region: "",
  address: "",
  createSchoolHeadAccount: true,
  schoolHeadAccountName: "",
  schoolHeadAccountEmail: "",
};

function extractApiValidationErrors(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object" || !("errors" in payload)) {
    return {};
  }

  const rawErrors = (payload as { errors?: unknown }).errors;
  if (!rawErrors || typeof rawErrors !== "object") {
    return {};
  }

  const fieldErrors: Record<string, string> = {};
  for (const [field, value] of Object.entries(rawErrors as Record<string, unknown>)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
      fieldErrors[field] = value[0];
      continue;
    }

    if (typeof value === "string") {
      fieldErrors[field] = value;
    }
  }

  return fieldErrors;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function resolveCsvColumnIndex(headers: Map<string, number>, aliases: string[]): number | null {
  for (const alias of aliases) {
    const key = normalizeCsvHeader(alias);
    if (headers.has(key)) {
      return headers.get(key) ?? null;
    }
  }

  return null;
}

function toCsvInteger(value: string): number | null {
  if (value.trim() === "") return 0;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function parseSchoolBulkImportCsv(content: string): { rows: SchoolBulkImportRowPayload[]; errors: string[] } {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: ["CSV must include a header and at least one data row."] };
  }

  const headers = parseCsvLine(lines[0]).map((value) => normalizeCsvHeader(value));
  const headerIndexes = new Map<string, number>();
  headers.forEach((header, index) => {
    headerIndexes.set(header, index);
  });

  const columnIndex = {
    schoolId: resolveCsvColumnIndex(headerIndexes, ["school_id", "school_code", "schoolid", "code"]),
    schoolName: resolveCsvColumnIndex(headerIndexes, ["school_name", "school", "name"]),
    level: resolveCsvColumnIndex(headerIndexes, ["level"]),
    type: resolveCsvColumnIndex(headerIndexes, ["type"]),
    address: resolveCsvColumnIndex(headerIndexes, ["address"]),
    district: resolveCsvColumnIndex(headerIndexes, ["district"]),
    region: resolveCsvColumnIndex(headerIndexes, ["region"]),
    status: resolveCsvColumnIndex(headerIndexes, ["status"]),
    studentCount: resolveCsvColumnIndex(headerIndexes, ["student_count", "students", "studentcount"]),
    teacherCount: resolveCsvColumnIndex(headerIndexes, ["teacher_count", "teachers", "teachercount"]),
  };

  const missingRequiredColumns = [
    { key: "schoolId", label: "school_id" },
    { key: "schoolName", label: "school_name" },
    { key: "level", label: "level" },
    { key: "type", label: "type" },
    { key: "address", label: "address" },
    { key: "studentCount", label: "student_count" },
    { key: "teacherCount", label: "teacher_count" },
  ].filter((entry) => columnIndex[entry.key as keyof typeof columnIndex] === null);

  if (missingRequiredColumns.length > 0) {
    return {
      rows: [],
      errors: [
        `Missing required CSV column(s): ${missingRequiredColumns.map((item) => item.label).join(", ")}.`,
      ],
    };
  }

  const getValue = (values: string[], index: number | null): string => {
    if (index === null || index < 0 || index >= values.length) return "";
    return values[index]?.trim() ?? "";
  };

  const rows: SchoolBulkImportRowPayload[] = [];
  const errors: string[] = [];

  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const values = parseCsvLine(lines[rowIndex]);

    const schoolId = getValue(values, columnIndex.schoolId);
    const schoolName = getValue(values, columnIndex.schoolName);
    const level = getValue(values, columnIndex.level);
    const type = getValue(values, columnIndex.type).toLowerCase();
    const address = getValue(values, columnIndex.address);
    const district = getValue(values, columnIndex.district);
    const region = getValue(values, columnIndex.region);
    const statusRaw = getValue(values, columnIndex.status).toLowerCase();
    const studentCount = toCsvInteger(getValue(values, columnIndex.studentCount));
    const teacherCount = toCsvInteger(getValue(values, columnIndex.teacherCount));

    if (!schoolId && !schoolName && !level && !address) {
      continue;
    }

    if (!/^\d{6}$/.test(schoolId)) {
      errors.push(`Row ${rowIndex + 1}: School Code must be 6 digits.`);
      continue;
    }

    if (!schoolName) {
      errors.push(`Row ${rowIndex + 1}: School name is required.`);
      continue;
    }

    if (!level) {
      errors.push(`Row ${rowIndex + 1}: Level is required.`);
      continue;
    }

    if (type !== "public" && type !== "private") {
      errors.push(`Row ${rowIndex + 1}: Type must be public or private.`);
      continue;
    }

    if (!address) {
      errors.push(`Row ${rowIndex + 1}: Address is required.`);
      continue;
    }

    if (studentCount === null) {
      errors.push(`Row ${rowIndex + 1}: Student count must be a whole number >= 0.`);
      continue;
    }

    if (teacherCount === null) {
      errors.push(`Row ${rowIndex + 1}: Teacher count must be a whole number >= 0.`);
      continue;
    }

    const normalizedStatus = statusRaw ? statusRaw : "active";
    if (!["active", "inactive", "pending"].includes(normalizedStatus)) {
      errors.push(`Row ${rowIndex + 1}: Status must be active, inactive, or pending.`);
      continue;
    }

    rows.push({
      schoolId,
      schoolName,
      level,
      type,
      address,
      district: district || null,
      region: region || null,
      status: normalizedStatus as SchoolStatus,
      studentCount,
      teacherCount,
    });
  }

  return { rows, errors };
}

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
  issueSchoolHeadAccountActionVerificationCode: (
    schoolId: string,
    targetStatus: "suspended" | "locked" | "archived" | "deleted" | "password_reset" | "email_change",
  ) => Promise<SchoolHeadAccountActionVerificationCodeResult>;
  issueSchoolHeadSetupLink: (schoolId: string, reason?: string | null) => Promise<SchoolHeadSetupLinkResult>;
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
  issueSchoolHeadAccountActionVerificationCode,
  issueSchoolHeadSetupLink,
  issueSchoolHeadPasswordResetLink,
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
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordForm, setRecordForm] = useState<MonitorSchoolRecordFormState>(EMPTY_MONITOR_RECORD_FORM);
  const [recordFormErrors, setRecordFormErrors] = useState<Partial<Record<MonitorSchoolRecordFormField, string>>>({});
  const [recordFormError, setRecordFormError] = useState("");
  const [recordFormMessage, setRecordFormMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [showSchoolHeadAccountsPanel, setShowSchoolHeadAccountsPanel] = useState(false);
  const [schoolHeadAccountsQuery, setSchoolHeadAccountsQuery] = useState("");
  const [schoolHeadAccountsStatusFilter, setSchoolHeadAccountsStatusFilter] =
    useState<SchoolHeadAccountsStatusFilter>("all");
  const [schoolHeadAccountsOnlyFlagged, setSchoolHeadAccountsOnlyFlagged] = useState(false);
  const [schoolHeadAccountsOnlyDeleteFlagged, setSchoolHeadAccountsOnlyDeleteFlagged] = useState(false);
  const [archivedRecords, setArchivedRecords] = useState<SchoolRecord[]>([]);
  const [showArchivedRecords, setShowArchivedRecords] = useState(false);
  const [isArchivedRecordsLoading, setIsArchivedRecordsLoading] = useState(false);
  const [bulkImportSummary, setBulkImportSummary] = useState<SchoolBulkImportResult | null>(null);
  const [bulkImportError, setBulkImportError] = useState("");
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [isSchoolActionsMenuOpen, setIsSchoolActionsMenuOpen] = useState(false);
  const bulkImportInputRef = useRef<HTMLInputElement | null>(null);
  const schoolActionsMenuRef = useRef<HTMLDivElement | null>(null);

  const schoolHeadAccountActions = useSchoolHeadAccountActions({
    isPanelOpen: showSchoolHeadAccountsPanel,
    isSaving,
    pushToast,
    updateSchoolHeadAccountStatus,
    issueSchoolHeadAccountActionVerificationCode,
    issueSchoolHeadSetupLink,
    issueSchoolHeadPasswordResetLink,
    upsertSchoolHeadAccountProfile,
    removeSchoolHeadAccount,
  });

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

  const handleCloseSchoolHeadAccountsPanel = useCallback(() => {
    setShowSchoolHeadAccountsPanel(false);
    schoolHeadAccountActions.resetPanelState();
  }, [schoolHeadAccountActions]);

  const resetRecordForm = useCallback(() => {
    setEditingRecordId(null);
    setRecordForm(EMPTY_MONITOR_RECORD_FORM);
    setRecordFormErrors({});
    setRecordFormError("");
    setRecordFormMessage("");
  }, []);

  const openCreateRecordForm = useCallback(() => {
    setIsSchoolActionsMenuOpen(false);
    resetRecordForm();
    setBulkImportError("");
    setBulkImportSummary(null);
    setActiveTopNavigator("schools");
    setShowRecordForm(true);
  }, [resetRecordForm, setActiveTopNavigator]);

  const closeRecordForm = useCallback(() => {
    setShowRecordForm(false);
    resetRecordForm();
  }, [resetRecordForm]);

  const validateRecordForm = useCallback((): boolean => {
    const formErrors: Partial<Record<MonitorSchoolRecordFormField, string>> = {};
    const schoolId = recordForm.schoolId.trim().toUpperCase();
    const schoolName = recordForm.schoolName.trim();
    const level = recordForm.level.trim();
    const district = recordForm.district.trim();
    const region = recordForm.region.trim();
    const address = recordForm.address.trim();

    if (!/^\d{6}$/.test(schoolId)) {
      formErrors.schoolId = "School Code must be exactly 6 digits.";
    }

    if (!schoolName) formErrors.schoolName = "School name is required.";
    if (!level) formErrors.level = "Level is required.";
    if (!address) formErrors.address = "Address is required.";
    if (!recordForm.type) formErrors.type = "Type is required.";

    if (district.length > 255) formErrors.district = "District must be 255 characters or less.";
    if (region.length > 255) formErrors.region = "Region must be 255 characters or less.";

    if (!editingRecordId && recordForm.createSchoolHeadAccount) {
      if (!recordForm.schoolHeadAccountName.trim()) {
        formErrors.schoolHeadAccountName = "Account name is required.";
      }

      if (!recordForm.schoolHeadAccountEmail.trim()) {
        formErrors.schoolHeadAccountEmail = "Email is required.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recordForm.schoolHeadAccountEmail.trim())) {
        formErrors.schoolHeadAccountEmail = "Use a valid email address.";
      }
    }

    setRecordFormErrors(formErrors);
    if (Object.keys(formErrors).length > 0) {
      setRecordFormError("Please fix the highlighted fields.");
      return false;
    }

    setRecordFormError("");
    return true;
  }, [editingRecordId, recordForm]);

  const handleRecordSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setRecordFormErrors({});
      setRecordFormError("");
      setRecordFormMessage("");
      setDeleteError("");
      setBulkImportError("");

      if (!validateRecordForm()) {
        return;
      }

      const payload: SchoolRecordPayload = {
        schoolId: recordForm.schoolId.trim().toUpperCase(),
        schoolName: recordForm.schoolName.trim(),
        level: recordForm.level.trim(),
        type: recordForm.type,
        address: recordForm.address.trim(),
        district: recordForm.district.trim() || undefined,
        region: recordForm.region.trim() || undefined,
        schoolHeadAccount:
          !editingRecordId && recordForm.createSchoolHeadAccount
            ? {
                name: recordForm.schoolHeadAccountName.trim(),
                email: recordForm.schoolHeadAccountEmail.trim(),
              }
            : undefined,
      };

      try {
        if (editingRecordId) {
          await updateRecord(editingRecordId, payload);
          setRecordFormMessage("School record updated.");
        } else {
          const provisioning = await addRecord(payload);
          const deliveryFailed = String(provisioning?.setupLinkDelivery ?? "").toLowerCase() === "failed";
          setRecordFormMessage(
            provisioning
              ? deliveryFailed
                ? "School record created. The setup email could not be delivered to the School Head account."
                : "School record created. A setup email was sent to the School Head account."
              : "School record created.",
          );
        }

        window.setTimeout(() => {
          closeRecordForm();
        }, 800);
      } catch (err) {
        if (isApiError(err)) {
          const apiFieldErrors = extractApiValidationErrors(err.payload);
          if (Object.keys(apiFieldErrors).length > 0) {
            const mappedErrors: Partial<Record<MonitorSchoolRecordFormField, string>> = {};
            for (const [field, message] of Object.entries(apiFieldErrors)) {
              if (field === "schoolHeadAccount.name") mappedErrors.schoolHeadAccountName = message;
              else if (field === "schoolHeadAccount.email") mappedErrors.schoolHeadAccountEmail = message;
              else if (
                field === "schoolId" ||
                field === "schoolName" ||
                field === "level" ||
                field === "type" ||
                field === "district" ||
                field === "region" ||
                field === "address"
              ) {
                mappedErrors[field as MonitorSchoolRecordFormField] = message;
              }
            }

            if (Object.keys(mappedErrors).length > 0) {
              setRecordFormErrors(mappedErrors);
              setRecordFormError("Please fix the highlighted fields.");
              return;
            }
          }
        }

        setRecordFormError(err instanceof Error ? err.message : "Unable to save school record.");
      }
    },
    [addRecord, closeRecordForm, editingRecordId, recordForm, updateRecord, validateRecordForm],
  );

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
    setIsSchoolActionsMenuOpen(false);
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

  const openBulkImportPicker = useCallback(() => {
    setIsSchoolActionsMenuOpen(false);
    bulkImportInputRef.current?.click();
  }, []);

  const handleBulkImportFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      setBulkImportError("");
      setBulkImportSummary(null);
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
    [bulkImportRecords, loadArchivedRecords, pushToast, showArchivedRecords],
  );

  const toggleSchoolHeadAccountsPanel = useCallback(() => {
    setIsSchoolActionsMenuOpen(false);
    setShowSchoolHeadAccountsPanel((current) => {
      const next = !current;
      if (!next) {
        schoolHeadAccountActions.resetPanelState();
      }
      return next;
    });
  }, [schoolHeadAccountActions]);

  const toggleActionsMenu = useCallback(() => {
    setIsSchoolActionsMenuOpen((current) => !current);
  }, []);

  const closeActionsMenu = useCallback(() => {
    setIsSchoolActionsMenuOpen(false);
  }, []);

  const filteredSchoolHeadAccountRows = useMemo(() => {
    const query = schoolHeadAccountsQuery.trim().toLowerCase();
    const statusFilter = schoolHeadAccountsStatusFilter;

    const rows = compactSchoolRows.filter(({ summary, record }) => {
      const resolvedRecord = record ?? recordBySchoolKey.get(summary.schoolKey) ?? null;
      const account = resolvedRecord?.schoolHeadAccount ?? null;
      const normalizedAccountStatus = String(account?.accountStatus ?? "").toLowerCase();
      const needsSetup = account
        ? normalizedAccountStatus === "pending_setup" || !account.emailVerifiedAt
        : true;

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
      if (normalizedAccountStatus === "pending_setup" || !account.emailVerifiedAt) return 2;
      if (account.flagged) return 3;
      if (normalizedAccountStatus === "active") return 4;
      if (normalizedAccountStatus === "suspended") return 5;
      if (normalizedAccountStatus === "locked") return 6;
      if (normalizedAccountStatus === "archived") return 7;
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

  const schoolHeadAccountsPanelProps: MonitorSchoolHeadAccountsPanelProps | null = showSchoolHeadAccountsPanel
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
        onClose: handleCloseSchoolHeadAccountsPanel,
        onOpenSchoolRecord,
        formatDateTime: (value: string | null) => (value ? formatDateTime(value) : "-"),
        actions: schoolHeadAccountActions,
      }
    : null;

  const schoolMessagesProps: MonitorSchoolMessagesProps = {
    deleteError,
    bulkImportError,
    bulkImportSummary,
  };

  const handleRecordFormFieldChange = useCallback((field: MonitorSchoolRecordFormField, value: string) => {
    let normalizedValue = value;

    if (field === "schoolId") {
      normalizedValue = value.replace(/\D+/g, "").slice(0, 6);
    }

    if (field === "type") {
      normalizedValue = value === "private" ? "private" : "public";
    }

    setRecordForm((current) => ({ ...current, [field]: normalizedValue }));
    setRecordFormErrors((current) => ({ ...current, [field]: undefined }));
  }, []);

  const handleCreateSchoolHeadAccountChange = useCallback((checked: boolean) => {
    setRecordForm((current) => ({
      ...current,
      createSchoolHeadAccount: checked,
    }));
  }, []);

  const schoolRecordFormProps: MonitorSchoolRecordFormProps = {
    show: showRecordForm,
    editingRecordId,
    isSaving,
    recordForm,
    recordFormErrors,
    recordFormError,
    recordFormMessage,
    onClose: closeRecordForm,
    onSubmit: handleRecordSubmit,
    onFieldChange: handleRecordFormFieldChange,
    onCreateSchoolHeadAccountChange: handleCreateSchoolHeadAccountChange,
  };

  const schoolRecordsListProps: MonitorSchoolRecordsListProps = {
    showLoadingSkeleton: isLoading && recordsLength === 0,
    compactSchoolRowsCount: compactSchoolRows.length,
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

  const archivedSchoolsProps: MonitorArchivedSchoolsProps = {
    show: showArchivedRecords,
    archivedRecords,
    isLoading: isArchivedRecordsLoading,
    isSaving,
    onRefresh: loadArchivedRecords,
    onRestore: handleRestoreArchivedRecord,
    formatDateTime,
  };

  return {
    bulkImportInputRef,
    schoolActionsMenuRef,
    showSchoolHeadAccountsPanel,
    isSchoolActionsMenuOpen,
    isBulkImporting,
    showArchivedRecords,
    schoolHeadAccountsPanelProps,
    schoolMessagesProps,
    schoolRecordFormProps,
    schoolRecordsListProps,
    archivedSchoolsProps,
    handleBulkImportFileChange,
    openCreateRecordForm,
    toggleSchoolHeadAccountsPanel,
    toggleActionsMenu,
    closeActionsMenu,
    openBulkImportPicker,
    toggleArchivedRecords,
  };
}
