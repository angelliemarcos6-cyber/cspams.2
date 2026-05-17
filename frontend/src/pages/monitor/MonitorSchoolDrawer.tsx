import { Fragment } from "react";
import { X } from "lucide-react";
import type { MonitorTopNavigatorId } from "@/pages/monitor/monitorFilters";
import type {
  MonitorDrawerHistorySummary,
  MonitorDrawerSnapshotSummary,
  MonitorDrawerSubmissionSummary,
  SchoolDetailSnapshot,
  SchoolDrawerCriticalAlert,
  SchoolIndicatorMatrix,
  SchoolIndicatorPackageRow,
  SchoolIndicatorRowGroup,
} from "@/pages/monitor/monitorDrawerTypes";
import type { SchoolDrawerTab } from "@/pages/monitor/useSchoolDrawer";
import type { IndicatorSubmission } from "@/types";
interface MonitorSchoolDrawerViewState {
  isOpen: boolean;
  showNavigatorManual: boolean;
  isMobileViewport: boolean;
  activeTopNavigator: MonitorTopNavigatorId;
  activeSchoolDrawerTab: SchoolDrawerTab;
  highlightedDrawerIndicatorKey: string | null;
  expandedDrawerIndicatorRows: Record<string, boolean>;
}

interface MonitorSchoolDrawerLoadingState {
  syncedCountsLoadingSchoolKey: string | null;
  syncedCountsError: string;
  isSchoolDrawerSubmissionsLoading: boolean;
  schoolDrawerSubmissionsError: string;
}

interface MonitorSchoolDrawerData {
  schoolDetail: SchoolDetailSnapshot | null;
  schoolDrawerSnapshotSummary: MonitorDrawerSnapshotSummary | null;
  schoolDrawerSubmissionSummary: MonitorDrawerSubmissionSummary | null;
  schoolDrawerHistorySummary: MonitorDrawerHistorySummary | null;
  schoolDrawerCriticalAlerts: SchoolDrawerCriticalAlert[];
  schoolIndicatorPackageRows: SchoolIndicatorPackageRow[];
  latestSchoolPackage: SchoolIndicatorPackageRow | null;
  schoolIndicatorMatrix: SchoolIndicatorMatrix;
  latestSchoolIndicatorYear: string;
  schoolDrawerIndicatorSubmissions: IndicatorSubmission[];
  schoolIndicatorRowsByCategory: SchoolIndicatorRowGroup[];
  missingDrawerIndicatorKeys: string[];
  returnedDrawerIndicatorKeys: string[];
  missingDrawerIndicatorKeySet: Set<string>;
  returnedDrawerIndicatorKeySet: Set<string>;
}

interface MonitorSchoolDrawerActions {
  setActiveSchoolDrawerTab: (tab: SchoolDrawerTab) => void;
  closeSchoolDrawer: () => void;
  handleJumpToMissingIndicators: () => void;
  handleJumpToReturnedIndicators: () => void;
  toggleDrawerIndicatorLabel: (key: string) => void;
}

interface MonitorSchoolDrawerFormatting {
  workflowTone: (status: string | null) => string;
  workflowLabel: (status: string | null) => string;
  formatDateTime: (value: string) => string;
}

interface MonitorSchoolDrawerProps {
  viewState: MonitorSchoolDrawerViewState;
  loadingState: MonitorSchoolDrawerLoadingState;
  data: MonitorSchoolDrawerData;
  actions: MonitorSchoolDrawerActions;
  formatting: MonitorSchoolDrawerFormatting;
}

