import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CircleHelp,
  ClipboardList,
  Database,
  Download,
  Eye,
  LayoutDashboard,
  RefreshCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { DashboardHelpDialog } from "@/components/DashboardHelpDialog";
import { Shell } from "@/components/Shell";
import { SchoolIndicatorPanel } from "@/components/indicators/SchoolIndicatorPanel";
import { useAuth } from "@/context/Auth";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import { runRefreshBatches } from "@/lib/runRefreshBatches";
import type {
  IndicatorSubmission,
  IndicatorSubmissionFileEntry,
  IndicatorSubmissionFileType,
  IndicatorSubmissionItem,
} from "@/types";

/* ── Quick-jump targets ── */
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

function normalizeFileExtension(filename: string | null | undefined): string {
  const value = String(filename ?? "").trim().toLowerCase();
  if (!value.includes(".")) return "";
  return value.slice(value.lastIndexOf(".") + 1);
}

function normalizeMetricLookupKey(label: string | null | undefined): string {
  return String(label ?? "").trim().toLowerCase();
}

function isFinalizedSubmissionStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "submitted" || normalized === "validated";
}

function selectedYearLabel(
  yearId: string,
  years: Array<{ id: string; name: string }>,
  fallback: string,
): string {
  if (!yearId || yearId === "all") {
    return fallback;
  }

  return years.find((year) => year.id === yearId)?.name ?? fallback;
}

const MOBILE_BREAKPOINT = 768;
const SCHOOL_ACHIEVEMENT_ROWS = [
  "NAME OF SCHOOL HEAD",
  "TOTAL NUMBER OF ENROLMENT",
  "SBM LEVEL OF PRACTICE",
  "Pupil/Student Classroom Ratio (Kindergarten)",
  "Pupil/Student Classroom Ratio (Grades 1 to 3)",
  "Pupil/Student Classroom Ratio (Grades 4 to 6)",
  "Pupil/Student Classroom Ratio (Grades 7 to 10)",
  "Pupil/Student Classroom Ratio (Grades 11 to 12)",
  "Water and Sanitation facility to pupil ratio",
  "Number of Comfort rooms",
  "a. Toilet bowl",
  "b. Urinal",
  "Handwashing Facilities",
  "Ideal learning materials to learner ratio",
  "Pupil/student seat ratio (Overall)",
  "a. Kindergarten",
  "b. Grades 1 - 6",
  "c. Grades 7 - 10",
  "d. Grades 11 - 12",
  "ICT Package/E-classroom package to sections ratio",
  "a. ICT Laboratory",
  "Science Laboratory",
  "Do you have internet access? (Y/N)",
  "Do you have electricity (Y/N)",
  "Do you have a complete fence/gate? (Evident/Partially/Not Evident)",
  "No. of Teachers",
  "a. Male",
  "b. Female",
  "Teachers with Physical Disability",
  "a. Male",
  "b. Female",
  "Functional SGC",
  "School-Based Feeding Program Beneficiaries",
  "School-Managed Canteen (Annual income)",
  "Teachers Cooperative Managed Canteen - if there is (Annual income)",
  "Security and Safety (Contingency Plan)",
  "a. Earthquake",
  "b. Typhoon",
  "c. COVID-19",
  "d. Power interruption",
  "e. In-person classes",
  "No. of Teachers trained on Psychological First Aid (PFA)",
  "No. of Teachers trained on Occupational First Aid",
];

const KPI_ROWS = [
  "Net Enrollment Rate (NER)",
  "Retention Rate (RR)",
  "Drop-out Rate (DR)",
  "Transition Rate (TR)",
  "Net Intake Rate (NIR)",
  "Participation Rate (PR)",
  "ALS Completion Rate",
  "Gender Parity Index (GPI)",
  "Interquartile Ratio (IQR)",
  "Completion Rate (CR)",
  "Cohort Survival Rate (CSR)",
  "Learning Mastery: Nearly Proficient",
  "Learning Mastery: Proficient",
  "Learning Mastery: Highly Proficient",
  "A&E Test Pass Rate",
  "Learners Reporting School Violence",
  "Learner Satisfaction",
  "Learners Aware of Education Rights",
  "Schools/LCs Manifesting RBE Indicators",
];

