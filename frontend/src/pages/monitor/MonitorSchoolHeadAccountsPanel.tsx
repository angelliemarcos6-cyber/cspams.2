import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Database,
  Edit2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { SchoolRecord, SchoolRecordDeletePreview } from "@/types";
import type { SchoolHeadAccountActionsApi } from "./useSchoolHeadAccountActions";

export type SchoolHeadAccountsStatusFilter =
  "all" | "no_account" | "pending_setup" | "pending_verification" | "password_reset_required" | "temporary_password_expired" | "active" | "suspended" | "locked" | "archived";

export interface MonitorSchoolHeadAccountRow {
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
  record: SchoolRecord | null;
}

export interface MonitorSchoolHeadAccountsPanelProps {
  isOpen: boolean;
  isSaving: boolean;
  isMobileViewport: boolean;
  rows: MonitorSchoolHeadAccountRow[];
  totalCount: number;
  query: string;
  statusFilter: SchoolHeadAccountsStatusFilter;
  onlyFlagged: boolean;
  onlyDeleteFlagged: boolean;
  onQueryChange: (value: string) => void;
  onStatusFilterChange: (value: SchoolHeadAccountsStatusFilter) => void;
  onOnlyFlaggedChange: (value: boolean) => void;
  onOnlyDeleteFlaggedChange: (value: boolean) => void;
  onClearFilters: () => void;
  onClose: () => void;
  onOpenSchoolRecord: (record: SchoolRecord) => void;
  pendingDeleteSchoolRecord: SchoolRecord | null;
  pendingDeleteSchoolRecordPreview: SchoolRecordDeletePreview | null;
  pendingDeleteSchoolRecordError: string;
  isDeleteSchoolRecordLoading: boolean;
  onPreviewDeleteSchoolRecord: (record: SchoolRecord) => void | Promise<void>;
  onClosePendingDeleteSchoolRecord: () => void;
  onConfirmDeleteSchoolRecord: () => void | Promise<void>;
  deleteFlaggedSchoolCount?: number;
  isBatchDeleteSchoolRecordsPending?: boolean;
  isBatchDeleteSchoolRecordsLoading?: boolean;
  batchDeleteSchoolRecordsError?: string;
  onOpenPendingBatchDeleteSchoolRecords?: () => void;
  onClosePendingBatchDeleteSchoolRecords?: () => void;
  onConfirmBatchDeleteSchoolRecords?: () => void | Promise<void>;
  formatDateTime: (value: string | null) => string;
  actions: SchoolHeadAccountActionsApi;
}

function accountStatusLabel(
  status: string | null | undefined,
  lifecycleStateLabel: string | null | undefined,
  lifecycleState: string | null | undefined,
): string {
  if (String(lifecycleState ?? "").toLowerCase() === "temporary_password_active") {
    return "Temp Password Active";
  }

  const normalizedLifecycleLabel = lifecycleStateLabel?.trim();
  if (normalizedLifecycleLabel) return normalizedLifecycleLabel;
  if (!status) return "No Account";
  const normalized = status.toLowerCase();
  if (normalized === "active") return "Active";
  if (normalized === "pending_setup") return "Pending Setup";
  if (normalized === "pending_verification") return "Pending Verification";
  if (normalized === "suspended") return "Suspended";
  if (normalized === "locked") return "Locked";
  if (normalized === "archived") return "Archived";
  return status;
}