function truncateIndicatorDescription(value: string, maxLength = 48): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(12, maxLength - 3)).trimEnd()}...`;
}

function sanitizeAnchorToken(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "row";
}

export function MonitorSchoolDrawer({
  viewState,
  loadingState,
  data,
  actions,
  formatting,
}: MonitorSchoolDrawerProps) {
  const {
    isOpen,
    showNavigatorManual,
    isMobileViewport,
    activeTopNavigator,
    activeSchoolDrawerTab,
    highlightedDrawerIndicatorKey,
    expandedDrawerIndicatorRows,
  } = viewState;
  const {
    syncedCountsLoadingSchoolKey,
    syncedCountsError,
    isSchoolDrawerSubmissionsLoading,
    schoolDrawerSubmissionsError,
  } = loadingState;
  const {
    schoolDetail,
    schoolDrawerSnapshotSummary,
    schoolDrawerSubmissionSummary,
    schoolDrawerHistorySummary,
    schoolDrawerCriticalAlerts,
    schoolIndicatorPackageRows,
    latestSchoolPackage,
    schoolIndicatorMatrix,
    latestSchoolIndicatorYear,
    schoolDrawerIndicatorSubmissions,
    schoolIndicatorRowsByCategory,
    missingDrawerIndicatorKeys,
    returnedDrawerIndicatorKeys,
    missingDrawerIndicatorKeySet,
    returnedDrawerIndicatorKeySet,
  } = data;
  const {
    setActiveSchoolDrawerTab,
    closeSchoolDrawer,
    handleJumpToMissingIndicators,
    handleJumpToReturnedIndicators,
    toggleDrawerIndicatorLabel,
  } = actions;
  const { workflowTone, workflowLabel, formatDateTime } = formatting;

  return (
    <>
      {!showNavigatorManual && isOpen && activeTopNavigator !== "reviews" && (
        <button
          type="button"
          onClick={closeSchoolDrawer}
          className="fixed inset-0 z-[74] bg-slate-900/25"
          aria-label="Close school detail panel"
        />
      )}

      <aside
        style={
          activeTopNavigator === "reviews"
            ? undefined
            : isMobileViewport
              ? undefined
              : { top: "var(--shell-sticky-top, 10rem)", height: "calc(100vh - var(--shell-sticky-top, 10rem))" }
        }
        className={
          activeTopNavigator === "reviews"
            ? !showNavigatorManual && isOpen
              ? "surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden rounded-sm border border-slate-200 bg-white shadow-sm"
              : "hidden"
            : isMobileViewport
              ? `mobile-bottom-sheet mobile-safe-bottom fixed inset-x-0 bottom-0 z-[75] flex flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl transition-transform duration-[160ms] ${
                  !showNavigatorManual && isOpen ? "translate-y-0" : "translate-y-full"
                }`
              : `fixed right-0 z-[75] flex w-[min(48rem,100vw)] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-[160ms] ${
                  !showNavigatorManual && isOpen ? "translate-x-0" : "translate-x-full"
                }`
        }
      >
        <div
          className={`flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 ${
            isMobileViewport && activeTopNavigator !== "reviews" ? "sticky top-0 z-10" : ""
          }`}
        >
          <div>
            {isMobileViewport && activeTopNavigator !== "reviews" && (
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-300 lg:hidden" />
            )}
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">School Detail</p>
            <p className="text-sm font-semibold text-slate-900">{schoolDetail?.schoolName ?? "No school selected"}</p>
          </div>
          <button
            type="button"
            onClick={closeSchoolDrawer}
            className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={activeTopNavigator === "reviews" ? "p-4" : "flex-1 overflow-y-auto p-4 mobile-safe-bottom"}>
          {schoolDetail ? (
            <div className="space-y-3">
              <article className="rounded-sm border border-slate-200 bg-white p-2.5">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="inline-flex rounded-sm border border-slate-200 bg-slate-50 p-1">
                    {([
                      { id: "snapshot", label: "Snapshot" },
                      { id: "submissions", label: "Submissions" },
                      { id: "history", label: "History" },
                    ] as Array<{ id: SchoolDrawerTab; label: string }>).map((tab) => (
                      <button
                        key={`school-drawer-tab-${tab.id}`}
                        type="button"
                        onClick={() => setActiveSchoolDrawerTab(tab.id)}
                        className={`rounded-sm px-2.5 py-1.5 text-xs font-semibold transition ${
                          activeSchoolDrawerTab === tab.id ? "bg-primary-700 text-white" : "text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={handleJumpToMissingIndicators}
                      disabled={missingDrawerIndicatorKeys.length === 0}
                      className="inline-flex items-center rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Jump to Missing {missingDrawerIndicatorKeys.length > 0 ? `(${missingDrawerIndicatorKeys.length})` : ""}
                    </button>
                    <button
                      type="button"
                      onClick={handleJumpToReturnedIndicators}
                      disabled={returnedDrawerIndicatorKeys.length === 0}
                      className="inline-flex items-center rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Jump to Returned {returnedDrawerIndicatorKeys.length > 0 ? `(${returnedDrawerIndicatorKeys.length})` : ""}
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-600">
                  {schoolDetail.schoolCode} | {schoolDetail.level} | {schoolDetail.type}
                </p>
              </article>

              {activeSchoolDrawerTab === "snapshot" && (
                <div className="space-y-3">
                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">Snapshot Summary</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {schoolDrawerSnapshotSummary?.summaryHeadline ?? "No summary available for this school yet."}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-600">
                            {schoolDrawerSnapshotSummary?.requirementModeLabel}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <div className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2">
                            <p className="text-[11px] text-slate-600">School</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {schoolDetail.schoolCode} | {schoolDetail.level} | {schoolDetail.type}
                            </p>
                          </div>
                          <div className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2">
                            <p className="text-[11px] text-slate-600">Active Package</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {schoolDrawerSnapshotSummary?.activePackageLabel ?? "N/A"}
                            </p>
                          </div>
                          {schoolDrawerSubmissionSummary?.latestMonitorRelevantSubmissionId ? (
                            <div className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2">
                              <p className="text-[11px] text-slate-600">Monitor Package</p>
                              <p className="text-sm font-semibold text-slate-900">
                                #{schoolDrawerSubmissionSummary.latestMonitorRelevantSubmissionId}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div
                        className={`rounded-sm border px-3 py-2 text-sm font-semibold ${
                          schoolDrawerSnapshotSummary?.currentIssueTone === "warning"
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : schoolDrawerSnapshotSummary?.currentIssueTone === "success"
                              ? "border-primary-200 bg-primary-50 text-primary-700"
                              : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        <p className="text-[11px] uppercase tracking-wide">Current Issue</p>
                        <p className="mt-1">{schoolDrawerSnapshotSummary?.currentIssueLabel ?? "No immediate issue."}</p>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Operational Summary</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Current school status for monitor action and follow-up.</p>
                      </div>
                      {schoolDrawerSnapshotSummary?.needsAction ? (
                        <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          Needs Action
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                          Stable
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Compliance</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.hasComplianceRecord ? "Submitted" : "Missing"}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Active Package</p>
                        <p className="text-sm font-semibold text-slate-900">{workflowLabel(schoolDetail.indicatorStatus)}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Requirements Missing</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.missingCount.toLocaleString()}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Awaiting Monitor Review</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.awaitingReviewCount.toLocaleString()}</p>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Data Sync</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Reported totals compared with current synced students and teachers.</p>
                      </div>
                      {syncedCountsLoadingSchoolKey === schoolDetail.schoolKey ? (
                        <p className="text-[11px] text-slate-500">Refreshing synced totals...</p>
                      ) : null}
                    </div>
                    {syncedCountsError ? (
                      <div className="mt-2 rounded-sm border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                        {syncedCountsError}
                      </div>
                    ) : null}
                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Reported Students</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.reportedStudents.toLocaleString()}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Synced Students</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.synchronizedStudents.toLocaleString()}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Reported Teachers</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.reportedTeachers.toLocaleString()}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Synced Teachers</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.synchronizedTeachers.toLocaleString()}</p>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Critical Alerts</p>
                      <p className="text-[11px] text-slate-500">
                        Last activity: {schoolDetail.lastActivityAt ? formatDateTime(schoolDetail.lastActivityAt) : "N/A"}
                      </p>
                    </div>
                    {schoolDrawerCriticalAlerts.length === 0 ? (
                      <div className="mt-2 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-2 text-xs font-medium text-primary-700">
                        No critical alerts for this school.
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {schoolDrawerCriticalAlerts.map((alert) => (
                          <div
                            key={`school-critical-alert-${alert.id}`}
                            className={`rounded-sm border px-2.5 py-2 ${
                              alert.tone === "warning"
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : "border-primary-200 bg-primary-50 text-primary-700"
                            }`}
                          >
                            <p className="text-xs font-semibold">{alert.title}</p>
                            <p className="mt-0.5 text-xs">{alert.detail}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </div>
              )}

              {activeSchoolDrawerTab === "submissions" && (
                <div className="space-y-3">
                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Active Package Context</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {schoolDrawerSubmissionSummary?.submissionStateExplanation ?? "No package context available yet."}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-600">
                            {schoolDrawerSubmissionSummary?.submissionLineageLabel ?? "No package lineage available yet."}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <div className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2">
                            <p className="text-[11px] text-slate-600">Requirement Mode</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {schoolDrawerSubmissionSummary?.activePackageLabel ?? "N/A"}
                            </p>
                          </div>
                          <div className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2">
                            <p className="text-[11px] text-slate-600">Latest Activity</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {schoolDrawerSubmissionSummary?.latestActivitySubmissionId
                                ? `#${schoolDrawerSubmissionSummary.latestActivitySubmissionId}`
                                : "None"}
                            </p>
                          </div>
                          <div className="rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2">
                            <p className="text-[11px] text-slate-600">Monitor-Relevant Package</p>
                            <p className="text-sm font-semibold text-slate-900">
                              {schoolDrawerSubmissionSummary?.latestMonitorRelevantSubmissionId
                                ? `#${schoolDrawerSubmissionSummary.latestMonitorRelevantSubmissionId}`
                                : "Not submitted yet"}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div
                        className={`rounded-sm border px-3 py-2 text-sm font-semibold ${
                          schoolDrawerSubmissionSummary?.needsMonitorAction
                            ? "border-primary-200 bg-primary-50 text-primary-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        <p className="text-[11px] uppercase tracking-wide">Who Acts Next</p>
                        <p className="mt-1">
                          {schoolDrawerSubmissionSummary?.needsMonitorAction
                            ? "Monitor review is needed."
                            : "School Head follow-up or no immediate action."}
                        </p>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Latest Monitor-Relevant Package</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">The package status that currently matters for monitor review and follow-up.</p>
                      </div>
                      <div className="text-right text-[11px] text-slate-600">
                        <p>
                          Total packages: <span className="font-semibold text-slate-900">{schoolIndicatorPackageRows.length.toLocaleString()}</span>
                        </p>
                        {isSchoolDrawerSubmissionsLoading && <p className="text-primary-700">Syncing latest submissions...</p>}
                        {!isSchoolDrawerSubmissionsLoading && schoolDrawerSubmissionsError && (
                          <p className="text-rose-600">{schoolDrawerSubmissionsError}</p>
                        )}
                      </div>
                    </div>
                    {schoolDrawerSubmissionSummary?.latestMonitorRelevantSubmissionId ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">Package</p>
                          <p className="text-sm font-semibold text-slate-900">#{schoolDrawerSubmissionSummary.latestMonitorRelevantSubmissionId}</p>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">School Year</p>
                          <p className="text-sm font-semibold text-slate-900">{schoolDrawerSubmissionSummary.latestPackageSchoolYear ?? "N/A"}</p>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">Status</p>
                          <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${workflowTone(schoolDrawerSubmissionSummary.monitorRelevantPackageStatus)}`}>
                            {workflowLabel(schoolDrawerSubmissionSummary.monitorRelevantPackageStatus)}
                          </span>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">Compliance</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {schoolDrawerSubmissionSummary.latestPackageComplianceRatePercent === null
                              ? "N/A"
                              : `${schoolDrawerSubmissionSummary.latestPackageComplianceRatePercent.toFixed(2)}%`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        No monitor-relevant package is available yet for this school.
                      </div>
                    )}
                  </article>

                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Submission Table</p>
                      <p className="text-[11px] text-slate-500">
                        Latest activity can be a draft. Monitor-facing package truth stays on the latest submitted, returned, or validated package when available.
                      </p>
                    </div>
                    {schoolIndicatorPackageRows.length === 0 ? (
                      <div className="mt-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        No package history found.
                      </div>
                    ) : (
                      <div className="mt-2 overflow-x-auto rounded-sm border border-slate-200">
                        <table className="min-w-[720px] w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                              <th className="border border-slate-300 px-2 py-2 text-left">Package</th>
                              <th className="border border-slate-300 px-2 py-2 text-left">School Year</th>
                              <th className="border border-slate-300 px-2 py-2 text-left">Period</th>
                              <th className="border border-slate-300 px-2 py-2 text-center">Status</th>
                              <th className="border border-slate-300 px-2 py-2 text-right">Compliance</th>
                              <th className="border border-slate-300 px-2 py-2 text-center">Lineage</th>
                              <th className="border border-slate-300 px-2 py-2 text-left">Submitted</th>
                              <th className="border border-slate-300 px-2 py-2 text-left">Reviewed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {schoolIndicatorPackageRows.map((row) => (
                              <tr key={`monitor-school-package-${row.id}`} className="bg-white">
                                <td className="border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-900">#{row.id}</td>
                                <td className="border border-slate-300 px-2 py-2 text-xs text-slate-700">{row.schoolYear}</td>
                                <td className="border border-slate-300 px-2 py-2 text-xs text-slate-700">{row.reportingPeriod}</td>
                                <td className="border border-slate-300 px-2 py-2 text-center">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${workflowTone(row.status)}`}>
                                    {workflowLabel(row.status)}
                                  </span>
                                </td>
                                <td className="border border-slate-300 px-2 py-2 text-right text-xs text-slate-700">
                                  {row.complianceRatePercent === null ? "N/A" : `${row.complianceRatePercent.toFixed(2)}%`}
                                </td>
                                <td className="border border-slate-300 px-2 py-2 text-center text-xs text-slate-700">
                                  {schoolDrawerSubmissionSummary?.latestMonitorRelevantSubmissionId === row.id
                                    ? "Monitor context"
                                    : schoolDrawerSubmissionSummary?.latestActivitySubmissionId === row.id
                                      ? "Latest activity"
                                      : "History"}
                                </td>
                                <td className="border border-slate-300 px-2 py-2 text-xs text-slate-700">
                                  {row.submittedAt ? formatDateTime(row.submittedAt) : "N/A"}
                                </td>
                                <td className="border border-slate-300 px-2 py-2 text-xs text-slate-700">
                                  {row.reviewedAt ? formatDateTime(row.reviewedAt) : "N/A"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                </div>
              )}

              {activeSchoolDrawerTab === "history" && (
                <article className="rounded-sm border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Indicator History</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Historical package lineage and indicator reference. Hover or expand rows for full descriptions.
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-slate-600">
                      <p>
                        Latest package: <span className="font-semibold text-slate-900">{schoolDrawerHistorySummary?.latestHistoryPackageId ? `#${schoolDrawerHistorySummary.latestHistoryPackageId}` : "N/A"}</span>
                      </p>
                      <p>
                        Matrix source year: <span className="font-semibold text-slate-900">{schoolDrawerHistorySummary?.latestRenderableSchoolYear ?? (latestSchoolIndicatorYear || "N/A")}</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">History Summary</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {schoolDrawerHistorySummary?.historyAvailabilityLabel ?? "History status unavailable"}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          {schoolDrawerHistorySummary?.historyExplanation ?? "No history explanation available yet."}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                        <div className="rounded-sm border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[11px] text-slate-600">Packages</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {schoolDrawerHistorySummary?.historyPackageCount.toLocaleString() ?? "0"}
                          </p>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[11px] text-slate-600">School Years</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {schoolDrawerHistorySummary?.historySchoolYearCount.toLocaleString() ?? "0"}
                          </p>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[11px] text-slate-600">Renderable Packages</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {schoolDrawerHistorySummary?.packagesWithRenderableRowsCount.toLocaleString() ?? "0"}
                          </p>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[11px] text-slate-600">Without Rows</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {schoolDrawerHistorySummary?.packagesWithoutRenderableRowsCount.toLocaleString() ?? "0"}
                          </p>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[11px] text-slate-600">Latest Package</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {schoolDrawerHistorySummary?.latestHistoryPackageId ? `#${schoolDrawerHistorySummary.latestHistoryPackageId}` : "N/A"}
                          </p>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[11px] text-slate-600">History Source</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {schoolDrawerHistorySummary?.latestRenderableSubmissionId ? `#${schoolDrawerHistorySummary.latestRenderableSubmissionId}` : "N/A"}
                          </p>
                        </div>
                      </div>
                    </div>
                    {schoolDrawerHistorySummary?.historyFallbackReason ? (
                      <div className="mt-3 rounded-sm border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                        {schoolDrawerHistorySummary.historyFallbackReason}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 rounded-sm border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Package History Context</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          This shows which package is the latest activity and which package is currently supplying renderable history detail.
                        </p>
                      </div>
                    </div>
                    {schoolIndicatorPackageRows.length === 0 ? (
                      <div className="mt-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        No package history exists yet for this school.
                      </div>
                    ) : (
                      <div className="mt-2 overflow-x-auto rounded-sm border border-slate-200">
                        <table className="min-w-[820px] w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                              <th className="border border-slate-300 px-2 py-2 text-left">Package</th>
                              <th className="border border-slate-300 px-2 py-2 text-left">School Year</th>
                              <th className="border border-slate-300 px-2 py-2 text-center">Status</th>
                              <th className="border border-slate-300 px-2 py-2 text-center">Indicator Rows</th>
                              <th className="border border-slate-300 px-2 py-2 text-center">History Role</th>
                              <th className="border border-slate-300 px-2 py-2 text-left">Submitted</th>
                              <th className="border border-slate-300 px-2 py-2 text-left">Reviewed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {schoolIndicatorPackageRows.map((row) => {
                              const matchingSubmission = schoolDrawerIndicatorSubmissions.find((submission) => submission.id === row.id);
                              const hasIndicatorRows = Array.isArray(matchingSubmission?.indicators) && matchingSubmission.indicators.length > 0;
                              const historyRole =
                                schoolDrawerHistorySummary?.latestRenderableSubmissionId === row.id
                                  ? "Matrix source"
                                  : schoolDrawerSubmissionSummary?.latestActivitySubmissionId === row.id
                                    ? "Latest activity"
                                    : "Historical only";

                              return (
                                <tr key={`monitor-history-package-${row.id}`} className="bg-white">
                                  <td className="border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-900">#{row.id}</td>
                                  <td className="border border-slate-300 px-2 py-2 text-xs text-slate-700">{row.schoolYear}</td>
                                  <td className="border border-slate-300 px-2 py-2 text-center">
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${workflowTone(row.status)}`}>
                                      {workflowLabel(row.status)}
                                    </span>
                                  </td>
                                  <td className="border border-slate-300 px-2 py-2 text-center text-xs text-slate-700">
                                    {hasIndicatorRows ? "Available" : "None"}
                                  </td>
                                  <td className="border border-slate-300 px-2 py-2 text-center text-xs text-slate-700">{historyRole}</td>
                                  <td className="border border-slate-300 px-2 py-2 text-xs text-slate-700">
                                    {row.submittedAt ? formatDateTime(row.submittedAt) : "N/A"}
                                  </td>
                                  <td className="border border-slate-300 px-2 py-2 text-xs text-slate-700">
                                    {row.reviewedAt ? formatDateTime(row.reviewedAt) : "N/A"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {schoolIndicatorMatrix.rows.length === 0 ? (
                    <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                      {isSchoolDrawerSubmissionsLoading
                        ? "Loading submitted indicators for this school..."
                        : schoolDrawerIndicatorSubmissions.length === 0
                          ? "No package history exists yet for this school."
                          : schoolDrawerHistorySummary?.historyFallbackReason
                            ?? "Packages exist, but none contain indicator rows for history rendering."}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-sm border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Indicator Matrix</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Currently representing package {schoolDrawerHistorySummary?.latestRenderableSubmissionId ? `#${schoolDrawerHistorySummary.latestRenderableSubmissionId}` : "history source unavailable"} for {schoolDrawerHistorySummary?.latestRenderableSchoolYear ?? (latestSchoolIndicatorYear || "N/A")}.
                          </p>
                        </div>
                        <div className="text-right text-[11px] text-slate-600">
                          <p>
                            {schoolDrawerHistorySummary?.latestRenderableSubmissionId === schoolDrawerHistorySummary?.latestHistoryPackageId
                              ? "Latest package includes renderable indicator rows."
                              : "Matrix is using the most recent package with indicator rows."}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 overflow-x-auto rounded-sm border border-slate-200">
                        <table className="min-w-[1080px] w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                              <th rowSpan={2} className="sticky left-0 z-20 min-w-[270px] border border-slate-300 bg-slate-100 px-2 py-2 text-left">
                              Indicators
                            </th>
                            {schoolIndicatorMatrix.years.map((year) => (
                              <th key={`monitor-indicator-year-${year}`} colSpan={2} className="border border-slate-300 px-2 py-2 text-center">
                                {year}
                              </th>
                            ))}
                          </tr>
                          <tr className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                            {schoolIndicatorMatrix.years.map((year) => (
                              <Fragment key={`monitor-indicator-year-columns-${year}`}>
                                <th className="border border-slate-300 px-2 py-2 text-center">Target</th>
                                <th className="border border-slate-300 px-2 py-2 text-center">Actual</th>
                              </Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {schoolIndicatorRowsByCategory.map((group) => (
                            <Fragment key={`monitor-indicator-category-${group.category}`}>
                              <tr className="bg-primary-50/70">
                                <td
                                  colSpan={schoolIndicatorMatrix.years.length * 2 + 1}
                                  className="border border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-wide text-primary-800"
                                >
                                  {group.category}
                                </td>
                              </tr>
                              {group.rows.map((row) => {
                                const rowId = `school-drawer-indicator-${sanitizeAnchorToken(row.key)}`;
                                const isExpanded = Boolean(expandedDrawerIndicatorRows[row.key]);
                                const shortLabel = truncateIndicatorDescription(row.label, 46);
                                const isHighlighted = highlightedDrawerIndicatorKey === row.key;
                                const isMissing = missingDrawerIndicatorKeySet.has(row.key);
                                const isReturned = returnedDrawerIndicatorKeySet.has(row.key);

                                return (
                                  <tr
                                    id={rowId}
                                    key={`monitor-indicator-row-${row.key}`}
                                    className={isHighlighted ? "bg-amber-50 transition-colors" : "bg-white"}
                                  >
                                    <td className="sticky left-0 z-10 min-w-[270px] border border-slate-300 bg-white px-2 py-2 align-top">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <button
                                          type="button"
                                          title={row.label}
                                          onClick={() => toggleDrawerIndicatorLabel(row.key)}
                                          className="text-left text-[12px] font-semibold leading-4 text-slate-900 hover:text-primary-700"
                                        >
                                          {isExpanded ? row.label : shortLabel}
                                        </button>
                                        {isMissing && (
                                          <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                            Missing
                                          </span>
                                        )}
                                        {isReturned && (
                                          <span className="inline-flex rounded-full border border-primary-300 bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">
                                            Returned
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => toggleDrawerIndicatorLabel(row.key)}
                                          className="rounded-sm border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100"
                                        >
                                          {isExpanded ? "Less" : "More"}
                                        </button>
                                      </div>
                                      <p className="mt-0.5 text-[10px] text-slate-500">{row.code}</p>
                                    </td>
                                    {schoolIndicatorMatrix.years.map((year) => {
                                      const values = row.valuesByYear[year] ?? { target: "", actual: "" };

                                      return (
                                        <Fragment key={`monitor-indicator-cell-${row.key}-${year}`}>
                                          <td className="border border-slate-300 bg-slate-50/40 px-2 py-2 text-center text-xs text-slate-700">
                                            {values.target || "-"}
                                          </td>
                                          <td className="border border-slate-300 bg-slate-50/40 px-2 py-2 text-center text-xs text-slate-700">
                                            {values.actual || "-"}
                                          </td>
                                        </Fragment>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </Fragment>
                          ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </article>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Select a school to view details.
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
