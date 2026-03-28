import { Fragment } from "react";
import { X } from "lucide-react";
import type { MonitorTopNavigatorId } from "@/pages/monitor/monitorFilters";
import type { SchoolDrawerTab } from "@/pages/monitor/useSchoolDrawer";
import type { IndicatorSubmission } from "@/types";

interface SchoolDetailSnapshot {
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
  region: string;
  level: string;
  type: string;
  address: string;
  hasComplianceRecord: boolean;
  indicatorStatus: string | null;
  missingCount: number;
  awaitingReviewCount: number;
  lastActivityAt: string | null;
  reportedStudents: number;
  reportedTeachers: number;
  synchronizedStudents: number;
  synchronizedTeachers: number;
}

interface SchoolIndicatorPackageRow {
  id: string;
  schoolYear: string;
  reportingPeriod: string;
  status: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  complianceRatePercent: number | null;
  reviewedBy: string;
}

interface IndicatorMatrixRowCell {
  target: string;
  actual: string;
}

interface IndicatorMatrixRow {
  key: string;
  code: string;
  label: string;
  category: string;
  sortOrder: number;
  valuesByYear: Record<string, IndicatorMatrixRowCell>;
}

interface SchoolDrawerCriticalAlert {
  id: string;
  tone: "warning" | "info";
  title: string;
  detail: string;
}

interface MonitorSchoolDrawerProps {
  isOpen: boolean;
  showNavigatorManual: boolean;
  isMobileViewport: boolean;
  activeTopNavigator: MonitorTopNavigatorId;
  schoolDetail: SchoolDetailSnapshot | null;
  activeSchoolDrawerTab: SchoolDrawerTab;
  setActiveSchoolDrawerTab: (tab: SchoolDrawerTab) => void;
  closeSchoolDrawer: () => void;
  handleJumpToMissingIndicators: () => void;
  handleJumpToReturnedIndicators: () => void;
  missingDrawerIndicatorKeys: string[];
  returnedDrawerIndicatorKeys: string[];
  syncedCountsLoadingSchoolKey: string | null;
  syncedCountsError: string;
  schoolDrawerCriticalAlerts: SchoolDrawerCriticalAlert[];
  schoolIndicatorPackageRows: SchoolIndicatorPackageRow[];
  latestSchoolPackage: SchoolIndicatorPackageRow | null;
  isSchoolDrawerSubmissionsLoading: boolean;
  schoolDrawerSubmissionsError: string;
  schoolIndicatorMatrix: {
    years: string[];
    rows: IndicatorMatrixRow[];
    latestSubmission: IndicatorSubmission | null;
  };
  latestSchoolIndicatorYear: string;
  schoolDrawerIndicatorSubmissions: IndicatorSubmission[];
  schoolIndicatorRowsByCategory: Array<{ category: string; rows: IndicatorMatrixRow[] }>;
  expandedDrawerIndicatorRows: Record<string, boolean>;
  highlightedDrawerIndicatorKey: string | null;
  missingDrawerIndicatorKeySet: Set<string>;
  returnedDrawerIndicatorKeySet: Set<string>;
  toggleDrawerIndicatorLabel: (key: string) => void;
  workflowTone: (status: string | null) => string;
  workflowLabel: (status: string | null) => string;
  formatDateTime: (value: string) => string;
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
  isOpen,
  showNavigatorManual,
  isMobileViewport,
  activeTopNavigator,
  schoolDetail,
  activeSchoolDrawerTab,
  setActiveSchoolDrawerTab,
  closeSchoolDrawer,
  handleJumpToMissingIndicators,
  handleJumpToReturnedIndicators,
  missingDrawerIndicatorKeys,
  returnedDrawerIndicatorKeys,
  syncedCountsLoadingSchoolKey,
  syncedCountsError,
  schoolDrawerCriticalAlerts,
  schoolIndicatorPackageRows,
  latestSchoolPackage,
  isSchoolDrawerSubmissionsLoading,
  schoolDrawerSubmissionsError,
  schoolIndicatorMatrix,
  latestSchoolIndicatorYear,
  schoolDrawerIndicatorSubmissions,
  schoolIndicatorRowsByCategory,
  expandedDrawerIndicatorRows,
  highlightedDrawerIndicatorKey,
  missingDrawerIndicatorKeySet,
  returnedDrawerIndicatorKeySet,
  toggleDrawerIndicatorLabel,
  workflowTone,
  workflowLabel,
  formatDateTime,
}: MonitorSchoolDrawerProps) {
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
                    {syncedCountsLoadingSchoolKey === schoolDetail.schoolKey ? (
                      <p className="text-[11px] text-slate-500">Refreshing synced totals...</p>
                    ) : syncedCountsError ? (
                      <p className="text-[11px] text-amber-700">{syncedCountsError}</p>
                    ) : null}
                    <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Compliance</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.hasComplianceRecord ? "Submitted" : "Missing"}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Package</p>
                        <p className="text-sm font-semibold text-slate-900">{workflowLabel(schoolDetail.indicatorStatus)}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">Missing</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.missingCount.toLocaleString()}</p>
                      </div>
                      <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <p className="text-[11px] text-slate-600">For Review</p>
                        <p className="text-sm font-semibold text-slate-900">{schoolDetail.awaitingReviewCount.toLocaleString()}</p>
                      </div>
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
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Latest Package</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Most recent indicator submission for this school.</p>
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
                    {latestSchoolPackage ? (
                      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">Package</p>
                          <p className="text-sm font-semibold text-slate-900">#{latestSchoolPackage.id}</p>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">School Year</p>
                          <p className="text-sm font-semibold text-slate-900">{latestSchoolPackage.schoolYear}</p>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">Status</p>
                          <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${workflowTone(latestSchoolPackage.status)}`}>
                            {workflowLabel(latestSchoolPackage.status)}
                          </span>
                        </div>
                        <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5">
                          <p className="text-[11px] text-slate-600">Compliance</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {latestSchoolPackage.complianceRatePercent === null
                              ? "N/A"
                              : `${latestSchoolPackage.complianceRatePercent.toFixed(2)}%`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        No indicator package submitted yet for this school.
                      </div>
                    )}
                  </article>

                  <article className="rounded-sm border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Submission Table</p>
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
                      <p className="mt-0.5 text-[11px] text-slate-500">Compact view. Hover or expand for full descriptions.</p>
                    </div>
                    <div className="text-right text-[11px] text-slate-600">
                      <p>
                        Latest package: <span className="font-semibold text-slate-900">{schoolIndicatorMatrix.latestSubmission ? `#${schoolIndicatorMatrix.latestSubmission.id}` : "N/A"}</span>
                      </p>
                      <p>
                        Focus year: <span className="font-semibold text-slate-900">{latestSchoolIndicatorYear || "N/A"}</span>
                      </p>
                    </div>
                  </div>

                  {schoolIndicatorMatrix.rows.length === 0 ? (
                    <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                      {isSchoolDrawerSubmissionsLoading
                        ? "Loading submitted indicators for this school..."
                        : schoolDrawerIndicatorSubmissions.length === 0
                          ? "No indicator package submitted yet for this school."
                          : "Indicator package exists, but no indicator rows were found in the latest submission."}
                    </div>
                  ) : (
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