function accountStatusTone(status: string | null | undefined, lifecycleState: string | null | undefined): string {
  const normalizedLifecycleState = (lifecycleState ?? "").toLowerCase();
  if (normalizedLifecycleState === "password_reset_required") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  if (normalizedLifecycleState === "temporary_password_expired") return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  if (normalizedLifecycleState === "temporary_password_active") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "active") return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (normalized === "pending_setup") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  if (normalized === "pending_verification") return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
  if (normalized === "suspended" || normalized === "locked") return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  if (normalized === "archived") return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function temporaryPasswordState(account: SchoolRecord["schoolHeadAccount"]): {
  label: string;
  tone: string;
  title?: string;
  revealAsPassword?: boolean;
} {
  if (!account) {
    return {
      label: "-",
      tone: "text-slate-400",
    };
  }

  if (account.temporaryPasswordDisplay) {
    return {
      label: account.temporaryPasswordDisplay,
      tone: "border-primary-200 bg-primary-50 text-primary-800",
      title: "Current temporary password visible to Division Monitors until the School Head changes it.",
      revealAsPassword: true,
    };
  }

  if (account.lifecycleState === "temporary_password_active") {
    return {
      label: "Available",
      tone: "border-primary-200 bg-primary-50 text-primary-700",
      title: account.temporaryPasswordExpiresAt
        ? `Temporary password expires ${account.temporaryPasswordExpiresAt}`
        : "Temporary password is available until first password change.",
    };
  }

  if (account.lifecycleState === "temporary_password_expired") {
    return {
      label: "Expired",
      tone: "border-rose-200 bg-rose-50 text-rose-700",
      title: "Temporary password has expired.",
    };
  }

  if (account.lifecycleState === "pending_setup" || account.lifecycleState === "pending_verification") {
    return {
      label: "Setup link",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
      title: "This account is still on setup-link onboarding. Temporary passwords are not used for this lifecycle.",
    };
  }

  return {
    label: "-",
    tone: "text-slate-400",
  };
}

function shouldShowQuickSetupLink(status: string | null | undefined): boolean {
  return String(status ?? "").toLowerCase() === "pending_setup";
}

function shouldShowArchiveAction(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").toLowerCase();
  return normalized === "active" || normalized === "suspended" || normalized === "locked";
}

function shouldShowResetLinkAction(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").toLowerCase();
  return normalized === "active" || normalized === "locked";
}

function shouldOpenAccountMenuUpward(rowIndex: number, rowCount: number): boolean {
  return rowCount > 3 && rowIndex >= rowCount - 3;
}

