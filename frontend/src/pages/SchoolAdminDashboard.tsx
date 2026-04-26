import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CircleHelp,
  ClipboardList,
  Database,
  Download,
  Eye,
  FilterX,
  LayoutDashboard,
  RefreshCw,
  Upload,
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
import type { IndicatorSubmission, IndicatorSubmissionFileEntry, IndicatorSubmissionFileType, IndicatorSubmissionItem } from "@/types";

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

function normalizeFileExtension(filename: string | null | undefined): string {
  const value = String(filename ?? "").trim().toLowerCase();
  if (!value.includes(".")) return "";
  return value.slice(value.lastIndexOf(".") + 1);
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

const SCHOOL_ACHIEVEMENTS_DISPLAY: Array<{ code: string; label: string }> = [
  { code: "IMETA_HEAD_NAME", label: "NAME OF SCHOOL HEAD" },
  { code: "IMETA_ENROLL_TOTAL", label: "TOTAL NUMBER OF ENROLMENT" },
  { code: "IMETA_SBM_LEVEL", label: "SBM LEVEL OF PRACTICE" },
  { code: "PCR_K", label: "Pupil/Student Classroom Ratio (Kindergarten)" },
  { code: "PCR_G1_3", label: "Pupil/Student Classroom Ratio (Grades 1 to 3)" },
  { code: "PCR_G4_6", label: "Pupil/Student Classroom Ratio (Grades 4 to 6)" },
  { code: "PCR_G7_10", label: "Pupil/Student Classroom Ratio (Grades 7 to 10)" },
  { code: "PCR_G11_12", label: "Pupil/Student Classroom Ratio (Grades 11 to 12)" },
  { code: "WASH_RATIO", label: "Water and Sanitation facility to pupil ratio" },
  { code: "COMFORT_ROOMS", label: "Number of Comfort rooms" },
  { code: "TOILET_BOWLS", label: "a. Toilet bowl" },
  { code: "URINALS", label: "b. Urinal" },
  { code: "HANDWASH_FAC", label: "Handwashing Facilities" },
  { code: "LEARNING_MAT_RATIO", label: "Ideal learning materials to learner ratio" },
  { code: "PSR_OVERALL", label: "Pupil/student seat ratio" },
  { code: "PSR_K", label: "a. Kindergarten" },
  { code: "PSR_G1_6", label: "b. Grades 1 - 6" },
  { code: "PSR_G7_10", label: "c. Grades 7 - 10" },
  { code: "PSR_G11_12", label: "d. Grades 11 - 12" },
  { code: "ICT_RATIO", label: "ICT Package/E-classroom package to sections ratio" },
  { code: "ICT_LAB", label: "a. ICT Laboratory" },
  { code: "SCIENCE_LAB", label: "Science Laboratory" },
  { code: "INTERNET_ACCESS", label: "Do you have internet access? (Y/N)" },
  { code: "ELECTRICITY", label: "Do you have electricity (Y/N)" },
  { code: "FENCE_STATUS", label: "Do you have a complete fence/gate? (Evident/Partially/Not Evident)" },
  { code: "TEACHERS_TOTAL", label: "No. of Teachers" },
  { code: "TEACHERS_MALE", label: "a. Male" },
  { code: "TEACHERS_FEMALE", label: "b. Female" },
  { code: "TEACHERS_PWD_TOTAL", label: "Teachers with Physical Disability" },
  { code: "TEACHERS_PWD_MALE", label: "a. Male" },
  { code: "TEACHERS_PWD_FEMALE", label: "b. Female" },
  { code: "FUNCTIONAL_SGC", label: "Functional SGC" },
  { code: "FEEDING_BENEFICIARIES", label: "School-Based Feeding Program Beneficiaries" },
  { code: "CANTEEN_INCOME", label: "School-Managed Canteen (Annual income)" },
  { code: "TEACHER_COOP_INCOME", label: "Teachers Cooperative Managed Canteen - if there is (Annual income)" },
  { code: "SAFETY_PLAN", label: "Security and Safety (Contingency Plan)" },
  { code: "SAFETY_EARTHQUAKE", label: "a. Earthquake" },
  { code: "SAFETY_TYPHOON", label: "b. Typhoon" },
  { code: "SAFETY_COVID", label: "c. COVID-19" },
  { code: "SAFETY_POWER", label: "d. Power interruption" },
  { code: "SAFETY_IN_PERSON", label: "e. In-person classes" },
  { code: "TEACHERS_PFA", label: "No. of Teachers trained on Psychological First Aid (PFA)" },
  { code: "TEACHERS_OCC_FIRST_AID", label: "No. of Teachers trained on Occupational First Aid" },
];

const KEY_PERFORMANCE_DISPLAY: Array<{ code: string; label: string }> = [
  { code: "NER", label: "Net Enrollment Rate (NER)" },
  { code: "RR", label: "Retention Rate (RR)" },
  { code: "DR", label: "Drop-out Rate (DR)" },
  { code: "TR", label: "Transition Rate (TR)" },
  { code: "NIR", label: "Net Intake Rate (NIR)" },
  { code: "PR", label: "Participation Rate (PR)" },
  { code: "ALS_COMPLETER_PCT", label: "ALS Completion Rate" },
  { code: "GPI", label: "Gender Parity Index (GPI)" },
  { code: "IQR", label: "Interquartile Ratio (IQR)" },
  { code: "CR", label: "Completion Rate (CR)" },
  { code: "CSR", label: "Cohort Survival Rate (CSR)" },
  { code: "PLM_NEARLY_PROF", label: "Learning Mastery: Nearly Proficient" },
  { code: "PLM_PROF", label: "Learning Mastery: Proficient" },
  { code: "PLM_HIGH_PROF", label: "Learning Mastery: Highly Proficient" },
  { code: "AE_PASS_RATE", label: "A&E Test Pass Rate" },
  { code: "VIOLENCE_REPORT_RATE", label: "Learners Reporting School Violence" },
  { code: "LEARNER_SATISFACTION", label: "Learner Satisfaction" },
  { code: "RIGHTS_AWARENESS", label: "Learners Aware of Education Rights" },
  { code: "RBE_MANIFEST", label: "Schools/LCs Manifesting RBE Indicators" },
];

/* ── Component ── */
export function SchoolAdminDashboard() {
  const { user } = useAuth();
  const { records, error, lastSyncedAt, syncScope, syncStatus, refreshRecords } = useData();
  const {
    submissions: indicatorSubmissionSnapshot,
    allSubmissions,
    academicYears,
    downloadSubmissionFile,
    refreshSubmissions,
  } = useIndicatorData();

  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [contextAcademicYearId, setContextAcademicYearId] = useState("all");
  const [contextWorkflowStatus, setContextWorkflowStatus] = useState<
    "all" | "draft" | "submitted" | "returned" | "validated"
  >("all");
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [activeReportModalType, setActiveReportModalType] = useState<IndicatorSubmissionFileType | null>(null);
  const [reportZoomLevel, setReportZoomLevel] = useState(1);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < MOBILE_BREAKPOINT,
  );
  const initialLoadStartedRef = useRef(false);
  const initialAcademicYearAppliedRef = useRef(false);

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

  const currentAcademicYearOption = useMemo(
    () => academicYears.find((y) => y.isCurrent) ?? academicYears[0] ?? null,
    [academicYears],
  );
  const effectiveAcademicYearId = contextAcademicYearId;
  const filteredIndicatorsByYear = useMemo(
    () =>
      effectiveAcademicYearId === "all"
        ? indicatorSubmissions
        : indicatorSubmissions.filter((submission: IndicatorSubmission) => submission.academicYear?.id === effectiveAcademicYearId),
    [effectiveAcademicYearId, indicatorSubmissions],
  );
  const latestSubmittedIndicators: IndicatorSubmission | null = useMemo(
    () =>
      latestSubmission(
        filteredIndicatorsByYear.filter((submission: IndicatorSubmission) => {
          const status = String(submission.status ?? "").toLowerCase();
          return status === "submitted" || status === "validated";
        }),
      ),
    [filteredIndicatorsByYear],
  );

  const bmefFile = latestSubmittedIndicators?.files?.bmef ?? null;
  const smeaFile = latestSubmittedIndicators?.files?.smea ?? null;
  const bmefUploaded = bmefFile?.uploaded === true;
  const smeaUploaded = smeaFile?.uploaded === true;

  const completedIndicators = latestSubmittedIndicators?.summary?.metIndicators ?? 0;
  const totalIndicators = latestSubmittedIndicators?.summary?.totalIndicators ?? 0;
  const activeReportFileEntry: IndicatorSubmissionFileEntry | null = useMemo(() => {
    if (!activeReportModalType || !latestSubmittedIndicators?.files) return null;
    return latestSubmittedIndicators.files[activeReportModalType] ?? null;
  }, [activeReportModalType, latestSubmittedIndicators]);
  const activeReportFileName = activeReportFileEntry?.originalFilename ?? null;
  const activeReportExtension = normalizeFileExtension(activeReportFileName);
  const activeSchoolYearLabel = selectedYearLabel(
    effectiveAcademicYearId,
    academicYears.map((year) => ({ id: year.id, name: year.name })),
    currentAcademicYearOption?.name ?? "N/A",
  );
  const submittedIndicatorRows = useMemo(
    () => latestSubmittedIndicators?.indicators ?? [],
    [latestSubmittedIndicators],
  );

  const submittedIndicatorByCode = useMemo(() => {
    const map = new Map<string, IndicatorSubmissionItem>();
    for (const item of submittedIndicatorRows) {
      if (item.metric?.code) {
        map.set(item.metric.code, item);
      }
    }
    return map;
  }, [submittedIndicatorRows]);

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

  useEffect(() => {
    if (initialAcademicYearAppliedRef.current) return;
    if (!currentAcademicYearOption?.id) return;
    setContextAcademicYearId(currentAcademicYearOption.id);
    initialAcademicYearAppliedRef.current = true;
  }, [currentAcademicYearOption]);

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

  const openReportModal = useCallback(
    (type: IndicatorSubmissionFileType) => {
      if (!latestSubmittedIndicators?.files?.[type]?.uploaded) return;
      setActiveReportModalType(type);
      setReportZoomLevel(1);
    },
    [latestSubmittedIndicators],
  );

  const closeReportModal = useCallback(() => {
    setActiveReportModalType(null);
    setReportZoomLevel(1);
  }, []);

  const handleDownloadActiveReport = useCallback(async () => {
    if (!activeReportModalType || !latestSubmittedIndicators) return;
    const activeFile = latestSubmittedIndicators.files?.[activeReportModalType] ?? null;

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

    await downloadSubmissionFile(latestSubmittedIndicators.id, activeReportModalType);
  }, [activeReportModalType, downloadSubmissionFile, latestSubmittedIndicators]);

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
          <span className="shrink-0 text-[11px] font-semibold text-slate-500">Quick Navigation {"->"}</span>
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
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold ${statusChipTone(latestSubmittedIndicators?.status)}`}
          >
            School Achievements
            <span className="rounded-sm bg-white/60 px-1 py-0.5 text-[10px]">
              {submissionStatusLabel(latestSubmittedIndicators?.status)}
            </span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold ${statusChipTone(latestSubmittedIndicators?.status)}`}
          >
            Key Performance
            <span className="rounded-sm bg-white/60 px-1 py-0.5 text-[10px]">
              {submissionStatusLabel(latestSubmittedIndicators?.status)}
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
      <section id="school-info" className={`mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4 ${focusCls("school-info")}`}>
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
        <article className="rounded-sm border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Academic Year</p>
          <div className="mt-1 relative">
            <select
              value={effectiveAcademicYearId}
              onChange={(event) => setContextAcademicYearId(event.target.value)}
              className="w-full appearance-none rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 pr-8 text-xs font-semibold text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
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
      <section id="file-reports" className={`mb-5 ${focusCls("file-reports")}`}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Reports</h2>

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
            const badgeTone = uploadChipTone(hasFile);
            const buttonLabel = hasFile
              ? `View ${report.type.toUpperCase()} Report`
              : `Upload ${report.type.toUpperCase()} Report`;

            return (
              <article key={report.type} className="flex-1 rounded-sm border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{report.title}</h3>
                  <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-semibold ${badgeTone}`}>
                    {hasFile ? "Submitted" : "Not Submitted"}
                  </span>
                </div>

                <dl className="mt-4 space-y-2">
                  <div className="flex items-start gap-2 text-sm">
                    <dt className="w-28 shrink-0 font-semibold text-slate-500">File</dt>
                    <dd className="truncate font-semibold text-slate-900">{report.file?.originalFilename ?? "- (none)"}</dd>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <dt className="w-28 shrink-0 font-semibold text-slate-500">Date</dt>
                    <dd className="font-semibold text-slate-900">
                      {report.file?.uploadedAt ? new Date(report.file.uploadedAt).toLocaleDateString() : "-"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  {hasFile ? (
                    <button
                      type="button"
                      onClick={() => openReportModal(report.type)}
                      className="inline-flex items-center gap-1 rounded-sm border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {buttonLabel}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => scrollToSection("imeta-compliance")}
                      className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {buttonLabel}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 mb-3">TARGETS-MET</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* School's Achievement Table */}
            <div className="border border-slate-200 rounded-sm bg-white overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800">School's Achievement (SY 2025-2026)</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Metric</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-600">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SCHOOL_ACHIEVEMENTS_DISPLAY.map(({ code, label }) => {
                    const item = submittedIndicatorByCode.get(code);
                    const value = item
                      ? (item.actualDisplay ?? (item.actualValue !== null && item.actualValue !== undefined ? String(item.actualValue) : "")) || "-"
                      : "-";
                    return (
                      <tr key={code}>
                        <td className="px-4 py-2">{label}</td>
                        <td className="px-4 py-2 text-right">{value}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Key Performance Indicators Table */}
            <div className="border border-slate-200 rounded-sm bg-white overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800">Key Performance Indicators (SY 2025-2026 only)</h3>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Indicator</th>
                    <th className="px-4 py-2 text-center font-medium text-slate-600">Target</th>
                    <th className="px-4 py-2 text-center font-medium text-slate-600">Actual</th>
                    <th className="px-4 py-2 text-center font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {KEY_PERFORMANCE_DISPLAY.map(({ code, label }) => {
                    const item = submittedIndicatorByCode.get(code);
                    const targetVal = item
                      ? (item.targetDisplay ?? (item.targetValue !== null && item.targetValue !== undefined ? String(item.targetValue) : "")) || "-"
                      : "-";
                    const actualVal = item
                      ? (item.actualDisplay ?? (item.actualValue !== null && item.actualValue !== undefined ? String(item.actualValue) : "")) || "-"
                      : "-";
                    const status = item?.complianceStatus ? String(item.complianceStatus) : "-";
                    return (
                      <tr key={code}>
                        <td className="px-4 py-2">{label}</td>
                        <td className="px-4 py-2 text-center">{targetVal}</td>
                        <td className="px-4 py-2 text-center">{actualVal}</td>
                        <td className="px-4 py-2 text-center">{status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
          statusFilter={contextWorkflowStatus}
          academicYearFilter={effectiveAcademicYearId}
        />
      </section>
    </Shell>
  );
}
