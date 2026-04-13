import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CircleHelp,
  ClipboardList,
  Database,
  FilterX,
  LayoutDashboard,
  RefreshCw,
} from "lucide-react";
import { DashboardHelpDialog } from "@/components/DashboardHelpDialog";
import { Shell } from "@/components/Shell";
import { SchoolIndicatorPanel } from "@/components/indicators/SchoolIndicatorPanel";
import { useAuth } from "@/context/Auth";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import { runRefreshBatches } from "@/lib/runRefreshBatches";
import type { IndicatorSubmission } from "@/types";

/* ── Quick-jump targets ── */
interface QuickJumpItem {
  id: string;
  label: string;
  targetId: string;
}

const QUICK_JUMPS: QuickJumpItem[] = [
  { id: "today_focus", label: "Today Focus", targetId: "compact-kpi" },
  { id: "school_info", label: "School Info", targetId: "school-info" },
  { id: "task_kpis", label: "Task KPIs", targetId: "compact-kpi" },
  { id: "summary_inputs", label: "Summary Inputs", targetId: "file-reports" },
  { id: "indicator_workflow", label: "Indicator Workflow", targetId: "imeta-compliance" },
];

/* ── Helpers ── */
function latestSubmission<T extends { updatedAt: string | null; createdAt: string | null }>(entries: T[]): T | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => {
    const aDate = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bDate = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return bDate - aDate;
  });
  return sorted[0] ?? null;
}

function submissionStatusLabel(status: string | null | undefined): string {
  if (status === "validated") return "Validated";
  if (status === "submitted") return "Submitted";
  if (status === "returned") return "Needs Revision";
  return "Draft";
}

function statusChipTone(status: string | null | undefined): string {
  if (status === "validated") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (status === "submitted") return "border-primary-300 bg-primary-50 text-primary-700";
  if (status === "returned") return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-slate-300 bg-slate-50 text-slate-600";
}

function uploadChipTone(uploaded: boolean): string {
  return uploaded
    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
    : "border-slate-300 bg-slate-50 text-slate-600";
}

const MOBILE_BREAKPOINT = 768;