export function MonitorSchoolHeadAccountsPanel({
  isOpen,
  isSaving,
  isMobileViewport,
  rows,
  totalCount,
  query,
  statusFilter,
  onlyFlagged,
  onlyDeleteFlagged,
  onQueryChange,
  onStatusFilterChange,
  onOnlyFlaggedChange,
  onOnlyDeleteFlaggedChange,
  onClearFilters,
  onClose,
  onOpenSchoolRecord,
  pendingDeleteSchoolRecord,
  pendingDeleteSchoolRecordPreview,
  pendingDeleteSchoolRecordError,
  isDeleteSchoolRecordLoading,
  onPreviewDeleteSchoolRecord,
  onClosePendingDeleteSchoolRecord,
  onConfirmDeleteSchoolRecord,
  deleteFlaggedSchoolCount = 0,
  isBatchDeleteSchoolRecordsPending = false,
  isBatchDeleteSchoolRecordsLoading = false,
  batchDeleteSchoolRecordsError = "",
  onOpenPendingBatchDeleteSchoolRecords = () => {},
  onClosePendingBatchDeleteSchoolRecords = () => {},
  onConfirmBatchDeleteSchoolRecords = () => {},
  formatDateTime,
  actions,
}: MonitorSchoolHeadAccountsPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <section className="mx-5 mt-4 overflow-visible rounded-sm border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">School Head Accounts</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 self-start rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <X className="h-3.5 w-3.5" />
            Close
          </button>
        </div>

        {actions.schoolHeadAccountDraftError && (
          <div className="border-b border-primary-100 bg-primary-50/70 px-4 py-2 text-xs font-semibold text-primary-800">
            {actions.schoolHeadAccountDraftError}
          </div>
        )}

        {actions.temporaryPasswordReceipt && (
          <div className="border-b border-primary-100 bg-primary-50/70 px-4 py-3 text-xs font-semibold text-primary-800">
            <p>{actions.temporaryPasswordReceipt.message}</p>
            <div className="mt-2 space-y-1">
              <p>School: {actions.temporaryPasswordReceipt.schoolName}</p>
              <p>Email: {actions.temporaryPasswordReceipt.email}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span>Temporary password: {actions.temporaryPasswordReceipt.temporaryPassword}</span>
                <button
                  type="button"
                  onClick={() => void actions.copyTemporaryPasswordReceipt()}
                  className="inline-flex items-center rounded-sm border border-primary-200 bg-white px-2 py-1 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-50"
                >
                  Copy password
                </button>
                <button
                  type="button"
                  onClick={actions.clearTemporaryPasswordReceipt}
                  className="inline-flex items-center rounded-sm border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Dismiss
                </button>
              </div>
              <p>Copy this password now. It will remain visible in the monitor panel until the School Head changes it on next login.</p>
            </div>
          </div>
        )}

        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="Search school, code, name, or email..."
                  className="w-full rounded-sm border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              Showing <span className="text-slate-700">{rows.length}</span> of{" "}
              <span className="text-slate-700">{totalCount}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-visible">
          <table className="min-w-full table-fixed">
            <thead>
              <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="w-24 border-r border-slate-100 px-3 py-1.5 text-left">Code</th>
                <th className="w-[14rem] border-r border-slate-100 px-3 py-1.5 text-left">School</th>
                <th className="w-[15rem] border-r border-slate-100 px-3 py-1.5 text-left">Contact</th>
                <th className="w-40 border-r border-slate-100 px-3 py-1.5 text-left">Status</th>
                <th className="w-40 border-r border-slate-100 px-3 py-1.5 text-left">Activity</th>
                <th className="w-24 border-r border-slate-100 px-3 py-1.5 text-left">Temp Pass</th>
                <th className="w-32 px-3 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={7}>
                    No School Head accounts match the current filters.
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIndex) => {
                  const resolvedRecord = row.record;
                  if (!resolvedRecord) {
                    return (
                      <tr key={`account-missing-${row.schoolKey}`}>
                        <td className="border-r border-slate-100 px-3 py-1.5 align-top text-xs font-semibold text-slate-700">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-semibold tabular-nums text-slate-700 ring-1 ring-slate-200">
                            {row.schoolCode}
                          </span>
                        </td>
                        <td className="border-r border-slate-100 px-3 py-1.5 align-top text-xs text-slate-900">
                          <span className="block w-full whitespace-normal break-words text-left font-semibold leading-5 text-slate-900" title={row.schoolName}>
                            {row.schoolName}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 align-top text-xs text-slate-500" colSpan={5}>
                          Record missing from sync.
                        </td>
                      </tr>
                    );
                  }

                  const account = resolvedRecord.schoolHeadAccount ?? null;
                  const isEditing = actions.editingSchoolHeadAccountSchoolId === resolvedRecord.id;
                  const isRowSaving = Boolean(actions.accountActionKey?.startsWith(`${resolvedRecord.id}:`));
                  const normalizedAccountStatus = String(account?.accountStatus ?? "").toLowerCase();
                  const verificationLabel = normalizedAccountStatus === "pending_setup"
                    ? ""
                    : normalizedAccountStatus === "pending_verification"
                      ? "Awaiting monitor approval"
                      : "";
                  const tempPassword = temporaryPasswordState(account);
                  const openMenuUpward = shouldOpenAccountMenuUpward(rowIndex, rows.length);

                  return (
                    <tr
                      key={`account-${resolvedRecord.id}`}
                      className={`transition ${isEditing ? "bg-primary-50/30" : "hover:bg-slate-50"}`}
                    >
                      <td className="border-r border-slate-100 px-3 py-1.5 align-top text-xs font-semibold text-slate-700">
                        <button
                          type="button"
                          onClick={() => onOpenSchoolRecord(resolvedRecord)}
                          className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-semibold tabular-nums text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200"
                          title={`Open ${row.schoolName}`}
                        >
                          {row.schoolCode}
                        </button>
                      </td>
                      <td className="border-r border-slate-100 px-3 py-1.5 align-top text-xs text-slate-900">
                        <button
                          type="button"
                          onClick={() => onOpenSchoolRecord(resolvedRecord)}
                          className="block w-full whitespace-normal break-words text-left font-semibold leading-5 text-slate-900 transition hover:text-primary-700 hover:underline"
                          title={`Open ${row.schoolName}`}
                        >
                          {row.schoolName}
                        </button>
                      </td>
                      <td className="border-r border-slate-100 px-3 py-1.5 align-top text-xs text-slate-700">
                        {isEditing ? (
                          <div className="grid gap-1">
                            <input
                              type="text"
                              value={actions.schoolHeadAccountDraft.name}
                              onChange={(event) => actions.updateDraftField("name", event.target.value)}
                              className="w-full min-w-[16rem] rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                              placeholder="Full name"
                            />
                            <input
                              type="email"
                              value={actions.schoolHeadAccountDraft.email}
                              onChange={(event) => actions.updateDraftField("email", event.target.value)}
                              className="w-full min-w-[16rem] rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                              placeholder="email@example.com"
                            />
                          </div>
                        ) : account ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="block whitespace-normal break-words font-semibold leading-5 text-slate-900" title={account.name}>
                              {account.name}
                            </span>
                            <a
                              href={`mailto:${account.email}`}
                              className="block whitespace-normal break-all text-[11px] font-medium leading-5 text-slate-600 hover:text-primary-700 hover:underline"
                              title={account.email}
                            >
                              {account.email}
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-400">No account</span>
                        )}
                      </td>
                      <td className="border-r border-slate-100 px-3 py-1.5 align-top text-xs text-slate-700">
                        {account ? (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accountStatusTone(
                                account.accountStatus,
                                account.lifecycleState,
                              )}`}
                            >
                              {account.deleteRecordFlagged ? <Database className="h-3.5 w-3.5 text-rose-700" /> : null}
                              {account.flagged ? <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> : null}
                              {accountStatusLabel(account.accountStatus, account.lifecycleStateLabel, account.lifecycleState)}
                            </span>
                            {verificationLabel ? (
                              <span className="text-[11px] font-semibold text-amber-700">
                                {verificationLabel}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400">No account</span>
                        )}
                      </td>
                      <td className="border-r border-slate-100 px-3 py-1.5 align-top text-xs text-slate-700">
                        <div className="flex flex-col gap-0.5">
                          <span className="whitespace-nowrap text-[11px] font-medium text-slate-600 tabular-nums">
                            {account?.lastLoginAt ? formatDateTime(account.lastLoginAt) : account ? "Never" : "-"}
                          </span>
                        </div>
                      </td>
                      <td className="border-r border-slate-100 px-3 py-1.5 align-top text-xs text-slate-700">
                        {account ? (
                          tempPassword.label === "-" ? (
                            <span className={tempPassword.tone}>-</span>
                          ) : (
                            <span
                              className={`inline-flex border px-2 py-0.5 text-[10px] font-semibold ${
                                tempPassword.revealAsPassword
                                  ? "max-w-full rounded-sm font-mono normal-case tracking-normal"
                                  : "rounded-full uppercase tracking-wide"
                              } ${tempPassword.tone}`}
                              title={tempPassword.title}
                            >
                              {tempPassword.label}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 align-top text-right">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void actions.saveProfile(resolvedRecord)}
                              disabled={isRowSaving || isSaving}
                              className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Save className="h-3.5 w-3.5" />
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={actions.cancelEditing}
                              disabled={isRowSaving || isSaving}
                              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => actions.beginEditing(resolvedRecord)}
                              disabled={isRowSaving || isSaving}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                              title={account ? "Edit account" : "Create account"}
                            >
                              {account ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                              <span className="sr-only">{account ? "Edit" : "Create"}</span>
                            </button>
                            {account && shouldShowQuickSetupLink(account.accountStatus) && (
                              <button
                                type="button"
                                onClick={() => void actions.handleIssueSchoolHeadSetupLink(resolvedRecord)}
                                disabled={isRowSaving || isSaving}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-primary-200 bg-primary-50 text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
                                title="Send Setup Link"
                              >
                                <RefreshCw className="h-4 w-4" />
                                <span className="sr-only">Send Setup Link</span>
                              </button>
                            )}
                            <div
                              className="relative inline-flex"
                              ref={actions.openAccountRowMenuSchoolId === resolvedRecord.id ? actions.accountRowMenuRef : null}
                            >
                              <button
                                type="button"
                                onClick={() => actions.toggleAccountRowMenu(resolvedRecord.id)}
                                disabled={isRowSaving || isSaving || isDeleteSchoolRecordLoading}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                title="More actions"
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition ${
                                    actions.openAccountRowMenuSchoolId === resolvedRecord.id ? "rotate-180" : ""
                                  }`}
                                />
                                <span className="sr-only">More actions</span>
                              </button>
                              {actions.openAccountRowMenuSchoolId === resolvedRecord.id && (
                                <div
                                  data-open-direction={openMenuUpward ? "up" : "down"}
                                  className={`absolute right-0 z-30 w-48 overflow-hidden rounded-sm border border-slate-200 bg-white shadow-xl ${
                                    openMenuUpward ? "bottom-full mb-1" : "top-full mt-1"
                                  }`}
                                >
                                  {account ? (
                                    <>
                                    {shouldShowResetLinkAction(account.accountStatus) && (
                                      <button
                                        type="button"
                                        onClick={() => void actions.handleIssueSchoolHeadSetupLink(resolvedRecord)}
                                        disabled={isRowSaving || isSaving}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                      >
                                        <RefreshCw className="h-3.5 w-3.5 text-primary-600" />
                                        Send Password Reset Link
                                      </button>
                                    )}
                                    {normalizedAccountStatus === "pending_verification" && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          actions.openPendingAccountAction({
                                            kind: "activate",
                                            schoolId: resolvedRecord.id,
                                            schoolName: resolvedRecord.schoolName,
                                            actionLabel: "Activate account",
                                          })
                                        }
                                        disabled={isRowSaving || isSaving}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5 text-primary-600" />
                                        Activate
                                      </button>
                                    )}
                                    {normalizedAccountStatus !== "active" &&
                                      normalizedAccountStatus !== "pending_setup" &&
                                      normalizedAccountStatus !== "pending_verification" && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          actions.handleUpdateSchoolHeadAccount(
                                            resolvedRecord,
                                            { accountStatus: "active" },
                                            "Reactivate account",
                                          )
                                        }
                                        disabled={isRowSaving || isSaving}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5 text-primary-600" />
                                        Reactivate
                                      </button>
                                    )}
                                    {normalizedAccountStatus === "active" && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          actions.openPendingAccountAction({
                                            kind: "temporary_password",
                                            schoolId: resolvedRecord.id,
                                            schoolName: resolvedRecord.schoolName,
                                            actionLabel: "Regenerate Temporary Password",
                                          })
                                        }
                                        disabled={isRowSaving || isSaving}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                      >
                                        <RefreshCw className="h-3.5 w-3.5 text-primary-600" />
                                        Regenerate Temp Password
                                      </button>
                                    )}
                                    {normalizedAccountStatus === "active" && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          actions.handleUpdateSchoolHeadAccount(
                                            resolvedRecord,
                                            { accountStatus: "suspended" },
                                            "Suspend account",
                                          )
                                        }
                                        disabled={isRowSaving || isSaving}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                      >
                                        <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                        Suspend
                                      </button>
                                    )}
                                    {normalizedAccountStatus === "active" && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          actions.handleUpdateSchoolHeadAccount(
                                            resolvedRecord,
                                            { accountStatus: "locked" },
                                            "Lock account",
                                          )
                                        }
                                        disabled={isRowSaving || isSaving}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                      >
                                        <ShieldCheck className="h-3.5 w-3.5 text-rose-600" />
                                        Lock
                                      </button>
                                    )}
                                    {shouldShowArchiveAction(account.accountStatus) && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          actions.handleUpdateSchoolHeadAccount(
                                            resolvedRecord,
                                            { accountStatus: "archived" },
                                            "Archive account",
                                          )
                                        }
                                        disabled={isRowSaving || isSaving || normalizedAccountStatus === "archived"}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                      >
                                        <Trash2 className="h-3.5 w-3.5 text-slate-600" />
                                        Archive
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        actions.openPendingAccountAction({
                                          kind: "remove",
                                          schoolId: resolvedRecord.id,
                                          schoolName: resolvedRecord.schoolName,
                                          actionLabel: "Remove account and school",
                                        })
                                      }
                                      disabled={isRowSaving || isSaving}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                      Remove account and school
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void onPreviewDeleteSchoolRecord(resolvedRecord)}
                                      disabled={isRowSaving || isSaving || isDeleteSchoolRecordLoading}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                      Archive school record
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        actions.handleUpdateSchoolHeadAccount(
                                          resolvedRecord,
                                          { deleteRecordFlagged: !account.deleteRecordFlagged },
                                          account.deleteRecordFlagged ? "Remove delete record flag" : "Flag school record",
                                        )
                                      }
                                      disabled={isRowSaving || isSaving}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      <Database className="h-3.5 w-3.5 text-rose-700" />
                                      {account.deleteRecordFlagged ? "Undo Delete Flag" : "Flag School Record"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        actions.handleUpdateSchoolHeadAccount(
                                          resolvedRecord,
                                          { flagged: !account.flagged },
                                          account.flagged ? "Unflag account" : "Flag account",
                                        )
                                      }
                                      disabled={isRowSaving || isSaving}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                                      {account.flagged ? "Unflag" : "Flag"}
                                    </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => void onPreviewDeleteSchoolRecord(resolvedRecord)}
                                      disabled={isRowSaving || isSaving || isDeleteSchoolRecordLoading}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                      Archive school record
                                    </button>
                                  )}
                                </div>
                                )}
                              </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {actions.pendingAccountAction && (
        <>
          <button
            type="button"
            onClick={actions.closePendingAccountAction}
            className="fixed inset-0 z-[90] bg-slate-900/40"
            aria-label="Close account action dialog"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Account action"
            className={`fixed z-[91] w-[min(32rem,calc(100vw-2rem))] rounded-sm border border-slate-200 bg-white p-4 shadow-2xl animate-fade-slide ${
              isMobileViewport ? "inset-x-4 bottom-4" : "left-1/2 top-32 -translate-x-1/2"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{actions.pendingAccountAction.actionLabel}</h3>
                {actions.pendingActionDescription ? (
                  <p className="mt-1 text-xs text-slate-600">{actions.pendingActionDescription}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={actions.closePendingAccountAction}
                className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {actions.pendingAccountAction.kind !== "remove" ? (
              <div className="mt-3">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {actions.pendingAccountAction.kind === "activate" ? "Activation Note" : "Reason"}
                </label>
                <textarea
                  ref={actions.pendingAccountReasonRef}
                  value={actions.pendingAccountReason}
                  onChange={(event) => actions.updatePendingAccountReason(event.target.value)}
                  rows={3}
                  placeholder={
                    actions.pendingAccountAction.kind === "activate"
                      ? "Optional note for approval"
                      : "Type a short reason (min 5 characters)"
                  }
                  className="w-full resize-none rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                />
                {actions.pendingAccountReasonError && (
                  <p className="mt-2 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
                    {actions.pendingAccountReasonError}
                  </p>
                )}
              </div>
            ) : null}

            {actions.pendingActionRequiresVerification && (
              <div className="mt-3 rounded-sm border border-amber-200 bg-amber-50/70 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Confirmation Code</p>
                    <p className="mt-1 text-xs text-amber-700">Send a 6-digit code to your monitor email to confirm this action.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void actions.sendPendingAccountVerificationCode()}
                    disabled={actions.isPendingAccountVerificationSending || isSaving}
                    className="inline-flex items-center gap-1 rounded-sm border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actions.isPendingAccountVerificationSending
                      ? "Sending..."
                      : actions.pendingAccountVerificationChallenge
                        ? "Resend"
                        : "Send code"}
                  </button>
                </div>

                {actions.pendingAccountVerificationChallenge && (
                  <div className="mt-3">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      6-digit code
                    </label>
                    <input
                      ref={actions.pendingAccountVerificationCodeRef}
                      type="text"
                      inputMode="numeric"
                      value={actions.pendingAccountVerificationCode}
                      onChange={(event) => actions.updatePendingVerificationCode(event.target.value)}
                      placeholder="123456"
                      className="w-full rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                    />
                    <p className="mt-1 text-[11px] font-medium text-slate-600">
                      Expires {formatDateTime(actions.pendingAccountVerificationChallenge.expiresAt)}.
                    </p>
                  </div>
                )}

                {actions.pendingAccountVerificationError && (
                  <p className="mt-2 rounded-sm border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800">
                    {actions.pendingAccountVerificationError}
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={actions.closePendingAccountAction}
                disabled={isSaving}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void actions.confirmPendingAccountAction()}
                disabled={actions.isConfirmPendingAccountActionDisabled}
                className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actions.confirmPendingAccountActionLabel}
              </button>
            </div>
          </section>
        </>
      )}

      {pendingDeleteSchoolRecord && (
        <>
          <button
            type="button"
            onClick={onClosePendingDeleteSchoolRecord}
            className="fixed inset-0 z-[90] bg-slate-900/40"
            aria-label="Close school archive dialog"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Archive school record"
            className={`fixed z-[91] w-[min(32rem,calc(100vw-2rem))] rounded-sm border border-slate-200 bg-white p-4 shadow-2xl animate-fade-slide ${
              isMobileViewport ? "inset-x-4 bottom-4" : "left-1/2 top-32 -translate-x-1/2"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Archive school record</h3>
              </div>
              <button
                type="button"
                onClick={onClosePendingDeleteSchoolRecord}
                className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
              {isDeleteSchoolRecordLoading && !pendingDeleteSchoolRecordPreview ? (
                <p>Loading archive preview...</p>
              ) : pendingDeleteSchoolRecordPreview ? (
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900">Linked records that will leave the active workspace with this school:</p>
                  <p>Students: {pendingDeleteSchoolRecordPreview.dependencies.students}</p>
                  <p>Sections: {pendingDeleteSchoolRecordPreview.dependencies.sections}</p>
                  <p>Indicator submissions: {pendingDeleteSchoolRecordPreview.dependencies.indicatorSubmissions}</p>
                  <p>Submission histories: {pendingDeleteSchoolRecordPreview.dependencies.histories}</p>
                  <p>Linked users: {pendingDeleteSchoolRecordPreview.dependencies.linkedUsers}</p>
                </div>
              ) : (
                <p>Delete preview is unavailable right now.</p>
              )}
            </div>

            {pendingDeleteSchoolRecordError && (
              <p className="mt-3 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
                {pendingDeleteSchoolRecordError}
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClosePendingDeleteSchoolRecord}
                disabled={isDeleteSchoolRecordLoading}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onConfirmDeleteSchoolRecord()}
                disabled={isDeleteSchoolRecordLoading || !pendingDeleteSchoolRecordPreview}
                className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleteSchoolRecordLoading ? "Deleting..." : "Delete school"}
              </button>
            </div>
          </section>
        </>
      )}

      {isBatchDeleteSchoolRecordsPending && (
        <>
          <button
            type="button"
            onClick={onClosePendingBatchDeleteSchoolRecords}
            className="fixed inset-0 z-[90] bg-slate-900/40"
            aria-label="Close batch delete dialog"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Batch delete flagged schools"
            className={`fixed z-[91] w-[min(32rem,calc(100vw-2rem))] rounded-sm border border-slate-200 bg-white p-4 shadow-2xl animate-fade-slide ${
              isMobileViewport ? "inset-x-4 bottom-4" : "left-1/2 top-32 -translate-x-1/2"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delete flagged schools</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Permanently delete {deleteFlaggedSchoolCount} flagged school{deleteFlaggedSchoolCount === 1 ? "" : "s"} and their linked School Head account data.
                </p>
              </div>
              <button
                type="button"
                onClick={onClosePendingBatchDeleteSchoolRecords}
                className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              This permanently removes the school record and all linked School Head account rows for each flagged school.
            </div>

            {batchDeleteSchoolRecordsError ? (
              <div className="mt-3 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {batchDeleteSchoolRecordsError}
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClosePendingBatchDeleteSchoolRecords}
                disabled={isBatchDeleteSchoolRecordsLoading}
                className="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onConfirmBatchDeleteSchoolRecords()}
                disabled={isBatchDeleteSchoolRecordsLoading || deleteFlaggedSchoolCount === 0}
                aria-label="Confirm batch delete flagged schools"
                className="rounded-sm bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBatchDeleteSchoolRecordsLoading ? "Deleting..." : "Delete flagged schools"}
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