function isSubItemMetric(label: string): boolean {
  return /^[a-e]\.\s/i.test(label);
}

/* ── Component ── */
export function SchoolAdminDashboard() {
  const { user } = useAuth();
  const { records, error, lastSyncedAt, syncScope, syncStatus, refreshRecords } = useData();
  const {
    submissions: indicatorSubmissionSnapshot,
    allSubmissions,
    academicYears,
    downloadSubmissionFile,
    listSubmissions,
    refreshSubmissions,
  } = useIndicatorData();

  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [contextAcademicYearId, setContextAcademicYearId] = useState("all");
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [activeReportModalType, setActiveReportModalType] = useState<IndicatorSubmissionFileType | null>(null);
  const [reportZoomLevel, setReportZoomLevel] = useState(1);
  const [yearScopedSubmission, setYearScopedSubmission] = useState<IndicatorSubmission | null>(null);
  const [isYearScopedLoading, setIsYearScopedLoading] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < MOBILE_BREAKPOINT,
  );
  const initialLoadStartedRef = useRef(false);
  const initialAcademicYearAppliedRef = useRef(false);
  const yearScopedRequestRef = useRef(0);

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
  const selectedSchoolId = String(user?.schoolId ?? "").trim();

  const currentAcademicYearOption = useMemo(
    () => academicYears.find((y) => y.isCurrent) ?? academicYears[0] ?? null,
    [academicYears],
  );
  const effectiveAcademicYearId = contextAcademicYearId;
  const latestIndicatorsForImeta: IndicatorSubmission | null = useMemo(
    () => latestSubmission(indicatorSubmissions),
    [indicatorSubmissions],
  );

  const bmefFile = yearScopedSubmission?.files?.bmef ?? null;
  const smeaFile = yearScopedSubmission?.files?.smea ?? null;

  const completedIndicators = latestIndicatorsForImeta?.summary?.metIndicators ?? 0;
  const totalIndicators = latestIndicatorsForImeta?.summary?.totalIndicators ?? 0;
  const activeReportFileEntry: IndicatorSubmissionFileEntry | null = useMemo(() => {
    if (!activeReportModalType || !yearScopedSubmission?.files) return null;
    return yearScopedSubmission.files[activeReportModalType] ?? null;
  }, [activeReportModalType, yearScopedSubmission]);
  const activeReportFileName = activeReportFileEntry?.originalFilename ?? null;
  const activeReportExtension = normalizeFileExtension(activeReportFileName);
  const activeSchoolYearLabel = selectedYearLabel(
    effectiveAcademicYearId,
    academicYears.map((year) => ({ id: year.id, name: year.name })),
    currentAcademicYearOption?.name ?? "N/A",
  );
  const targetsMetYearLabel = selectedYearLabel(
    effectiveAcademicYearId,
    academicYears.map((year) => ({ id: year.id, name: year.name })),
    currentAcademicYearOption?.name ?? "N/A",
  );
  const selectedYearIndicators = useMemo<IndicatorSubmissionItem[]>(
    () => yearScopedSubmission?.indicators ?? [],
    [yearScopedSubmission],
  );
  const selectedYearIndicatorsByMetric = useMemo(() => {
    const entries = selectedYearIndicators.map((item) => [
      normalizeMetricLookupKey(item.metric?.name),
      item,
    ] as const);
    return new Map<string, IndicatorSubmissionItem>(entries);
  }, [selectedYearIndicators]);
  const submittedIndicatorRows = useMemo(
    () => yearScopedSubmission?.indicators ?? [],
    [yearScopedSubmission],
  );

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

  useEffect(() => {
    if (initialAcademicYearAppliedRef.current) return;
    if (!currentAcademicYearOption?.id) return;
    setContextAcademicYearId(currentAcademicYearOption.id);
    initialAcademicYearAppliedRef.current = true;
  }, [currentAcademicYearOption]);

  useEffect(() => {
    if (!selectedSchoolId) {
      setYearScopedSubmission(null);
      setIsYearScopedLoading(false);
      return;
    }

    const requestId = yearScopedRequestRef.current + 1;
    yearScopedRequestRef.current = requestId;
    setIsYearScopedLoading(true);
    setYearScopedSubmission(null);
    setActiveReportModalType(null);

    void listSubmissions({
      schoolId: selectedSchoolId,
      academicYearId: effectiveAcademicYearId === "all" ? undefined : effectiveAcademicYearId,
      page: 1,
      perPage: 25,
    })
      .then((result) => {
        if (yearScopedRequestRef.current !== requestId) return;
        const finalized = result.data.find((submission) => isFinalizedSubmissionStatus(submission.status));
        setYearScopedSubmission(finalized ?? null);
      })
      .catch(() => {
        if (yearScopedRequestRef.current !== requestId) return;
        setYearScopedSubmission(null);
      })
      .finally(() => {
        if (yearScopedRequestRef.current !== requestId) return;
        setIsYearScopedLoading(false);
      });
  }, [effectiveAcademicYearId, listSubmissions, selectedSchoolId]);


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

  const openReportModal = useCallback(
    (type: IndicatorSubmissionFileType) => {
      if (!yearScopedSubmission?.files?.[type]?.uploaded) return;
      setActiveReportModalType(type);
      setReportZoomLevel(1);
    },
    [yearScopedSubmission],
  );

  const closeReportModal = useCallback(() => {
    setActiveReportModalType(null);
    setReportZoomLevel(1);
  }, []);

  const handleDownloadActiveReport = useCallback(async () => {
    if (!activeReportModalType || !yearScopedSubmission) return;
    const activeFile = yearScopedSubmission.files?.[activeReportModalType] ?? null;

    if (activeFile?.downloadUrl) {
      const anchor = document.createElement("a");
      anchor.href = activeFile.downloadUrl;
      if (activeFile.originalFilename) {
        anchor.download = activeFile.originalFilename;
      }
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }

    await downloadSubmissionFile(yearScopedSubmission.id, activeReportModalType);
  }, [activeReportModalType, downloadSubmissionFile, yearScopedSubmission]);

  useEffect(() => {
    if (!activeReportModalType || typeof window === "undefined") return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeReportModal();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activeReportModalType, closeReportModal]);


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
      <div className="school-head-dashboard mx-auto w-full max-w-[1180px] text-[14px]">
      {error && (
        <section className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </section>
      )}

      <DashboardHelpDialog open={showHelpDialog} variant="school_head" onClose={() => setShowHelpDialog(false)} />


      {/* ── School Info ── */}
      <section id="school-info" className={`mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4 ${focusCls("school-info")}`}>
        <article className="rounded-sm border border-slate-200 bg-white px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-slate-500">Assigned School</p>
          <p className="mt-2 text-base font-semibold leading-snug text-slate-900">{schoolName}</p>
        </article>
        <article className="rounded-sm border border-slate-200 bg-white px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-slate-500">School Code</p>
          <p className="mt-2 text-base font-semibold leading-snug text-slate-900">{schoolCode}</p>
        </article>
        <article className="rounded-sm border border-slate-200 bg-white px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-slate-500">Region</p>
          <p className="mt-2 text-base font-semibold leading-snug text-slate-900">{schoolRegion}</p>
        </article>
        <article className="rounded-sm border border-slate-200 bg-white px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-slate-500">Academic Year</p>
          <div className="relative mt-2">
            <select
              value={effectiveAcademicYearId}
              onChange={(event) => setContextAcademicYearId(event.target.value)}
              className="w-full appearance-none rounded-sm border border-slate-300 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              aria-label="Academic year filter"
            >
              <option value="all">All years</option>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">v</span>
          </div>
        </article>
      </section>

      {/* ── File Reports ── */}
      <section id="file-reports" className={`mb-8 ${focusCls("file-reports")}`}>
        <div className="rounded-sm border-2 border-primary-200 bg-primary-50/20 p-3 md:p-4">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-primary-200 pb-2">
            <h2 className="text-[18px] font-semibold text-slate-900">Reports</h2>
            <span className="rounded-sm border border-primary-300 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.5px] text-primary-700">
              Group A (Year-Scoped)
            </span>
          </div>

          {isYearScopedLoading && (
            <p className="mb-3 text-xs font-medium text-slate-500">Loading selected academic year data...</p>
          )}
          {!isYearScopedLoading && !yearScopedSubmission && (
            <p className="mb-3 text-xs font-medium text-slate-500">No submitted report package for the selected academic year.</p>
          )}

          <div className="flex flex-col gap-4 md:flex-row">
            {([
              {
                type: "bmef" as const,
                title: "BMEF Report",
                file: bmefFile,
              },
              {
                type: "smea" as const,
                title: "SMEA Report",
                file: smeaFile,
              },
            ]).map((report) => {
              const hasFile = Boolean(report.file?.uploaded && report.file?.originalFilename);
              const buttonLabel = `View ${report.type.toUpperCase()} Report`;

              return (
                <article key={report.type} className="flex-1 rounded-sm border border-slate-200 bg-white px-6 py-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{report.title}</h3>
                  </div>

                  <dl className="mt-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <dt className="w-24 shrink-0 text-xs font-medium text-slate-500">File</dt>
                      <dd className="truncate text-sm font-normal text-slate-900">{report.file?.originalFilename ?? "- (none)"}</dd>
                    </div>
                    <div className="flex items-start gap-2">
                      <dt className="w-24 shrink-0 text-xs font-medium text-slate-500">Date</dt>
                      <dd className="text-sm font-normal text-slate-900">
                        {report.file?.uploadedAt ? new Date(report.file.uploadedAt).toLocaleDateString() : "-"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={hasFile ? () => openReportModal(report.type) : undefined}
                      disabled={!hasFile}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-primary-300 bg-primary-50 px-3 py-2.5 text-[13px] font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-primary-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {buttonLabel}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-6 overflow-hidden rounded-sm border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-base font-semibold text-slate-900">
              <span className="inline-block border-l-[3px] border-primary-600 pl-3">TARGETS-MET</span>
            </h2>
            <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
            {/* School's Achievement Table */}
            <div className="border border-slate-200 rounded-sm bg-white overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800">School&apos;s Achievement (SY {targetsMetYearLabel})</h3>
              </div>
              <table className="w-full text-[13px] text-slate-900">
                <thead>
                  <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Metric</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {SCHOOL_ACHIEVEMENT_ROWS.map((label) => (
                    <tr key={label}>
                      <td className={`px-4 py-2.5 text-slate-900 ${isSubItemMetric(label) ? "pl-9 text-[12px] italic font-medium text-slate-600" : ""}`}>
                        {label}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-900">
                        {selectedYearIndicatorsByMetric.get(normalizeMetricLookupKey(label))?.actualDisplay ??
                          selectedYearIndicatorsByMetric.get(normalizeMetricLookupKey(label))?.actualValue ??
                          "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Key Performance Indicators Table */}
            <div className="border border-slate-200 rounded-sm bg-white overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800">Key Performance Indicators (SY {targetsMetYearLabel})</h3>
              </div>
              <table className="w-full text-[13px] text-slate-900">
                <thead>
                  <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Indicator</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Target</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Actual</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {KPI_ROWS.map((label) => (
                    <tr key={label}>
                      <td className="px-4 py-2.5 text-slate-900">{label}</td>
                      <td className="px-4 py-2.5 text-center text-slate-900">
                        {selectedYearIndicatorsByMetric.get(normalizeMetricLookupKey(label))?.targetDisplay ??
                          selectedYearIndicatorsByMetric.get(normalizeMetricLookupKey(label))?.targetValue ??
                          "-"}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-900">
                        {selectedYearIndicatorsByMetric.get(normalizeMetricLookupKey(label))?.actualDisplay ??
                          selectedYearIndicatorsByMetric.get(normalizeMetricLookupKey(label))?.actualValue ??
                          "-"}
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-900">
                        {String(
                          selectedYearIndicatorsByMetric.get(normalizeMetricLookupKey(label))?.complianceStatus ?? "-",
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </div>
      </section>

      {activeReportModalType && activeReportFileEntry && (
        <>
          <button
            type="button"
            onClick={closeReportModal}
            className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm"
            aria-label="Close report preview"
          />
          <section className="fixed inset-3 z-[81] flex flex-col overflow-hidden rounded-sm border border-slate-300 bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                {activeReportModalType.toUpperCase()} Report - SY {activeSchoolYearLabel}
              </h3>
              <div className="flex items-center gap-2">
                {activeReportExtension === "png" || activeReportExtension === "jpg" || activeReportExtension === "jpeg" || activeReportExtension === "webp" || activeReportExtension === "gif" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setReportZoomLevel((prev) => Math.max(0.5, Number((prev - 0.1).toFixed(2))))}
                      className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1.5 text-slate-700 transition hover:bg-slate-100"
                      aria-label="Zoom out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportZoomLevel((prev) => Math.min(3, Number((prev + 0.1).toFixed(2))))}
                      className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1.5 text-slate-700 transition hover:bg-slate-100"
                      aria-label="Zoom in"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleDownloadActiveReport()}
                  className="inline-flex items-center gap-1 rounded-sm border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={closeReportModal}
                  className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1.5 text-slate-700 transition hover:bg-slate-100"
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3">
              {activeReportExtension === "pdf" && activeReportFileEntry.downloadUrl ? (
                <iframe
                  title={`${activeReportModalType.toUpperCase()} PDF preview`}
                  src={activeReportFileEntry.downloadUrl}
                  className="h-full w-full rounded-sm border border-slate-300 bg-white"
                />
              ) : activeReportExtension === "png" || activeReportExtension === "jpg" || activeReportExtension === "jpeg" || activeReportExtension === "webp" || activeReportExtension === "gif" ? (
                <div className="h-full overflow-auto rounded-sm border border-slate-300 bg-white p-4">
                  <img
                    src={activeReportFileEntry.downloadUrl ?? ""}
                    alt={`${activeReportModalType.toUpperCase()} report`}
                    className="max-w-none origin-top-left"
                    style={{ transform: `scale(${reportZoomLevel})` }}
                  />
                </div>
              ) : activeReportExtension === "xlsx" || activeReportExtension === "xls" || activeReportExtension === "csv" ? (
                <div className="h-full overflow-auto rounded-sm border border-slate-300 bg-white">
                  <table className="min-w-full">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-3 py-2 text-left">Indicator</th>
                        <th className="px-3 py-2 text-right">Target</th>
                        <th className="px-3 py-2 text-right">Actual</th>
                        <th className="px-3 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submittedIndicatorRows.map((item) => (
                        <tr key={`modal-${item.id}`} className="border-b border-slate-100 text-sm text-slate-800">
                          <td className="px-3 py-2">{item.metric?.name ?? "Untitled indicator"}</td>
                          <td className="px-3 py-2 text-right">{item.targetDisplay ?? item.targetValue ?? "-"}</td>
                          <td className="px-3 py-2 text-right">{item.actualDisplay ?? item.actualValue ?? "-"}</td>
                          <td className="px-3 py-2 text-center">{String(item.complianceStatus ?? "pending")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : activeReportFileEntry.downloadUrl ? (
                <iframe
                  title={`${activeReportModalType.toUpperCase()} report preview`}
                  src={activeReportFileEntry.downloadUrl}
                  className="h-full w-full rounded-sm border border-slate-300 bg-white"
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-sm border border-slate-300 bg-white text-sm font-semibold text-slate-600">
                  Preview unavailable for this file.
                </div>
              )}
            </div>
          </section>
        </>
      )}
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
          statusFilter="all"
        />
      </section>
      </div>
    </Shell>
  );
}