/* ── Component ── */
export function SchoolAdminDashboard() {
  const { user } = useAuth();
  const { records, error, lastSyncedAt, syncScope, syncStatus, refreshRecords } = useData();
  const {
    submissions: indicatorSubmissionSnapshot,
    allSubmissions,
    academicYears,
    refreshSubmissions,
  } = useIndicatorData();

  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [contextAcademicYearId, setContextAcademicYearId] = useState("all");
  const [contextWorkflowStatus, setContextWorkflowStatus] = useState<
    "all" | "draft" | "submitted" | "returned" | "validated"
  >("all");
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [openReportPreviewId, setOpenReportPreviewId] = useState<"bmef" | "smea" | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < MOBILE_BREAKPOINT,
  );
  const initialLoadStartedRef = useRef(false);

  /* ── Derived data ── */
  const indicatorSubmissions = useMemo(
    () =>
      allSubmissions.length > 0 || indicatorSubmissionSnapshot.length === 0
        ? allSubmissions
        : indicatorSubmissionSnapshot,
    [allSubmissions, indicatorSubmissionSnapshot],
  );

  const assignedRecord = records[0] ?? null;
  const schoolName = assignedRecord?.schoolName || user?.schoolName || "Unassigned School";
  const schoolCode = assignedRecord?.schoolCode || user?.schoolCode || "N/A";
  const schoolRegion = assignedRecord?.region || "N/A";
  const latestIndicators: IndicatorSubmission | null = useMemo(
    () => latestSubmission(indicatorSubmissions),
    [indicatorSubmissions],
  );

  const bmefFile = latestIndicators?.files?.bmef ?? null;
  const smeaFile = latestIndicators?.files?.smea ?? null;
  const bmefUploaded = bmefFile?.uploaded === true;
  const smeaUploaded = smeaFile?.uploaded === true;

  const completedIndicators = latestIndicators?.summary?.metIndicators ?? 0;
  const totalIndicators = latestIndicators?.summary?.totalIndicators ?? 0;

  const currentAcademicYearOption = useMemo(
    () => academicYears.find((y) => y.isCurrent) ?? academicYears[0] ?? null,
    [academicYears],
  );
  const hasContextOverrides = contextAcademicYearId !== "all" || contextWorkflowStatus !== "all";

  /* ── Refresh ── */
  const runDashboardRefresh = useCallback(
    async () => runRefreshBatches([[refreshRecords], [refreshSubmissions]]),
    [refreshRecords, refreshSubmissions],
  );

  const handleRefreshAll = useCallback(async () => {
    if (isRefreshingAll) return;
    setIsRefreshingAll(true);
    try {
      await runDashboardRefresh();
    } finally {
      setIsRefreshingAll(false);
    }
  }, [isRefreshingAll, runDashboardRefresh]);

  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
    let active = true;
    setIsRefreshingAll(true);
    void runDashboardRefresh().finally(() => {
      if (active) setIsRefreshingAll(false);
    });
    return () => {
      active = false;
    };
  }, [runDashboardRefresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsMobileViewport(window.innerWidth < MOBILE_BREAKPOINT);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  /* ── Context presets ── */
  const applyContextPreset = (preset: "current_year" | "needs_revision" | "all_submission") => {
    if (preset === "current_year") {
      if (currentAcademicYearOption) setContextAcademicYearId(currentAcademicYearOption.id);
      return;
    }
    if (preset === "needs_revision") {
      setContextWorkflowStatus("returned");
      return;
    }
    setContextAcademicYearId("all");
    setContextWorkflowStatus("all");
  };

  const isPresetActive = (preset: "current_year" | "needs_revision" | "all_submission") => {
    if (preset === "current_year")
      return Boolean(currentAcademicYearOption && contextAcademicYearId === currentAcademicYearOption.id);
    if (preset === "needs_revision") return contextWorkflowStatus === "returned";
    return !hasContextOverrides;
  };

  const clearTopContext = () => {
    setContextAcademicYearId("all");
    setContextWorkflowStatus("all");
    setFocusedSectionId(null);
  };

  /* ── Quick-jump scroll ── */
  const scrollToSection = (sectionId: string) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setFocusedSectionId(sectionId);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        setFocusedSectionId((cur) => (cur === sectionId ? null : cur));
      }, 3000);
    }
  };

  const focusCls = (id: string) => (focusedSectionId === id ? "dashboard-focus-glow" : "");

  const presetBtnCls = (active: boolean) =>
    `rounded-sm border px-2.5 py-1 text-xs font-semibold transition ${
      active
        ? "border-primary-300 bg-primary-50 text-primary-700"
        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
    }`;

  /* ── Render ── */
  return (
    <Shell
      title="School Head Dashboard"
      subtitle=""
      actions={
        <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-sm border border-white/20 bg-white/10 p-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => void handleRefreshAll()}
            disabled={isRefreshingAll}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-white text-primary-700 shadow-sm transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
            aria-label="Refresh dashboard data"
            title="Refresh all data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingAll ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowHelpDialog(true)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-white text-primary-700 shadow-sm transition hover:bg-white/90"
            aria-label="Open quick guide"
            title="Help"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
          <span className="hidden max-w-[17rem] items-center truncate text-[11px] font-medium text-primary-100 sm:inline-flex lg:max-w-[21rem]">
            {syncStatus === "up_to_date" ? "Up to date" : "Updated"}
            {" | "}
            {lastSyncedAt
              ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Not synced"}
            {syncScope ? ` | ${syncScope}` : ""}
          </span>
        </div>
      }
    >
      {error && (
        <section className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </section>
      )}

      <DashboardHelpDialog open={showHelpDialog} variant="school_head" onClose={() => setShowHelpDialog(false)} />

      {/* ── Merged Control Bar ── */}
      <section className="mb-4 rounded-sm border border-slate-200 bg-white/95">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <div className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-slate-50 p-0.5">
            <button type="button" onClick={() => applyContextPreset("current_year")} className={presetBtnCls(isPresetActive("current_year"))}>
              Current
            </button>
            <button type="button" onClick={() => applyContextPreset("needs_revision")} className={presetBtnCls(isPresetActive("needs_revision"))}>
              Revision
            </button>
            <button type="button" onClick={() => applyContextPreset("all_submission")} className={presetBtnCls(isPresetActive("all_submission"))}>
              All
            </button>
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-600">Year:</span>
            <select
              value={contextAcademicYearId}
              onChange={(e) => setContextAcademicYearId(e.target.value)}
              className="rounded-sm border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            >
              <option value="all">All years</option>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                  {year.isCurrent ? " (Current)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-600">Status:</span>
            <select
              value={contextWorkflowStatus}
              onChange={(e) =>
                setContextWorkflowStatus(e.target.value as typeof contextWorkflowStatus)
              }
              className="rounded-sm border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="returned">Needs Revision</option>
              <option value="validated">Validated</option>
            </select>
          </label>

          <button
            type="button"
            onClick={clearTopContext}
            disabled={!hasContextOverrides}
            className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FilterX className="h-3 w-3" />
            Clear
          </button>
        </div>

        {/* Quick Navigation */}
        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2">
          <span className="shrink-0 text-[11px] font-semibold text-slate-500">Quick Navigation →</span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_JUMPS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.targetId)}
                className={`inline-flex items-center rounded-sm border px-2 py-1 text-[11px] font-semibold transition ${
                  focusedSectionId === item.targetId
                    ? "border-primary-300 bg-primary-50 text-primary-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Compact KPI Row ── */}
      <section id="compact-kpi" className={`mb-4 ${focusCls("compact-kpi")}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold ${statusChipTone(latestIndicators?.status)}`}
          >
            School Achievements
            <span className="rounded-sm bg-white/60 px-1 py-0.5 text-[10px]">
              {submissionStatusLabel(latestIndicators?.status)}
            </span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold ${statusChipTone(latestIndicators?.status)}`}
          >
            Key Performance
            <span className="rounded-sm bg-white/60 px-1 py-0.5 text-[10px]">
              {submissionStatusLabel(latestIndicators?.status)}
            </span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold ${uploadChipTone(bmefUploaded)}`}
          >
            BMEF
            <span className="rounded-sm bg-white/60 px-1 py-0.5 text-[10px]">
              {bmefUploaded ? "Uploaded" : "Pending"}
            </span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold ${uploadChipTone(smeaUploaded)}`}
          >
            SMEA
            <span className="rounded-sm bg-white/60 px-1 py-0.5 text-[10px]">
              {smeaUploaded ? "Uploaded" : "Pending"}
            </span>
          </span>
        </div>
      </section>

      {/* ── School Info ── */}
      <section id="school-info" className={`mb-4 grid gap-2 md:grid-cols-3 ${focusCls("school-info")}`}>
        <article className="rounded-sm border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Assigned School</p>
          <p className="text-sm font-bold text-slate-900">{schoolName}</p>
        </article>
        <article className="rounded-sm border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">School Code</p>
          <p className="text-sm font-bold text-slate-900">{schoolCode}</p>
        </article>
        <article className="rounded-sm border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Region</p>
          <p className="text-sm font-bold text-slate-900">{schoolRegion}</p>
        </article>
      </section>

      {/* ── File Reports ── */}
      <section id="file-reports" className={`mb-5 ${focusCls("file-reports")}`}>
        <h2 className="mb-6 text-lg font-semibold text-gray-900">FILE REPORTS</h2>

        {([
          {
            id: "bmef" as const,
            name: "BMEF Report",
            isSubmitted: bmefUploaded,
            fileName: bmefFile?.originalFilename ?? null,
            dateSubmitted: bmefFile?.uploadedAt ? new Date(bmefFile.uploadedAt).toLocaleDateString() : null,
            uploadLabel: "Upload BMEF Report",
          },
          {
            id: "smea" as const,
            name: "SMEA Report",
            isSubmitted: smeaUploaded,
            fileName: smeaFile?.originalFilename ?? null,
            dateSubmitted: smeaFile?.uploadedAt ? new Date(smeaFile.uploadedAt).toLocaleDateString() : null,
            uploadLabel: "Upload SMEA Report",
          },
        ]).map((report) => {
          const isPreviewOpen = openReportPreviewId === report.id;

          return (
            <div key={report.id} className="mb-6 rounded-xl border border-gray-200 p-8">
              <h3 className="text-base font-semibold text-gray-900">{report.name}</h3>

              <div className="mt-6 space-y-4">
                <div className="flex items-start">
                  <span className="w-40 shrink-0 text-sm font-medium text-gray-500">Status:</span>
                  <div className="text-base font-semibold text-gray-900">
                    {report.isSubmitted ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                        Submitted
                      </span>
                    ) : (
                      <span className="text-gray-500">Not uploaded yet</span>
                    )}
                  </div>
                </div>

                <div className="flex items-start">
                  <span className="w-40 shrink-0 text-sm font-medium text-gray-500">Submitted file:</span>
                  <span className="text-base font-semibold text-gray-900">
                    {report.isSubmitted && report.fileName ? report.fileName : "— (none)"}
                  </span>
                </div>

                <div className="flex items-start">
                  <span className="w-40 shrink-0 text-sm font-medium text-gray-500">Date submitted:</span>
                  <span className="text-base font-semibold text-gray-900">
                    {report.isSubmitted && report.dateSubmitted ? report.dateSubmitted : "—"}
                  </span>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                {report.isSubmitted ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenReportPreviewId((prev) => (prev === report.id ? null : report.id))
                      }
                      className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      View File
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Re-upload
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {report.uploadLabel}
                  </button>
                )}
              </div>

              {report.isSubmitted && isPreviewOpen && (
                <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-6">
                  <p className="mb-4 text-base font-semibold text-gray-900">{report.name} — Preview</p>
                  <div className="mb-4 flex h-80 items-center justify-center rounded-lg border border-gray-300 bg-white text-sm text-gray-400">
                    [Inline file preview area - placeholder div with border]
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenReportPreviewId(null)}
                    className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Close Preview
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ── I-META Compliance Indicators ── */}
      <section id="imeta-compliance" className={focusCls("imeta-compliance")}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
              I-META Compliance Indicators
            </h2>
            {totalIndicators > 0 && (
              <p className="mt-0.5 text-xs text-slate-500">
                {completedIndicators}/{totalIndicators} complete
              </p>
            )}
          </div>
        </div>
        <SchoolIndicatorPanel
          statusFilter={contextWorkflowStatus}
          academicYearFilter={contextAcademicYearId}
        />
      </section>
    </Shell>
  );
}
