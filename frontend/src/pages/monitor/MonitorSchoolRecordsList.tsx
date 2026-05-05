import { AlertCircle, Building2 } from "lucide-react";
import type { SchoolQuickPreset, RequirementFilter } from "@/pages/monitor/monitorFilters";
import type { SchoolRecord, SchoolStatus } from "@/types";

export interface MonitorSchoolRequirementSummary {
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
  region: string;
  schoolStatus: SchoolStatus | null;
  hasComplianceRecord: boolean;
  indicatorStatus: string | null;
  hasAnySubmitted: boolean;
  isComplete: boolean;
  awaitingReviewCount: number;
  missingCount: number;
  lastActivityAt: string | null;
  lastActivityTime: number;
}

export interface MonitorSchoolRecordsListRow {
  summary: MonitorSchoolRequirementSummary;
  record: SchoolRecord | null;
}

export interface MonitorSchoolRecordsListProps {
  showLoadingSkeleton: boolean;
  compactSchoolRowsCount: number;
  suppressEmptyState?: boolean;
  paginatedRows: MonitorSchoolRecordsListRow[];
  statusFilter: SchoolStatus | "all";
  requirementFilter: RequirementFilter;
  schoolQuickPreset: SchoolQuickPreset;
  safeRecordsPage: number;
  totalRecordPages: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onResetQueueFilters: () => void;
  onClearAllFilters: () => void;
  onToggleStatusFilter: (status: SchoolStatus) => void;
  onToggleRequirementFilter: (filter: Exclude<RequirementFilter, "all">) => void;
  onToggleSchoolQuickPreset: (preset: Exclude<SchoolQuickPreset, "all">) => void;
  onOpenSchool: (summary: MonitorSchoolRequirementSummary) => void;
  onReviewSchool: (summary: MonitorSchoolRequirementSummary) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  formatDateTime: (value: string) => string;
  statusTone: (status: SchoolStatus) => string;
  statusLabel: (status: SchoolStatus) => string;
  isUrgentRequirement: (summary: MonitorSchoolRequirementSummary) => boolean;
  urgencyRowTone: (summary: MonitorSchoolRequirementSummary) => string;
}

