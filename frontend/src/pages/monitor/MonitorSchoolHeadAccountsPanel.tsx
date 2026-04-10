import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Database,
  Edit2,
  Filter,
  Plus,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { ACCOUNT_STATUS, type SchoolRecord } from "@/types";
import { getAccountStatusLabel, normalizeAccountStatus } from "./schoolHeadAccountStateMachine";
import type { SchoolHeadAccountActionsApi } from "./useSchoolHeadAccountActions";

export type SchoolHeadAccountsStatusFilter =
  "all" | "needs_setup" | "pending_verification" | "active" | "suspended" | "locked" | "archived";

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
  formatDateTime: (value: string | null) => string;
  actions: SchoolHeadAccountActionsApi;
}

function accountStatusLabel(status: string | null | undefined): string {
  if (!status) return "No Account";
  const normalized = normalizeAccountStatus(status);
  if (normalized) {
    return getAccountStatusLabel(normalized);
  }
  return status;
}

function accountStatusTone(status: string | null | undefined): string {
  const normalized = normalizeAccountStatus(status);
  if (normalized === ACCOUNT_STATUS.active) return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  if (normalized === ACCOUNT_STATUS.pendingSetup) return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  if (normalized === ACCOUNT_STATUS.pendingVerification) return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
  if (normalized === ACCOUNT_STATUS.suspended || normalized === ACCOUNT_STATUS.locked) {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }
  if (normalized === ACCOUNT_STATUS.archived) return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
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
  formatDateTime,
  actions,
}: MonitorSchoolHeadAccountsPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <>
      <section className="mx-5 mt-4 overflow-hidden rounded-sm border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">School Head Accounts</h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Passwords are never shown/stored. The primary account action is now driven by the account lifecycle
              state machine, so each row only exposes the backend-valid next step.
            </p>
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
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700">
                  <Filter className="h-3.5 w-3.5 text-slate-500" />
                  <span>Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => onStatusFilterChange(event.target.value as SchoolHeadAccountsStatusFilter)}
                    className="rounded-sm border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                  >
                    <option value="all">All</option>
                    <option value="needs_setup">Needs setup</option>
                    <option value="pending_verification">Pending verification</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="locked">Locked</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={onlyFlagged}
                    onChange={(event) => onOnlyFlaggedChange(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary-200"
                  />
                  <span>Flagged</span>
                </label>
                <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={onlyDeleteFlagged}
                    onChange={(event) => onOnlyDeleteFlaggedChange(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary-200"
                  />
                  <span>Delete flagged</span>
                </label>
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                  Clear
                </button>
              </div>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              Showing <span className="text-slate-700">{rows.length}</span> of{" "}
              <span className="text-slate-700">{totalCount}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed">
            <thead>
              <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="w-20 px-3 py-1.5 text-left">Code</th>
                <th className="px-3 py-1.5 text-left">School</th>
                <th className="w-[22rem] px-3 py-1.5 text-left">Contact</th>
                <th className="w-36 px-3 py-1.5 text-left">Status</th>
                <th className="w-44 px-3 py-1.5 text-left">Activity</th>
                <th className="w-[20rem] px-3 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={6}>
                    No School Head accounts match the current filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const resolvedRecord = row.record;
                  if (!resolvedRecord) {
                    return (
                      <tr key={`account-missing-${row.schoolKey}`}>
                        <td className="px-3 py-1.5 align-top text-xs font-semibold text-slate-700">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-semibold tabular-nums text-slate-700 ring-1 ring-slate-200">
                            {row.schoolCode}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 align-top text-xs text-slate-900">
                          <span className="block w-full truncate font-semibold text-slate-900" title={row.schoolName}>
                            {row.schoolName}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 align-top text-xs text-slate-500" colSpan={4}>
                          Record missing from sync.
                        </td>
                      </tr>
                    );
                  }

                  const account = resolvedRecord.schoolHeadAccount ?? null;
                  const isEditing = actions.editingSchoolHeadAccountSchoolId === resolvedRecord.id;
                  const isRowSaving = Boolean(actions.accountActionKey?.startsWith(`${resolvedRecord.id}:`));
                  const resolvedAccountStatus = normalizeAccountStatus(account?.accountStatus);
                  const normalizedAccountStatus = resolvedAccountStatus ?? "";
                  const allowedLifecycleActions = actions.resolveLifecycleActions(resolvedRecord);
                  const emailVerified = Boolean(account?.emailVerifiedAt);
                  const verificationLabel = normalizedAccountStatus === ACCOUNT_STATUS.pendingSetup
                    ? "Setup needed"
                    : normalizedAccountStatus === ACCOUNT_STATUS.pendingVerification
                      ? "Awaiting monitor approval"
                      : account?.verifiedAt
                        ? "Monitor approved"
                        : emailVerified
                          ? "Verified"
                          : "Not verified";
                  const verificationTone =
                    normalizedAccountStatus === ACCOUNT_STATUS.pendingSetup
                    || normalizedAccountStatus === ACCOUNT_STATUS.pendingVerification
                    || !emailVerified
                      ? "text-amber-700"
                      : "text-primary-700";
                  const setupLinkExpiresAtMs = account?.setupLinkExpiresAt
                    ? Date.parse(account.setupLinkExpiresAt)
                    : Number.NaN;
                  const setupLinkExpired =
                    Number.isFinite(setupLinkExpiresAtMs) && setupLinkExpiresAtMs < Date.now();

                  return (
                    <tr
                      key={`account-${resolvedRecord.id}`}
                      className={`transition ${isEditing ? "bg-primary-50/30" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-3 py-1.5 align-top text-xs font-semibold text-slate-700">
                        <button
                          type="button"
                          onClick={() => onOpenSchoolRecord(resolvedRecord)}
                          className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-semibold tabular-nums text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200"
                          title={`Open ${row.schoolName}`}
                        >
                          {row.schoolCode}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 align-top text-xs text-slate-900">
                        <button
                          type="button"
                          onClick={() => onOpenSchoolRecord(resolvedRecord)}
                          className="block w-full truncate text-left font-semibold text-slate-900 transition hover:text-primary-700 hover:underline"
                          title={`Open ${row.schoolName}`}
                        >
                          {row.schoolName}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 align-top text-xs text-slate-700">
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
                            <span className="block max-w-[20rem] truncate font-semibold text-slate-900" title={account.name}>
                              {account.name}
                            </span>
                            <a
                              href={`mailto:${account.email}`}
                              className="block max-w-[20rem] truncate text-[11px] font-medium text-slate-600 hover:text-primary-700 hover:underline"
                              title={account.email}
                            >
                              {account.email}
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-400">No account</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 align-top text-xs text-slate-700">
                        {account ? (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${accountStatusTone(
                                account.accountStatus,
                              )}`}
                            >
                              {account.deleteRecordFlagged ? <Database className="h-3.5 w-3.5 text-rose-700" /> : null}
                              {account.flagged ? <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> : null}
                              {accountStatusLabel(account.accountStatus)}
                            </span>
                            <span className={`text-[11px] font-semibold ${verificationTone}`}>
                              {verificationLabel}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">No account</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 align-top text-xs text-slate-700">
                        <div className="flex flex-col gap-0.5">
                          <span className="whitespace-nowrap text-[11px] font-medium text-slate-600 tabular-nums">
                            {account?.lastLoginAt ? formatDateTime(account.lastLoginAt) : account ? "Never" : "-"}
                          </span>
                          {account?.verifiedAt ? (
                            <span
                              className="max-w-[12rem] truncate text-[11px] font-medium text-primary-700"
                              title={
                                account.verifiedByName
                                  ? `Approved by ${account.verifiedByName} on ${formatDateTime(account.verifiedAt)}`
                                  : `Approved ${formatDateTime(account.verifiedAt)}`
                              }
                            >
                              Approved {formatDateTime(account.verifiedAt)}
                            </span>
                          ) : null}
                          {account?.setupLinkExpiresAt ? (
                            <span
                              className={`inline-flex max-w-[12rem] truncate whitespace-nowrap rounded-sm border px-2 py-1 text-[11px] font-medium tabular-nums ${
                                setupLinkExpired
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-slate-200 bg-white text-slate-600"
                              }`}
                              title={`${setupLinkExpired ? "Expired" : "Expires"} ${formatDateTime(account.setupLinkExpiresAt)}`}
                            >
                              {setupLinkExpired ? "Expired" : "Expires"} {formatDateTime(account.setupLinkExpiresAt)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
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
                            {/* FSM CHANGE: render only the lifecycle actions allowed for the current account state. */}
                            {account &&
                              allowedLifecycleActions.map((action) => {
                                const lifecycleState = actions.getLifecycleActionState(resolvedRecord.id, action);
                                const lifecycleTone = lifecycleState.phase === "failure"
                                  ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  : lifecycleState.phase === "success"
                                    ? "border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
                                    : "border-primary-200 bg-white text-primary-700 hover:bg-primary-50";

                                return (
                                  <button
                                    key={`${resolvedRecord.id}:${action}`}
                                    type="button"
                                    onClick={() => void actions.handleLifecycleAction(resolvedRecord, action)}
                                    disabled={lifecycleState.disabled}
                                    className={`inline-flex items-center rounded-sm border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${lifecycleTone}`}
                                    title={actions.getLifecycleActionLabel(action)}
                                    data-account-action-state={lifecycleState.phase}
                                  >
                                    {lifecycleState.label}
                                  </button>
                                );
                              })}
                            {account && (
                              <div
                                className="relative inline-flex"
                                ref={actions.openAccountRowMenuSchoolId === resolvedRecord.id ? actions.accountRowMenuRef : null}
                              >
                                <button
                                  type="button"
                                  onClick={() => actions.toggleAccountRowMenu(resolvedRecord.id)}
                                  disabled={isRowSaving || isSaving}
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
                                  <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-sm border border-slate-200 bg-white shadow-xl">
                                    {normalizedAccountStatus === ACCOUNT_STATUS.active && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          actions.handleUpdateSchoolHeadAccount(
                                            resolvedRecord,
                                            { accountStatus: ACCOUNT_STATUS.suspended },
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
                                    {normalizedAccountStatus === ACCOUNT_STATUS.active && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          actions.handleUpdateSchoolHeadAccount(
                                            resolvedRecord,
                                            { accountStatus: ACCOUNT_STATUS.locked },
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
                                    <button
                                      type="button"
                                      onClick={() =>
                                        actions.handleUpdateSchoolHeadAccount(
                                          resolvedRecord,
                                          { accountStatus: ACCOUNT_STATUS.archived },
                                          "Archive account",
                                        )
                                      }
                                      disabled={isRowSaving || isSaving || normalizedAccountStatus === ACCOUNT_STATUS.archived}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-slate-600" />
                                      Archive
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => actions.openRemoveAccountAction(resolvedRecord)}
                                      disabled={isRowSaving || isSaving}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                                      Remove account
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        actions.handleUpdateSchoolHeadAccount(
                                          resolvedRecord,
                                          { deleteRecordFlagged: !account.deleteRecordFlagged },
                                          account.deleteRecordFlagged ? "Remove delete record flag" : "Flag delete record",
                                        )
                                      }
                                      disabled={isRowSaving || isSaving}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      <Database className="h-3.5 w-3.5 text-rose-700" />
                                      {account.deleteRecordFlagged ? "Undo Delete Flag" : "Delete Record"}
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
                                  </div>
                                )}
                              </div>
                            )}
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
                <h3 className="text-sm font-bold text-slate-900">
                  {actions.pendingAccountAction.kind === "lifecycle"
                    ? actions.getLifecycleActionLabel(actions.pendingAccountAction.action)
                    : actions.pendingAccountAction.actionLabel}
                </h3>
                <p className="mt-1 text-xs text-slate-600">{actions.pendingActionDescription}</p>
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

            <div className="mt-3">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {actions.pendingAccountReasonLabel}
              </label>
              <textarea
                ref={actions.pendingAccountReasonRef}
                value={actions.pendingAccountReason}
                onChange={(event) => actions.updatePendingAccountReason(event.target.value)}
                rows={3}
                placeholder={actions.pendingAccountReasonPlaceholder}
                className="w-full resize-none rounded-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
              {actions.pendingAccountReasonError && (
                <p className="mt-2 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
                  {actions.pendingAccountReasonError}
                </p>
              )}
            </div>

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
                {actions.pendingActionConfirmLabel}
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