export function MonitorSchoolRecordsList({
  showLoadingSkeleton,
  compactSchoolRowsCount,
  suppressEmptyState = false,
  paginatedRows,
  statusFilter,
  requirementFilter,
  schoolQuickPreset,
  safeRecordsPage,
  totalRecordPages,
  canGoPrevious,
  canGoNext,
  onResetQueueFilters,
  onClearAllFilters,
  onToggleStatusFilter,
  onToggleRequirementFilter,
  onToggleSchoolQuickPreset,
  onOpenSchool,
  onReviewSchool,
  onPreviousPage,
  onNextPage,
  formatDateTime,
  statusTone,
  statusLabel,
  isUrgentRequirement,
  urgencyRowTone,
}: MonitorSchoolRecordsListProps) {
  if (showLoadingSkeleton) {
    return (
      <div className="space-y-3 px-5 py-5">
        <div className="skeleton-line h-4 w-48" />
        <div className="grid gap-2">
          <div className="skeleton-line h-12 w-full" />
          <div className="skeleton-line h-12 w-full" />
          <div className="skeleton-line h-12 w-full" />
          <div className="skeleton-line h-12 w-full" />
        </div>
        <p className="text-xs text-slate-500">Syncing data from the backend...</p>
      </div>
    );
  }

  if (compactSchoolRowsCount === 0 && !suppressEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-14 text-slate-500">
        <AlertCircle className="h-9 w-9 text-slate-400" />
        <p className="text-sm font-semibold">No records found</p>
        <p className="text-xs text-slate-400">Current filters may be hiding school records.</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onResetQueueFilters}
            className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
          >
            Reset queue filters
          </button>
          <button
            type="button"
            onClick={onClearAllFilters}
            className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-semibold text-primary-700"
          >
            Clear all
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 px-4 py-4">
        {paginatedRows.map(({ summary, record }) => {
          const schoolKey = summary.schoolKey;
          const rowStatus = summary.schoolStatus ?? "pending";
          const rowTone = isUrgentRequirement(summary) ? urgencyRowTone(summary) : "bg-white";
          const updatedLabel = summary.lastActivityAt ?? record?.lastUpdated ?? null;
          const statusPillPressed = statusFilter === rowStatus;
          const queuePill = (() => {
            if (!summary.hasComplianceRecord && !summary.hasAnySubmitted) {
              return {
                label: "No submission",
                title: "Click to filter preset: No submission",
                pressed: schoolQuickPreset === "no_submission",
                onClick: () => onToggleSchoolQuickPreset("no_submission"),
                className: "border border-slate-300 bg-slate-100 text-slate-700",
              };
            }

            if (summary.indicatorStatus === "returned") {
              return {
                label: "Returned",
                title: "Click to filter queue: Returned",
                pressed: requirementFilter === "returned",
                onClick: () => onToggleRequirementFilter("returned"),
                className: "border border-amber-200 bg-amber-50 text-amber-700",
              };
            }

            if (summary.awaitingReviewCount > 0) {
              return {
                label: `Review ${summary.awaitingReviewCount}`,
                title: "Click to filter queue: For review",
                pressed: requirementFilter === "waiting",
                onClick: () => onToggleRequirementFilter("waiting"),
                className: "border border-primary-200 bg-primary-50 text-primary-700",
              };
            }

            if (summary.missingCount > 0) {
              return {
                label: `Missing ${summary.missingCount}`,
                title: "Click to filter queue: Missing",
                pressed: requirementFilter === "missing",
                onClick: () => onToggleRequirementFilter("missing"),
                className: "border border-rose-200 bg-rose-50 text-rose-700",
              };
            }

            return {
              label: "OK",
              title: "No missing/returned/for-review items.",
              pressed: false,
              onClick: null as (() => void) | null,
              className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
            };
          })();

          return (
            <article key={schoolKey} className={`relative overflow-hidden rounded-sm border border-slate-200 p-3 ${rowTone}`}>
              {(summary.indicatorStatus === "returned" || summary.missingCount > 0) && (
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-1 ${
                    summary.indicatorStatus === "returned" ? "bg-amber-300" : "bg-rose-300"
                  }`}
                />
              )}
              <div className="relative z-10 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{summary.schoolName}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {summary.schoolCode} | {summary.region}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      title={statusPillPressed ? "Click to clear status filter" : "Click to filter by this school status"}
                      aria-pressed={statusPillPressed}
                      onClick={() => onToggleStatusFilter(rowStatus)}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition hover:opacity-95 ${
                        statusPillPressed ? "ring-2 ring-primary-200 ring-offset-1" : ""
                      } ${statusTone(rowStatus)}`}
                    >
                      {statusLabel(rowStatus)}
                    </button>
                    {queuePill.label !== "OK" &&
                      (queuePill.onClick ? (
                        <button
                          type="button"
                          title={`${queuePill.title} (Shift+click to open in Reviews)`}
                          aria-pressed={queuePill.pressed}
                          onClick={(event) => {
                            if (event.shiftKey) {
                              onReviewSchool(summary);
                              return;
                            }
                            queuePill.onClick?.();
                          }}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition hover:opacity-95 ${
                            queuePill.pressed ? "ring-2 ring-primary-200 ring-offset-1" : ""
                          } ${queuePill.className}`}
                        >
                          {queuePill.label}
                        </button>
                      ) : (
                        <span
                          title={queuePill.title}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${queuePill.className}`}
                        >
                          {queuePill.label}
                        </span>
                      ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0 sm:self-start">
                  <span
                    title="Last activity time"
                    className="inline-flex whitespace-nowrap rounded-sm border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 tabular-nums"
                  >
                    {updatedLabel ? formatDateTime(updatedLabel) : "N/A"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenSchool(summary)}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Open
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs text-slate-600">
          Page <span className="font-semibold text-slate-900">{safeRecordsPage}</span> of{" "}
          <span className="font-semibold text-slate-900">{totalRecordPages}</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPreviousPage}
            disabled={!canGoPrevious}
            className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={onNextPage}
            disabled={!canGoNext}
            className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
