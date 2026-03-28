import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BellRing,
  BookOpenText,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  CircleHelp,
  Database,
  Edit2,
  Eye,
  Filter,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { DashboardHelpDialog } from "@/components/DashboardHelpDialog";
import { MonitorMfaResetApprovalsDialog } from "@/components/MonitorMfaResetApprovalsDialog";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/context/Auth";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import { useStudentData } from "@/context/StudentData";
import { useTeacherData } from "@/context/TeacherData";
import { MonitorSchoolDrawer } from "@/pages/monitor/MonitorSchoolDrawer";
import { MonitorLearnerRecordsSection } from "@/pages/monitor/MonitorLearnerRecordsSection";
import { MonitorOverviewSection } from "@/pages/monitor/MonitorOverviewSection";
import { MonitorReviewsSection } from "@/pages/monitor/MonitorReviewsSection";
import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import { MonitorSchoolsSection } from "@/pages/monitor/MonitorSchoolsSection";
import { SchoolScopeSelector } from "@/pages/monitor/SchoolScopeSelector";
import { StudentLookupSelector } from "@/pages/monitor/StudentLookupSelector";
import { TeacherLookupSelector } from "@/pages/monitor/TeacherLookupSelector";
import {
  downloadCsvFile,
  isUrgentRequirement,
  navigatorButtonClass,
  queueLaneLabel,
  queuePriorityLabel,
  queuePriorityTone,
  requirementFilterLabel,
  sanitizeAnchorToken,
  statusTone,
  urgencyRowTone,
  workflowLabel,
  workflowTone,
} from "@/pages/monitor/monitorDashboardUiUtils";
import {
  ALL_SCHOOL_SCOPE,
  type MonitorTopNavigatorId,
  type QueueLane,
  type RequirementFilter,
  type SchoolQuickPreset,
} from "@/pages/monitor/monitorFilters";
import { normalizeSchoolKey } from "@/pages/monitor/monitorRequirementRules";
import { useMonitorFilters } from "@/pages/monitor/useMonitorFilters";
import {
  useMonitorLookups,
} from "@/pages/monitor/useMonitorLookups";
import { useMonitorDashboardShell } from "@/pages/monitor/useMonitorDashboardShell";
import { useMonitorDashboardHotkeys } from "@/pages/monitor/useMonitorDashboardHotkeys";
import { useMonitorDrawerViewModel } from "@/pages/monitor/useMonitorDrawerViewModel";
import { useMonitorRadarTotals } from "@/pages/monitor/useMonitorRadarTotals";
import { useMonitorRequirementData } from "@/pages/monitor/useMonitorRequirementData";
import { useMonitorReviewFlow } from "@/pages/monitor/useMonitorReviewFlow";
import { useMonitorSchoolsSection } from "@/pages/monitor/useMonitorSchoolsSection";
import { useMonitorUiRefresh } from "@/pages/monitor/useMonitorUiRefresh";
import { useSchoolDrawer } from "@/pages/monitor/useSchoolDrawer";
import type {
  SchoolRecord,
  SchoolStatus,
} from "@/types";
import {
  buildRegionAggregates,
  buildStatusDistribution,
  buildSubmissionTrend,
  formatDateTime,
  statusLabel,
} from "@/utils/analytics";

type FilterChipId = "search" | "status" | "requirement" | "lane" | "preset" | "school" | "student" | "teacher" | "date";

interface MonitorTopNavigatorItem {
  id: MonitorTopNavigatorId;
  label: string;
}

interface ManualStep {
  id: string;
  title: string;
  objective: string;
  actions: string[];
  doneWhen: string;
}

type SchoolRequirementSummary = MonitorSchoolRequirementSummary;

type NavigatorIcon = ComponentType<{ className?: string }>;

interface QuickJumpItem {
  id: string;
  label: string;
  targetId: string;
  icon: NavigatorIcon;
}

const MONITOR_TOP_NAVIGATOR_ITEMS: MonitorTopNavigatorItem[] = [
  { id: "overview", label: "Overview" },
  { id: "schools", label: "Schools" },
  { id: "reviews", label: "Reviews" },
];
const MONITOR_TOP_NAVIGATOR_IDS: MonitorTopNavigatorId[] = MONITOR_TOP_NAVIGATOR_ITEMS.map((item) => item.id);

const MONITOR_NAVIGATOR_ICONS: Record<MonitorTopNavigatorItem["id"], NavigatorIcon> = {
  overview: LayoutDashboard,
  schools: Building2,
  reviews: ClipboardList,
};

const MONITOR_NAVIGATOR_MANUAL: ManualStep[] = [
  {
    id: "overview",
    title: "Overview",
    objective: "Start with overall status and analytics before opening school-level work.",
    actions: [
      "Check summary totals for needs action, returned, and submitted.",
      "Use analytics to spot trends or spikes that need follow-up.",
    ],
    doneWhen: "Priority issues are identified for this review cycle.",
  },
  {
    id: "schools",
    title: "Schools",
    objective: "Open school-level records and verify synchronized student and teacher data.",
    actions: [
      "Use search and school filters to find the school you need quickly.",
      "Inspect school details and learner records without leaving the dashboard.",
    ],
    doneWhen: "The selected school context is verified and ready for review.",
  },
  {
    id: "reviews",
    title: "Reviews",
    objective: "Work through pending compliance reviews in one focused workspace.",
    actions: [
      "Review queue items, validate submissions, or return with clear notes.",
      "Use lane and workflow filters to process urgent schools first.",
    ],
    doneWhen: "Each queued school has a clear review action.",
  },
];

const MONITOR_MANUAL_STATUS_GUIDE = [
  "Missing: Requirement not yet submitted by school.",
  "For Review: Submitted and waiting for monitor review.",
  "Returned: Sent back to school head for correction.",
  "Submitted: Package was sent by school.",
  "Validated: Approved and closed.",
];

const REQUIREMENT_FILTER_OPTIONS: Array<{ id: RequirementFilter; label: string }> = [
  { id: "all", label: "All statuses" },
  { id: "missing", label: "Missing" },
  { id: "waiting", label: "For Review" },
  { id: "returned", label: "Returned" },
  { id: "submitted", label: "Submitted" },
  { id: "validated", label: "Validated" },
];

const SCHOOL_QUICK_PRESET_OPTIONS: Array<{ id: SchoolQuickPreset; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "Show every school in the current scope." },
  { id: "pending", label: "Pending", hint: "Schools with submissions waiting for monitor review." },
  { id: "missing", label: "Missing", hint: "Schools missing a compliance record or indicator submission." },
  { id: "returned", label: "Returned", hint: "Schools with returned submissions that need correction." },
  { id: "no_submission", label: "No Submission", hint: "Schools with no compliance/indicator submission yet." },
  { id: "high_risk", label: "High Risk", hint: "Schools with missing or returned requirements." },
];

const MONITOR_QUICK_JUMPS: Record<MonitorTopNavigatorId, QuickJumpItem[]> = {
  overview: [
    { id: "filters_overview", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "overview_metrics", label: "Overview Metrics", targetId: "monitor-overview-metrics", icon: LayoutDashboard },
    { id: "overview_analytics", label: "Analytics", targetId: "monitor-targets-snapshot", icon: TrendingUp },
  ],
  reviews: [
    { id: "filters_queue", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "queue_list", label: "Queue List", targetId: "monitor-requirements-table", icon: ListChecks },
    { id: "queue_workspace", label: "Review Workspace", targetId: "monitor-queue-workspace", icon: ClipboardList },
  ],
  schools: [
    { id: "filters_schools", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "school_records", label: "School List", targetId: "monitor-school-records", icon: Building2 },
    { id: "school_learners", label: "Learner Records", targetId: "monitor-school-learners", icon: Users },
  ],
};

const REQUIREMENT_PAGE_SIZE = 10;
const RECORD_PAGE_SIZE = 10;

function isInteractiveTableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      "button, a, input, select, textarea, label, [role='button'], [contenteditable='true']",
    ),
  );
}

export function MonitorDashboard() {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
  const authSessionKey = user ? `${user.role}:${user.id}` : "";
  const {
    records,
    recordCount,
    targetsMet,
    syncAlerts,
    isLoading,
    isSaving,
    error,
    lastSyncedAt,
    syncScope,
    syncStatus,
    refreshRecords,
    addRecord,
    updateRecord,
    listArchivedRecords,
    restoreRecord,
    sendReminder,
    updateSchoolHeadAccountStatus,
    issueSchoolHeadAccountActionVerificationCode,
    issueSchoolHeadSetupLink,
    issueSchoolHeadPasswordResetLink,
    upsertSchoolHeadAccountProfile,
    removeSchoolHeadAccount,
    bulkImportRecords,
  } = useData();
  const {
    isLoading: isIndicatorDataLoading,
    lastSyncedAt: indicatorLastSyncedAt,
    listSubmissionsForSchool,
    refreshSubmissions,
  } = useIndicatorData();
  const {
    students,
    isLoading: isStudentDataLoading,
    lastSyncedAt: studentLastSyncedAt,
    refreshStudents,
    queryStudents,
  } = useStudentData();
  const {
    isLoading: isTeacherDataLoading,
    lastSyncedAt: teacherLastSyncedAt,
    refreshTeachers,
    listTeachers,
  } = useTeacherData();

  const {
    search,
    effectiveSearch,
    statusFilter,
    filterDateFrom,
    filterDateTo,
    requirementFilter,
    selectedSchoolScopeKey,
    selectedStudentLookupId,
    selectedTeacherLookupId,
    filtersHydrated,
    activeTopNavigator,
    queueLane,
    schoolQuickPreset,
    setSearch,
    setStatusFilter,
    setFilterDateFrom,
    setFilterDateTo,
    setRequirementFilter,
    setSelectedSchoolScopeKey,
    setSelectedStudentLookupId,
    setSelectedTeacherLookupId,
    setActiveTopNavigator,
    setQueueLane,
    setSchoolQuickPreset,
    resetFilters: resetMonitorFilters,
  } = useMonitorFilters();
  const { studentLookupTick, teacherLookupTick, radarTotalsTick, latestRealtimeBatch } = useMonitorUiRefresh();
  const {
    isNavigatorCompact,
    setIsNavigatorCompact,
    isNavigatorVisible,
    setIsNavigatorVisible,
    isMobileViewport,
    showNavigatorManual,
    setShowNavigatorManual,
    showAdvancedFilters,
    setShowAdvancedFilters,
    showAdvancedAnalytics,
    setShowAdvancedAnalytics,
    showHelpDialog,
    setShowHelpDialog,
    showMfaResetApprovalsDialog,
    setShowMfaResetApprovalsDialog,
    renderAdvancedAnalytics,
    isHidingAdvancedAnalytics,
    focusedSectionId,
    setFocusedSectionId,
    showMoreFilters,
    setShowMoreFilters,
    toasts,
    pushToast,
    dismissToast,
    focusAndScrollTo,
    sectionFocusClass,
  } = useMonitorDashboardShell();
  const [showSchoolLearnerRecords, setShowSchoolLearnerRecords] = useState(false);
  const [requirementsPage, setRequirementsPage] = useState(1);
  const [recordsPage, setRecordsPage] = useState(1);
  const openStudentRecordsFromCard = () => {
    setShowSchoolLearnerRecords(true);
    setShowNavigatorManual(false);
    setActiveTopNavigator("schools");

    if (isMobileViewport) {
      setIsNavigatorVisible(false);
    }

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        focusAndScrollTo("monitor-school-learners");
      }, 50);
    }
  };
  const {
    schoolScopeQuery,
    setSchoolScopeQuery,
    studentLookupQuery,
    setStudentLookupQuery,
    teacherLookupQuery,
    setTeacherLookupQuery,
    openScopeDropdownId,
    setOpenScopeDropdownId,
    toggleScopeDropdown,
    schoolScopeOptions,
    filteredSchoolScopeOptions,
    selectedSchoolScope,
    scopedSchoolKeys,
    scopedSchoolCodes,
    totalSchoolsInScope,
    studentLookupOptions,
    teacherLookupOptions,
    teacherScopedStudentLookupOptions,
    filteredStudentLookupOptions,
    filteredTeacherLookupOptions,
    selectedStudentLookup,
    selectedTeacherLookup,
    selectedTeacherSchoolKeys,
    selectedStudentLabel,
    selectedTeacherLabel,
    studentRecordsLookupTerm,
    isStudentLookupSyncing,
    isTeacherLookupSyncing,
    handleSelectAllSchools,
    handleSelectSchoolScope,
    handleClearStudentLookup,
    handleSelectStudentLookup,
    handleClearTeacherLookup,
    handleSelectTeacherLookup,
  } = useMonitorLookups({
    authSessionKey,
    records,
    recordCount,
    students,
    isStudentDataLoading,
    queryStudents,
    listTeachers,
    selectedSchoolScopeKey,
    setSelectedSchoolScopeKey,
    selectedStudentLookupId,
    setSelectedStudentLookupId,
    selectedTeacherLookupId,
    setSelectedTeacherLookupId,
    studentLookupTick,
    teacherLookupTick,
    showMoreFilters,
    showAdvancedFilters,
    setShowSchoolLearnerRecords,
    onOpenLearnerRecords: openStudentRecordsFromCard,
  });
  const { monitorRadarTotals } = useMonitorRadarTotals({
    authSessionKey,
    activeTopNavigator,
    showNavigatorManual,
    scopedSchoolCodes,
    radarTotalsTick,
    queryStudents,
    listTeachers,
  });
  const [remindingSchoolKey, setRemindingSchoolKey] = useState<string | null>(null);
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);
  const schoolsTableScrollerRef = useRef<HTMLDivElement | null>(null);
  const schoolsTableDragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    button: number;
    moved: boolean;
  } | null>(null);
  const [isSchoolsTableDragging, setIsSchoolsTableDragging] = useState(false);
  const didAutoExpandMoreFiltersRef = useRef(false);

  useEffect(() => {
    if (!filtersHydrated || didAutoExpandMoreFiltersRef.current) return;

    didAutoExpandMoreFiltersRef.current = true;

    const shouldExpand =
      (activeTopNavigator !== "reviews" && queueLane !== "all") ||
      selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE ||
      Boolean(selectedStudentLookupId) ||
      Boolean(selectedTeacherLookupId);

    if (shouldExpand) {
      setShowMoreFilters(true);
    }
  }, [
    activeTopNavigator,
    filtersHydrated,
    queueLane,
    selectedSchoolScopeKey,
    selectedStudentLookupId,
    selectedTeacherLookupId,
  ]);

  useEffect(() => {
    if (!showAdvancedFilters || typeof window === "undefined") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openScopeDropdownId) return;
      setShowAdvancedFilters(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openScopeDropdownId, showAdvancedFilters]);

  const handleRefreshDashboard = useCallback(async () => {
    const results = await Promise.allSettled([
      refreshRecords(),
      refreshSubmissions(),
      refreshStudents(),
      refreshTeachers(),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      pushToast("Some dashboard data failed to refresh. Please try again.", "warning");
    }
  }, [pushToast, refreshRecords, refreshSubmissions, refreshStudents, refreshTeachers]);

  const scopedRecords = useMemo(() => {
    if (!scopedSchoolKeys) {
      return records;
    }

    return records.filter((record) =>
      scopedSchoolKeys.has(
        normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName),
      ),
    );
  }, [records, scopedSchoolKeys]);

  const shouldComputeOverviewCharts = !showNavigatorManual && activeTopNavigator === "overview";
  const regionAggregates = useMemo(
    () => (shouldComputeOverviewCharts ? buildRegionAggregates(scopedRecords) : []),
    [scopedRecords, shouldComputeOverviewCharts],
  );
  const statusDistribution = useMemo(
    () => (shouldComputeOverviewCharts ? buildStatusDistribution(scopedRecords) : []),
    [scopedRecords, shouldComputeOverviewCharts],
  );
  const submissionTrend = useMemo(
    () => (shouldComputeOverviewCharts ? buildSubmissionTrend(scopedRecords) : []),
    [scopedRecords, shouldComputeOverviewCharts],
  );
  const {
    schoolRequirementByKey,
    recordBySchoolKey,
    scopedRecordBySchoolKey,
    schoolStatusCounts,
    visibleRequirementFilterIds,
    visibleRequirementFilterOptions,
    filteredRequirementRows,
    filteredSchoolKeys,
    requirementCounts,
    needsActionCount,
    actionQueueRows,
    queueLaneCounts,
    laneFilteredQueueRows,
    schoolPresetCounts,
    stickySummaryStats,
    queueWorkspaceSchoolFilterKeys,
    compactSchoolRows,
    totalRequirementPages,
    safeRequirementsPage,
    paginatedRequirementRows,
    totalRecordPages,
    safeRecordsPage,
    paginatedCompactSchoolRows,
  } = useMonitorRequirementData({
    records,
    scopedRecords,
    scopedSchoolKeys,
    selectedSchoolScopeKey,
    hasSelectedSchoolScope: Boolean(selectedSchoolScope),
    selectedStudentLookupSchoolKey:
      selectedStudentLookup?.schoolKey && selectedStudentLookup.schoolKey !== "unknown"
        ? selectedStudentLookup.schoolKey
        : null,
    hasSelectedStudentLookup: Boolean(selectedStudentLookup),
    selectedTeacherSchoolKeys,
    hasSelectedTeacherLookup: Boolean(selectedTeacherLookup),
    filterDateFrom,
    filterDateTo,
    requirementFilter,
    statusFilter,
    schoolQuickPreset,
    queueLane,
    effectiveSearch,
    activeTopNavigator,
    requirementsPage,
    recordsPage,
    requirementPageSize: REQUIREMENT_PAGE_SIZE,
    recordPageSize: RECORD_PAGE_SIZE,
    allSchoolScopeKey: ALL_SCHOOL_SCOPE,
    requirementFilterOptions: REQUIREMENT_FILTER_OPTIONS,
  });
  const dashboardLastSyncedAt = useMemo(() => {
    const recordTime = lastSyncedAt ? Date.parse(lastSyncedAt) : Number.NaN;
    const indicatorTime = indicatorLastSyncedAt ? Date.parse(indicatorLastSyncedAt) : Number.NaN;
    const studentTime = studentLastSyncedAt ? Date.parse(studentLastSyncedAt) : Number.NaN;
    const teacherTime = teacherLastSyncedAt ? Date.parse(teacherLastSyncedAt) : Number.NaN;
    const maxTime = Math.max(
      Number.isFinite(recordTime) ? recordTime : 0,
      Number.isFinite(indicatorTime) ? indicatorTime : 0,
      Number.isFinite(studentTime) ? studentTime : 0,
      Number.isFinite(teacherTime) ? teacherTime : 0,
    );
    return maxTime > 0 ? new Date(maxTime).toISOString() : null;
  }, [indicatorLastSyncedAt, lastSyncedAt, studentLastSyncedAt, teacherLastSyncedAt]);
  const isDashboardSyncing =
    isLoading || isIndicatorDataLoading || isStudentDataLoading || isTeacherDataLoading;
  const showSubmissionFilters = showAdvancedFilters;
  const returnedCount = requirementCounts.returned;
  const submittedCount = requirementCounts.submittedAny;
  const shouldRenderNavigatorItems = isMobileViewport ? isNavigatorVisible : true;
  const showNavigatorHeaderText = isMobileViewport ? isNavigatorVisible : !isNavigatorCompact;
  const navigatorBadges = useMemo<
    Record<MonitorTopNavigatorId, { primary?: number; secondary?: number; urgency: "none" | "high" | "medium" }>
  >(
    () => ({
      overview: {
        primary: returnedCount,
        urgency: returnedCount > 0 ? "high" : needsActionCount > 0 ? "medium" : "none",
      },
      reviews: {
        primary: needsActionCount,
        urgency: requirementCounts.missing > 0 ? "high" : needsActionCount > 0 ? "medium" : "none",
      },
      schools: { urgency: "none" },
    }),
    [needsActionCount, requirementCounts.missing, returnedCount],
  );
  const quickJumpItems = useMemo(
    () => MONITOR_QUICK_JUMPS[activeTopNavigator] ?? [],
    [activeTopNavigator],
  );
  const shouldShowQuickJump = quickJumpItems.length > 0;
  const scrollQueueRowIntoView = (schoolKey: string) => {
    if (typeof document === "undefined") return;
    const targetId = `monitor-queue-row-${sanitizeAnchorToken(schoolKey)}`;
    const row = document.getElementById(targetId);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const resolveQuickJumpTargetId = (targetId: string): string => {
    if (targetId === "monitor-analytics-toggle") {
      return "monitor-targets-snapshot";
    }

    return targetId;
  };

  const canResolveQuickJumpTarget = (targetId: string): boolean => {
    const resolvedTargetId = resolveQuickJumpTargetId(targetId);

    if (resolvedTargetId === "monitor-submission-filters") {
      return true;
    }

    if (typeof document === "undefined") {
      return true;
    }

    return Boolean(document.getElementById(resolvedTargetId));
  };

  const handleQuickJump = (item: QuickJumpItem) => {
    const resolvedTargetId = resolveQuickJumpTargetId(item.targetId);

    if (resolvedTargetId === "monitor-submission-filters" && !showAdvancedFilters) {
      setShowAdvancedFilters(true);
      window.setTimeout(() => {
        focusAndScrollTo(resolvedTargetId);
      }, 80);
      return;
    }

    if (item.targetId === "monitor-analytics-toggle") {
      if (!showAdvancedAnalytics) {
        setShowAdvancedAnalytics(true);
      }
      window.setTimeout(() => {
        focusAndScrollTo(resolvedTargetId);
      }, 80);
      return;
    }

    focusAndScrollTo(resolvedTargetId);
  };

  const renderQuickJumpChips = (mobile: boolean) => {
    if (!shouldShowQuickJump) {
      return null;
    }

    return (
      <div className={mobile ? "mt-2 flex gap-2 overflow-x-auto pb-1" : "flex flex-wrap items-center justify-end gap-2"}>
        {quickJumpItems.map((item) => {
          const Icon = item.icon;
          const resolvedTargetId = resolveQuickJumpTargetId(item.targetId);
          const isActive = focusedSectionId === resolvedTargetId;
          const isAvailable = canResolveQuickJumpTarget(item.targetId);
          const quickJumpIndex = quickJumpItems.findIndex((candidate) => candidate.id === item.id);
          const shortcutLabel = quickJumpIndex >= 0 && quickJumpIndex < 9 ? `Alt+Shift+${quickJumpIndex + 1}` : null;

          return (
            <button
              key={`monitor-quick-jump-${item.id}`}
              type="button"
              onClick={() => handleQuickJump(item)}
              disabled={!isAvailable}
              aria-pressed={isActive}
              title={shortcutLabel ? `${item.label} (${shortcutLabel})` : item.label}
              className={`inline-flex shrink-0 items-center gap-1 rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                isActive
                  ? "border-primary-300 bg-primary-50 text-primary-700"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              } ${isAvailable ? "" : "cursor-not-allowed opacity-50"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>
    );
  };

  const endSchoolsTableDrag = (pointerId?: number) => {
    const state = schoolsTableDragStateRef.current;
    const scroller = schoolsTableScrollerRef.current;

    if (!state) {
      return;
    }

    if (typeof pointerId === "number" && state.pointerId !== pointerId) {
      return;
    }

    if (scroller) {
      try {
        scroller.releasePointerCapture(state.pointerId);
      } catch {
        // Ignore release failures.
      }
    }

    schoolsTableDragStateRef.current = null;
    setIsSchoolsTableDragging(false);
  };

  const handleSchoolsTablePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const scroller = schoolsTableScrollerRef.current;
    if (!scroller) return;

    // Keep row/table actions clickable; only start drag on non-interactive surface.
    if (isInteractiveTableTarget(event.target)) {
      return;
    }

    if (scroller.scrollWidth <= scroller.clientWidth) return;

    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 2) {
      return;
    }

    schoolsTableDragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      button: event.button,
      moved: false,
    };
    setIsSchoolsTableDragging(true);

    try {
      scroller.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture failures.
    }

    if (event.pointerType === "mouse") {
      event.preventDefault();
    }
  };

  const handleSchoolsTablePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const scroller = schoolsTableScrollerRef.current;
    const state = schoolsTableDragStateRef.current;
    if (!scroller || !state || state.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - state.startX;
    if (Math.abs(deltaX) > 3) {
      state.moved = true;
    }

    scroller.scrollLeft = state.startScrollLeft - deltaX;

    if (state.moved) {
      event.preventDefault();
    }
  };

  const handleSchoolsTableContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const state = schoolsTableDragStateRef.current;
    if (!state) {
      return;
    }

    if (state.button === 2) {
      event.preventDefault();
      endSchoolsTableDrag(state.pointerId);
    }
  };

  const studentStatsBySchoolKey = useMemo(() => {
    const map = new Map<string, { students: number; teachers: Set<string> }>();

    for (const student of students) {
      const key = normalizeSchoolKey(student.school?.schoolCode ?? null, student.school?.name ?? null);
      if (key === "unknown") continue;

      if (!map.has(key)) {
        map.set(key, { students: 0, teachers: new Set<string>() });
      }

      const row = map.get(key);
      if (!row) continue;
      row.students += 1;

      const teacherName = student.teacher?.trim();
      if (teacherName) {
        row.teachers.add(teacherName);
      }
    }

    return map;
  }, [students]);

  const resolveSchoolDrawerRecordId = useCallback(
    (schoolKey: string | null) => {
      if (!schoolKey) {
        return "";
      }

      return (recordBySchoolKey.get(schoolKey)?.id ?? "").trim();
    },
    [recordBySchoolKey],
  );

  const resolveSchoolDrawerCode = useCallback(
    (schoolKey: string | null) => {
      if (!schoolKey) {
        return "";
      }

      const summary = schoolRequirementByKey.get(schoolKey) ?? null;
      const record = recordBySchoolKey.get(schoolKey) ?? null;
      return (summary?.schoolCode ?? record?.schoolId ?? record?.schoolCode ?? "").trim();
    },
    [recordBySchoolKey, schoolRequirementByKey],
  );

  const {
    schoolDrawerKey,
    schoolDrawerRecordId,
    activeSchoolDrawerTab,
    expandedDrawerIndicatorRows,
    highlightedDrawerIndicatorKey,
    schoolDrawerSubmissions,
    isSchoolDrawerSubmissionsLoading,
    schoolDrawerSubmissionsError,
    accurateSyncedCountsBySchoolKey,
    syncedCountsLoadingSchoolKey,
    syncedCountsError,
    openSchoolDrawer,
    closeSchoolDrawer,
    refreshSchoolDrawer,
    setActiveSchoolDrawerTab,
    setHighlightedDrawerIndicatorKey,
    toggleDrawerIndicatorLabel,
  } = useSchoolDrawer({
    authSessionKey,
    isAuthenticated,
    latestRealtimeBatch,
    resolveRecordId: resolveSchoolDrawerRecordId,
    resolveSchoolCode: resolveSchoolDrawerCode,
    listSubmissionsForSchool,
    queryStudents,
    listTeachers,
  });

  const schoolDrawerIndicatorSubmissions = schoolDrawerSubmissions;
  const {
    schoolIndicatorMatrix,
    schoolIndicatorRowsByCategory,
    schoolIndicatorPackageRows,
    latestSchoolPackage,
    latestSchoolIndicatorYear,
    missingDrawerIndicatorKeys,
    returnedDrawerIndicatorKeys,
    missingDrawerIndicatorKeySet,
    returnedDrawerIndicatorKeySet,
    schoolDetail,
    schoolDrawerCriticalAlerts,
  } = useMonitorDrawerViewModel({
    schoolDrawerKey,
    schoolDrawerSubmissions: schoolDrawerIndicatorSubmissions,
    schoolDrawerSubmissionsError,
    schoolRequirementByKey,
    recordBySchoolKey,
    studentStatsBySchoolKey,
    accurateSyncedCountsBySchoolKey,
  });
  const {
    autoAdvanceQueue,
    setAutoAdvanceQueue,
    handleQueueReviewCompleted,
  } = useMonitorReviewFlow({
    laneFilteredQueueRows,
    activeSchoolDrawerKey: schoolDrawerKey,
    onOpenSchoolDrawer: openSchoolDrawer,
    onRefreshActiveDrawer: refreshSchoolDrawer,
    onToast: pushToast,
  });

  const activeFilterChips = useMemo<Array<{ id: FilterChipId; label: string }>>(() => {
    const chips: Array<{ id: FilterChipId; label: string }> = [];

    if (effectiveSearch.trim()) chips.push({ id: "search", label: `Search: ${effectiveSearch.trim()}` });
    if (statusFilter !== "all") chips.push({ id: "status", label: `Status: ${statusLabel(statusFilter)}` });
    if (requirementFilter !== "all") chips.push({ id: "requirement", label: `Queue: ${requirementFilterLabel(requirementFilter)}` });
    if (queueLane !== "all") chips.push({ id: "lane", label: `Lane: ${queueLaneLabel(queueLane)}` });
    if (schoolQuickPreset !== "all") {
      const presetLabel = SCHOOL_QUICK_PRESET_OPTIONS.find((option) => option.id === schoolQuickPreset)?.label ?? schoolQuickPreset;
      chips.push({ id: "preset", label: `Preset: ${presetLabel}` });
    }
    if (filterDateFrom || filterDateTo) {
      chips.push({
        id: "date",
        label: `Date: ${filterDateFrom || "Any"} to ${filterDateTo || "Any"}`,
      });
    }
    if (selectedSchoolScope) chips.push({ id: "school", label: `School: ${selectedSchoolScope.code}` });
    if (selectedStudentLookup) chips.push({ id: "student", label: `Student: ${selectedStudentLookup.fullName}` });
    if (selectedTeacherLookup) chips.push({ id: "teacher", label: `Teacher: ${selectedTeacherLookup.name}` });

    return chips;
  }, [
    filterDateFrom,
    filterDateTo,
    queueLane,
    requirementFilter,
    schoolQuickPreset,
    effectiveSearch,
    selectedSchoolScope,
    selectedStudentLookup,
    selectedTeacherLookup,
    statusFilter,
  ]);

  useEffect(() => {
    setRequirementsPage(1);
    setRecordsPage(1);
  }, [
    filterDateFrom,
    filterDateTo,
    requirementFilter,
    schoolQuickPreset,
    effectiveSearch,
    selectedSchoolScopeKey,
    selectedStudentLookupId,
    selectedTeacherLookupId,
    statusFilter,
  ]);

  useEffect(() => {
    if (requirementsPage > totalRequirementPages) {
      setRequirementsPage(totalRequirementPages);
    }
  }, [requirementsPage, totalRequirementPages]);

  useEffect(() => {
    if (recordsPage > totalRecordPages) {
      setRecordsPage(totalRecordPages);
    }
  }, [recordsPage, totalRecordPages]);

  useEffect(() => {
    if (visibleRequirementFilterIds.includes(requirementFilter)) {
      return;
    }
    setRequirementFilter("all");
  }, [requirementFilter, setRequirementFilter, visibleRequirementFilterIds]);

  const clearAllFilters = () => {
    resetMonitorFilters();
    setSchoolScopeQuery("");
    setStudentLookupQuery("");
    setTeacherLookupQuery("");
    setOpenScopeDropdownId(null);
  };

  const resetQueueFilters = () => {
    setRequirementFilter("all");
    setQueueLane("all");
  };

  const clearFilterChip = (chipId: FilterChipId) => {
    switch (chipId) {
      case "search":
        setSearch("");
        break;
      case "status":
        setStatusFilter("all");
        break;
      case "requirement":
        setRequirementFilter("all");
        break;
      case "lane":
        setQueueLane("all");
        break;
      case "preset":
        setSchoolQuickPreset("all");
        break;
      case "date":
        setFilterDateFrom("");
        setFilterDateTo("");
        break;
      case "school":
        setSelectedSchoolScopeKey(ALL_SCHOOL_SCOPE);
        setSelectedStudentLookupId(null);
        setSelectedTeacherLookupId(null);
        setSchoolScopeQuery("");
        setStudentLookupQuery("");
        setTeacherLookupQuery("");
        break;
      case "student":
        setSelectedStudentLookupId(null);
        setStudentLookupQuery("");
        break;
      case "teacher":
        setSelectedTeacherLookupId(null);
        setTeacherLookupQuery("");
        break;
      default:
        break;
    }
  };

  const sendReminderForSchool = async (schoolKey: string, schoolName: string, notes?: string | null) => {
    const record = scopedRecordBySchoolKey.get(schoolKey) ?? recordBySchoolKey.get(schoolKey);
    if (!record) {
      pushToast(`Unable to send reminder for ${schoolName}: school record not found.`, "warning");
      return;
    }

    setRemindingSchoolKey(schoolKey);
    try {
      const receipt = await sendReminder(record.id, notes);
      const recipientLabel = receipt.recipientCount === 1 ? "recipient" : "recipients";
      pushToast(`Reminder sent to ${receipt.schoolName} (${receipt.recipientCount} ${recipientLabel}).`, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : `Unable to send reminder for ${schoolName}.`;
      pushToast(message, "warning");
    } finally {
      setRemindingSchoolKey((current) => (current === schoolKey ? null : current));
    }
  };

  const handleReviewSchool = (summary: SchoolRequirementSummary) => {
    openSchoolDrawer(summary.schoolKey);
    setActiveTopNavigator("reviews");
    window.setTimeout(() => {
      focusAndScrollTo("monitor-queue-workspace");
      scrollQueueRowIntoView(summary.schoolKey);
    }, 80);
    pushToast(`Review workspace opened for ${summary.schoolName}.`, "info");
  };

  const handleOpenSchool = (summary: SchoolRequirementSummary) => {
    setActiveTopNavigator("schools");
    openSchoolDrawer(summary.schoolKey);
    window.setTimeout(() => {
      focusAndScrollTo("monitor-school-records");
    }, 80);
    pushToast(`Opened school details for ${summary.schoolName}.`, "info");
  };

  const handleSendReminder = (summary: SchoolRequirementSummary) => {
    void sendReminderForSchool(summary.schoolKey, summary.schoolName);
  };

  const handleReviewRecord = (record: SchoolRecord) => {
    const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
    if (schoolKey === "unknown") {
      pushToast(`Unable to open review for ${record.schoolName}: school key is missing.`, "warning");
      return;
    }
    const summary = schoolRequirementByKey.get(schoolKey);

    if (summary) {
      handleReviewSchool(summary);
      return;
    }

    openSchoolDrawer(schoolKey);
    setActiveTopNavigator("reviews");
    window.setTimeout(() => {
      focusAndScrollTo("monitor-queue-workspace");
    }, 80);
    pushToast(`Review workspace opened for ${record.schoolName}.`, "info");
  };

  const handleOpenSchoolRecord = (record: SchoolRecord) => {
    const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
    if (schoolKey === "unknown") {
      pushToast(`Unable to open school details for ${record.schoolName}: school key is missing.`, "warning");
      return;
    }
    setActiveTopNavigator("schools");
    openSchoolDrawer(schoolKey);
    window.setTimeout(() => {
      focusAndScrollTo("monitor-school-records");
    }, 80);
    pushToast(`Opened school details for ${record.schoolName}.`, "info");
  };

  const handleQueueSchoolFocus = (schoolKey: string) => {
    if (schoolKey === "unknown") return;
    openSchoolDrawer(schoolKey);
    setActiveTopNavigator("reviews");
  };

  const jumpToDrawerIndicator = (targetKey: string, emptyMessage: string) => {
    if (!targetKey) {
      pushToast(emptyMessage, "info");
      return;
    }

    setActiveSchoolDrawerTab("history");
    const targetId = `school-drawer-indicator-${sanitizeAnchorToken(targetKey)}`;

    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    window.setTimeout(() => {
      const row = document.getElementById(targetId);
      if (!row) {
        pushToast("Indicator row was not found in this package.", "warning");
        return;
      }

      row.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedDrawerIndicatorKey(targetKey);
      window.setTimeout(() => {
        setHighlightedDrawerIndicatorKey((current) => (current === targetKey ? null : current));
      }, 2200);
    }, 120);
  };

  const handleJumpToMissingIndicators = () => {
    const targetKey = missingDrawerIndicatorKeys[0] ?? "";
    jumpToDrawerIndicator(targetKey, "No missing indicators were detected.");
  };

  const handleJumpToReturnedIndicators = () => {
    const fallbackKey =
      returnedDrawerIndicatorKeys[0] ??
      (schoolIndicatorMatrix.latestSubmission?.status === "returned" ? schoolIndicatorMatrix.rows[0]?.key ?? "" : "");
    jumpToDrawerIndicator(fallbackKey, "No returned indicators were found in the latest package.");
  };

  const handleMonitorTopNavigate = (id: MonitorTopNavigatorId) => {
    setShowNavigatorManual(false);
    setActiveTopNavigator(id);

    if (typeof window !== "undefined") {
      const targetByNav: Record<MonitorTopNavigatorId, string> = {
        overview: "monitor-overview-metrics",
        schools: "monitor-school-records",
        reviews: "monitor-action-queue",
      };

      const targetId = targetByNav[id];
      if (targetId) {
        window.setTimeout(() => {
          focusAndScrollTo(targetId);
        }, 70);
      }
    }

    if (isMobileViewport) {
      setIsNavigatorVisible(false);
    }
  };

  const handleKeyboardTopNavigate = useCallback(
    (id: MonitorTopNavigatorId) => {
      setShowNavigatorManual(false);
      setActiveTopNavigator(id);

      if (isMobileViewport) {
        setIsNavigatorVisible(false);
      }
    },
    [isMobileViewport, setActiveTopNavigator, setIsNavigatorVisible, setShowNavigatorManual],
  );

  const focusGlobalSearch = useCallback(() => {
    const input = globalSearchInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const cycleSchoolFocus = useCallback(
    (direction: 1 | -1) => {
      if (compactSchoolRows.length === 0) {
        pushToast("No school available in the current scope.", "warning");
        return;
      }

      const activeSchoolKey =
        schoolDrawerKey ?? (selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE ? selectedSchoolScopeKey : null);
      const activeIndex = activeSchoolKey
        ? compactSchoolRows.findIndex((entry) => entry.summary.schoolKey === activeSchoolKey)
        : -1;

      let nextIndex = direction > 0 ? 0 : compactSchoolRows.length - 1;
      if (activeIndex >= 0) {
        nextIndex = activeIndex + direction;
        if (nextIndex < 0) nextIndex = compactSchoolRows.length - 1;
        if (nextIndex >= compactSchoolRows.length) nextIndex = 0;
      }

      const nextSummary = compactSchoolRows[nextIndex]?.summary;
      if (!nextSummary) return;

      setShowNavigatorManual(false);
      setActiveTopNavigator("schools");
      openSchoolDrawer(nextSummary.schoolKey);
      window.setTimeout(() => {
        focusAndScrollTo("monitor-school-records");
      }, 60);
    },
    [compactSchoolRows, focusAndScrollTo, openSchoolDrawer, pushToast, schoolDrawerKey, selectedSchoolScopeKey],
  );

  const triggerKeyboardReview = useCallback(() => {
    const activeSummary =
      (schoolDrawerKey ? schoolRequirementByKey.get(schoolDrawerKey) ?? null : null) ??
      laneFilteredQueueRows[0] ??
      actionQueueRows[0] ??
      compactSchoolRows[0]?.summary ??
      null;

    if (!activeSummary) {
      pushToast("No school is ready for review right now.", "warning");
      return;
    }

    handleReviewSchool(activeSummary);
  }, [actionQueueRows, compactSchoolRows, handleReviewSchool, laneFilteredQueueRows, pushToast, schoolDrawerKey, schoolRequirementByKey]);

  useMonitorDashboardHotkeys({
    topNavigatorIds: MONITOR_TOP_NAVIGATOR_IDS,
    quickJumpItems,
    shouldShowQuickJump,
    canResolveQuickJumpTarget,
    onNavigateTop: handleKeyboardTopNavigate,
    onQuickJump: handleQuickJump,
    onFocusGlobalSearch: focusGlobalSearch,
    onCycleSchoolFocus: cycleSchoolFocus,
    onTriggerKeyboardReview: triggerKeyboardReview,
  });

  const activeScreenMeta = useMemo(() => {
    switch (activeTopNavigator) {
      case "overview":
        return {
          title: "Overview",
          description: "Division-wide status and trend snapshot.",
          primaryLabel: "Export",
        };
      case "schools":
        return {
          title: "Schools",
          description: "Open school-level records and synchronized totals.",
          primaryLabel: "Open School",
        };
      case "reviews":
      default:
        return {
          title: "Reviews",
          description: "Review pending submissions and complete monitor actions.",
          primaryLabel: "Review",
        };
    }
  }, [activeTopNavigator]);

  const isPrimaryActionDisabled =
    activeTopNavigator === "overview"
      ? filteredRequirementRows.length === 0
      : activeTopNavigator === "schools"
        ? compactSchoolRows.length === 0
        : laneFilteredQueueRows.length === 0 && actionQueueRows.length === 0;

  const handlePrimaryAction = () => {
    if (activeTopNavigator === "overview") {
      if (filteredRequirementRows.length === 0) {
        pushToast("No rows available to export with current filters.", "warning");
        return;
      }

      const rows = filteredRequirementRows.map((row) => [
        row.schoolCode,
        row.schoolName,
        row.region,
        row.schoolStatus ?? "N/A",
        workflowLabel(row.indicatorStatus),
        row.missingCount,
        row.awaitingReviewCount,
        row.lastActivityAt ? formatDateTime(row.lastActivityAt) : "N/A",
      ]);
      const fileDate = new Date().toISOString().slice(0, 10);
      downloadCsvFile(
        `monitor-overview-${fileDate}.csv`,
        [
          "school_code",
          "school_name",
          "region",
          "school_status",
          "indicator_status",
          "missing_count",
          "for_review_count",
          "last_activity",
        ],
        rows,
      );
      pushToast(`Exported ${rows.length} school rows.`, "success");
      return;
    }

    if (activeTopNavigator === "schools") {
      const preferredSchoolKey =
        schoolDrawerKey ?? (selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE ? selectedSchoolScopeKey : null);
      if (preferredSchoolKey) {
        const preferredSummary =
          compactSchoolRows.find((entry) => entry.summary.schoolKey === preferredSchoolKey)?.summary ??
          schoolRequirementByKey.get(preferredSchoolKey);
        if (preferredSummary) {
          handleOpenSchool(preferredSummary);
          return;
        }
      }

      if (compactSchoolRows.length > 0) {
        handleOpenSchool(compactSchoolRows[0].summary);
        return;
      }

      pushToast("No school available to open in the current scope.", "warning");
      return;
    }

    const nextReview = laneFilteredQueueRows[0] ?? actionQueueRows[0] ?? null;
    if (!nextReview) {
      pushToast("No school is queued for review right now.", "warning");
      return;
    }
    handleReviewSchool(nextReview);
  };

  const quickFiltersPanelContent = (
    <>
      <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 p-3">
        <div
          className={`grid gap-2 sm:grid-cols-2 ${
            activeTopNavigator === "reviews" || showMoreFilters ? "lg:grid-cols-5" : "lg:grid-cols-4"
          }`}
        >
          <label
            title="School status"
            className="inline-flex w-full items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600 shadow-sm transition hover:border-primary-200 hover:bg-primary-50/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-100"
          >
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as SchoolStatus | "all")}
              className="w-full cursor-pointer border-none bg-transparent text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">All ({schoolStatusCounts.all})</option>
              <option value="active">Active ({schoolStatusCounts.active})</option>
              <option value="inactive">Inactive ({schoolStatusCounts.inactive})</option>
              <option value="pending">Pending ({schoolStatusCounts.pending})</option>
            </select>
          </label>

          <label
            title="Workflow status"
            className="inline-flex w-full items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600 shadow-sm transition hover:border-primary-200 hover:bg-primary-50/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-100"
          >
            <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={requirementFilter}
              onChange={(event) => setRequirementFilter(event.target.value as RequirementFilter)}
              className="w-full cursor-pointer border-none bg-transparent text-xs font-semibold text-slate-700 outline-none"
            >
              {visibleRequirementFilterOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {(activeTopNavigator === "reviews" || showMoreFilters) && (
            <label
              title="Queue lane"
              className="inline-flex w-full items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600 shadow-sm transition hover:border-primary-200 hover:bg-primary-50/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-100"
            >
              <ListChecks className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={queueLane}
                onChange={(event) => setQueueLane(event.target.value as QueueLane)}
                className="w-full cursor-pointer border-none bg-transparent text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="all">All ({queueLaneCounts.all})</option>
                <option value="urgent">Urgent ({queueLaneCounts.urgent})</option>
                <option value="returned">Returned ({queueLaneCounts.returned})</option>
                <option value="for_review">Review ({queueLaneCounts.for_review})</option>
                <option value="waiting_data">Waiting ({queueLaneCounts.waiting_data})</option>
              </select>
            </label>
          )}

          <div
            className="inline-flex w-full items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600 shadow-sm transition hover:border-primary-200 hover:bg-primary-50/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-100"
            title="Date range"
          >
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={filterDateFrom}
              onChange={(event) => setFilterDateFrom(event.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent text-xs font-semibold text-slate-700 outline-none"
            />
            <span className="text-slate-300">–</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={(event) => setFilterDateTo(event.target.value)}
              className="min-w-0 flex-1 border-none bg-transparent text-xs font-semibold text-slate-700 outline-none"
            />
            {(filterDateFrom.trim() || filterDateTo.trim()) && (
              <button
                type="button"
                onClick={() => {
                  setFilterDateFrom("");
                  setFilterDateTo("");
                }}
                className="ml-auto rounded-sm p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Clear date range"
                title="Clear date range"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowMoreFilters((current) => !current)}
            className="inline-flex w-full items-center justify-center gap-1 rounded-sm border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-primary-200 hover:bg-primary-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-100"
            aria-expanded={showMoreFilters}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
            Advanced
            {(() => {
              const hiddenActiveCount =
                (selectedSchoolScopeKey !== ALL_SCHOOL_SCOPE ? 1 : 0) +
                (selectedStudentLookupId ? 1 : 0) +
                (selectedTeacherLookupId ? 1 : 0) +
                (activeTopNavigator !== "reviews" && queueLane !== "all" ? 1 : 0);

              if (!hiddenActiveCount) return null;

              return (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-primary-50 px-1 text-[10px] font-bold text-primary-700">
                  {hiddenActiveCount}
                </span>
              );
            })()}
            <ChevronDown className={`h-3.5 w-3.5 transition ${showMoreFilters ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showMoreFilters && (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <div className="grid gap-2 md:grid-cols-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <SchoolScopeSelector
                  dropdownId="schools_filters"
                  isOpen={openScopeDropdownId === "schools_filters"}
                  rootClassName="relative flex-1"
                  isLoading={isLoading}
                  query={schoolScopeQuery}
                  selectedScope={selectedSchoolScope}
                  filteredOptions={filteredSchoolScopeOptions}
                  allOptions={schoolScopeOptions}
                  onToggle={() => toggleScopeDropdown("schools_filters")}
                  onQueryChange={setSchoolScopeQuery}
                  onClearQuery={() => setSchoolScopeQuery("")}
                  onSelectAll={handleSelectAllSchools}
                  onSelectOption={handleSelectSchoolScope}
                />
              </div>
              <div className="flex items-center gap-2">
                <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
                <StudentLookupSelector
                  dropdownId="students_filters"
                  isOpen={openScopeDropdownId === "students_filters"}
                  rootClassName="relative flex-1"
                  selectedLabel={selectedStudentLabel}
                  isSyncing={isStudentLookupSyncing}
                  query={studentLookupQuery}
                  placeholder={selectedTeacherLookup ? "Search teacher's students" : "Search students"}
                  filteredOptions={filteredStudentLookupOptions}
                  allOptions={teacherScopedStudentLookupOptions}
                  selectedStudentId={selectedStudentLookup?.id ?? null}
                  onToggle={() => toggleScopeDropdown("students_filters")}
                  onQueryChange={setStudentLookupQuery}
                  onClearQuery={() => setStudentLookupQuery("")}
                  onClearSelection={handleClearStudentLookup}
                  onSelectOption={handleSelectStudentLookup}
                />
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <TeacherLookupSelector
                  dropdownId="teachers_filters"
                  isOpen={openScopeDropdownId === "teachers_filters"}
                  rootClassName="relative flex-1"
                  selectedLabel={selectedTeacherLabel}
                  isSyncing={isTeacherLookupSyncing}
                  query={teacherLookupQuery}
                  filteredOptions={filteredTeacherLookupOptions}
                  allOptions={teacherLookupOptions}
                  selectedTeacherId={selectedTeacherLookup?.id ?? null}
                  onToggle={() => toggleScopeDropdown("teachers_filters")}
                  onQueryChange={setTeacherLookupQuery}
                  onClearQuery={() => setTeacherLookupQuery("")}
                  onClearSelection={handleClearTeacherLookup}
                  onSelectOption={handleSelectTeacherLookup}
                />
              </div>
            </div>
          </div>
        )}

        {showMoreFilters && activeTopNavigator === "overview" && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-sm border border-slate-200 bg-white px-2.5 py-2">
            <p className="text-[11px] font-semibold text-slate-700">Analytics</p>
            <button
              id="monitor-analytics-toggle"
              type="button"
              onClick={() => setShowAdvancedAnalytics((current) => !current)}
              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              {showAdvancedAnalytics ? "Hide" : "Show"}
            </button>
          </div>
        )}
      </div>

      {activeFilterChips.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Active</p>
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-100"
            >
              Clear
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => clearFilterChip(chip.id)}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
              >
                {chip.label}
                <X className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const desktopQuickJumpChips = renderQuickJumpChips(false);
  const mobileQuickJumpChips = renderQuickJumpChips(true);
  const schoolsSectionApi = useMonitorSchoolsSection({
    isMobileViewport,
    isLoading,
    isSaving,
    recordsLength: records.length,
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
    onOpenSchoolRecord: handleOpenSchoolRecord,
    onOpenSchool: handleOpenSchool,
    onReviewSchool: handleReviewSchool,
    onResetQueueFilters: resetQueueFilters,
    onClearAllFilters: clearAllFilters,
    pushToast,
    formatDateTime,
    statusTone,
    statusLabel,
    isUrgentRequirement,
    urgencyRowTone,
  });
  const schoolScopeRadarControl = (
    <SchoolScopeSelector
      dropdownId="schools_radar"
      isOpen={openScopeDropdownId === "schools_radar"}
      rootClassName="relative mt-2"
      isLoading={isLoading}
      query={schoolScopeQuery}
      selectedScope={selectedSchoolScope}
      filteredOptions={filteredSchoolScopeOptions}
      allOptions={schoolScopeOptions}
      onToggle={() => toggleScopeDropdown("schools_radar")}
      onQueryChange={setSchoolScopeQuery}
      onClearQuery={() => setSchoolScopeQuery("")}
      onSelectAll={handleSelectAllSchools}
      onSelectOption={handleSelectSchoolScope}
    />
  );
  const studentRadarControl = (
    <StudentLookupSelector
      dropdownId="students_radar"
      isOpen={openScopeDropdownId === "students_radar"}
      rootClassName="relative mt-2"
      selectedLabel={selectedStudentLabel}
      isSyncing={isStudentLookupSyncing}
      query={studentLookupQuery}
      placeholder={selectedTeacherLookup ? "Search teacher's students" : "Search students"}
      filteredOptions={filteredStudentLookupOptions}
      allOptions={teacherScopedStudentLookupOptions}
      selectedStudentId={selectedStudentLookup?.id ?? null}
      onToggle={() => toggleScopeDropdown("students_radar")}
      onQueryChange={setStudentLookupQuery}
      onClearQuery={() => setStudentLookupQuery("")}
      onClearSelection={handleClearStudentLookup}
      onSelectOption={handleSelectStudentLookup}
    />
  );
  const teacherRadarControl = (
    <TeacherLookupSelector
      dropdownId="teachers_radar"
      isOpen={openScopeDropdownId === "teachers_radar"}
      rootClassName="relative mt-2"
      selectedLabel={selectedTeacherLabel}
      isSyncing={isTeacherLookupSyncing}
      query={teacherLookupQuery}
      filteredOptions={filteredTeacherLookupOptions}
      allOptions={teacherLookupOptions}
      selectedTeacherId={selectedTeacherLookup?.id ?? null}
      onToggle={() => toggleScopeDropdown("teachers_radar")}
      onQueryChange={setTeacherLookupQuery}
      onClearQuery={() => setTeacherLookupQuery("")}
      onClearSelection={handleClearTeacherLookup}
      onSelectOption={handleSelectTeacherLookup}
    />
  );
  const schoolDrawerViewState = {
    isOpen: Boolean(schoolDrawerKey),
    showNavigatorManual,
    isMobileViewport,
    activeTopNavigator,
    activeSchoolDrawerTab,
    highlightedDrawerIndicatorKey,
    expandedDrawerIndicatorRows,
  };
  const schoolDrawerLoadingState = {
    syncedCountsLoadingSchoolKey,
    syncedCountsError,
    isSchoolDrawerSubmissionsLoading,
    schoolDrawerSubmissionsError,
  };
  const schoolDrawerData = {
    schoolDetail,
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
  };
  const schoolDrawerActions = {
    setActiveSchoolDrawerTab,
    closeSchoolDrawer,
    handleJumpToMissingIndicators,
    handleJumpToReturnedIndicators,
    toggleDrawerIndicatorLabel,
  };
  const schoolDrawerFormatting = {
    workflowTone,
    workflowLabel,
    formatDateTime,
  };

  return (
    <Shell
      title="Division Monitor Dashboard"
      subtitle="Three-screen workflow: Overview, Schools, Reviews."
      actions={
        <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-sm border border-white/20 bg-white/10 p-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => void handleRefreshDashboard()}
            disabled={isDashboardSyncing}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-white text-primary-700 shadow-sm transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
            aria-label="Refresh dashboard data"
            title={isDashboardSyncing ? "Refreshing..." : "Refresh"}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isDashboardSyncing ? "animate-spin" : ""}`} />
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
            {dashboardLastSyncedAt
              ? new Date(dashboardLastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Not synced"}
            {syncScope ? ` | ${syncScope}` : ""}
          </span>
        </div>
      }
    >
      {error && (
        <section className="mb-5 border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          {error}
        </section>
      )}

      <DashboardHelpDialog open={showHelpDialog} variant="monitor" onClose={() => setShowHelpDialog(false)} />
      <MonitorMfaResetApprovalsDialog
        open={showMfaResetApprovalsDialog}
        isAuthenticated={isAuthenticated}
        onClose={() => setShowMfaResetApprovalsDialog(false)}
      />

      {!showNavigatorManual && isMobileViewport && (
        <section className="dashboard-shell mb-4 rounded-sm border border-slate-200 bg-white p-2 lg:hidden">
          <div className="grid grid-cols-3 gap-2">
            {MONITOR_TOP_NAVIGATOR_ITEMS.map((item) => {
              const Icon = MONITOR_NAVIGATOR_ICONS[item.id];
              const isActive = activeTopNavigator === item.id;
              const meta = navigatorBadges[item.id];
              const count = typeof meta.primary === "number" && meta.primary > 0 ? meta.primary : null;

              return (
                <button
                  key={`monitor-mobile-nav-${item.id}`}
                  type="button"
                  onClick={() => handleMonitorTopNavigate(item.id)}
                  className={`rounded-sm border px-2 py-2 text-left transition ${
                    isActive
                      ? "border-primary-300 bg-primary-50 text-primary-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate text-sm font-semibold">{item.label}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    {count !== null && (
                      <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-sm border border-primary-200 bg-white px-1 py-0.5 text-[10px] font-bold text-primary-700">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                    {item.id === "reviews" && typeof meta.secondary === "number" && meta.secondary > 0 && (
                      <span className="inline-flex items-center justify-center rounded-sm border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-bold text-amber-700">
                        R{meta.secondary}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div
        className={`dashboard-left-layout mb-5 min-w-0 lg:grid lg:items-stretch lg:gap-6 lg:transition-[grid-template-columns] lg:duration-[240ms] lg:ease-in-out ${
          isNavigatorCompact ? "lg:grid-cols-[5.25rem_minmax(0,1fr)]" : "lg:grid-cols-[17rem_minmax(0,1fr)]"
        }`}
      >
        <aside className="dashboard-side-rail hidden w-full rounded-sm p-3 transition-[padding] duration-[240ms] ease-in-out lg:block lg:w-auto lg:self-stretch lg:min-h-full">
          <div className="dashboard-side-rail-sticky flex min-h-full flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className={`w-full ${showNavigatorHeaderText ? "" : "text-center"}`}>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (isMobileViewport) {
                        setIsNavigatorVisible((current) => !current);
                        return;
                      }
                      setIsNavigatorCompact((current) => !current);
                    }}
                    className={`inline-flex shrink-0 items-center rounded-sm border border-primary-400/40 bg-primary-700/65 text-white transition hover:bg-primary-700 ${
                      showNavigatorHeaderText
                        ? "h-11 w-full justify-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide"
                        : "h-11 w-11 justify-center"
                    }`}
                    aria-label={
                      isMobileViewport
                        ? isNavigatorVisible
                          ? "Hide navigator"
                          : "Show navigator"
                        : isNavigatorCompact
                          ? "Expand navigator"
                          : "Collapse navigator"
                    }
                    title={
                      isMobileViewport
                        ? isNavigatorVisible
                          ? "Hide navigator"
                          : "Show navigator"
                        : isNavigatorCompact
                          ? "Expand navigator"
                          : "Collapse navigator"
                    }
                  >
                    {isMobileViewport ? (
                      isNavigatorVisible ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                    ) : isNavigatorCompact ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronLeft className="h-3.5 w-3.5" />
                    )}
                    {showNavigatorHeaderText && (
                      <span>
                        {isMobileViewport
                          ? isNavigatorVisible
                            ? "Hide Menu"
                            : "Show Menu"
                          : isNavigatorCompact
                            ? "Expand Menu"
                            : "Collapse Menu"}
                      </span>
                    )}
                  </button>
                </div>
                <p
                  className={`overflow-hidden text-[11px] font-medium uppercase tracking-wide text-primary-100 transition-[max-height,opacity,margin] duration-[240ms] ease-in-out ${
                    showNavigatorHeaderText ? "mt-1 max-h-5 opacity-100" : "mt-0 max-h-0 opacity-0"
                  }`}
                >
                  Division Monitor
                </p>
              </div>
            </div>

            <div
              className={`overflow-hidden transition-[max-height,opacity,margin] duration-[240ms] ease-in-out ${
                shouldRenderNavigatorItems ? "mt-4 max-h-[34rem] opacity-100" : "mt-0 max-h-0 opacity-0 pointer-events-none"
              }`}
            >
              <div className={`grid ${isNavigatorCompact ? "gap-2" : "gap-2.5"}`}>
                {MONITOR_TOP_NAVIGATOR_ITEMS.map((item, index) => {
                  const Icon = MONITOR_NAVIGATOR_ICONS[item.id];
                  const isActive = activeTopNavigator === item.id;
                  const meta = navigatorBadges[item.id];
                  const hasPrimaryBadge = typeof meta.primary === "number" && meta.primary > 0;
                  const hasSecondaryBadge = typeof meta.secondary === "number" && meta.secondary > 0;
                  const urgencyTone =
                    meta.urgency === "high" ? "bg-rose-500" : meta.urgency === "medium" ? "bg-amber-400" : "bg-transparent";

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleMonitorTopNavigate(item.id)}
                      className={navigatorButtonClass(isActive, isNavigatorCompact)}
                      title={`${item.label} (Alt+${index + 1})`}
                      aria-current={isActive ? "page" : undefined}
                      aria-label={`Open ${item.label}`}
                    >
                      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                        <Icon className="h-4 w-4" />
                        {meta.urgency !== "none" && <span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${urgencyTone}`} />}
                      </span>
                      {!isNavigatorCompact && <span className="flex-1 truncate text-left">{item.label}</span>}

                      {!isNavigatorCompact && hasPrimaryBadge && (
                        <span className="ml-auto inline-flex items-center gap-1">
                          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-sm border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
                            {meta.primary}
                          </span>
                          {item.id === "reviews" && hasSecondaryBadge && (
                            <span className="inline-flex items-center justify-center rounded-sm border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                              R{meta.secondary}
                            </span>
                          )}
                        </span>
                      )}

                      {isNavigatorCompact && hasPrimaryBadge && (
                        <span className="absolute right-1 top-1 inline-flex min-w-[1rem] items-center justify-center rounded-sm border border-primary-200 bg-primary-50 px-1 text-[9px] font-bold text-primary-700">
                          {meta.primary && meta.primary > 99 ? "99+" : meta.primary}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className={`overflow-hidden transition-[max-height,opacity,margin] duration-[240ms] ease-in-out ${
                shouldRenderNavigatorItems ? "mt-3 max-h-24 opacity-100" : "mt-0 max-h-0 opacity-0 pointer-events-none"
              }`}
            >
              <div className={`border-t border-primary-400/30 pt-3 ${isNavigatorCompact ? "flex justify-center" : ""}`}>
                <button
                  type="button"
                  onClick={() => {
                    setShowNavigatorManual((current) => !current);
                    setFocusedSectionId(null);
                    closeSchoolDrawer();
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-sm border text-white transition ${
                    showNavigatorManual
                      ? "border-primary-100 bg-primary-700"
                      : "border-primary-400/40 bg-primary-700/65 hover:bg-primary-700"
                  } ${
                    isNavigatorCompact ? "h-11 w-11 justify-center p-0" : "h-11 w-full px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  }`}
                  title={showNavigatorManual ? "Close User Manual" : "Open User Manual"}
                  aria-label={showNavigatorManual ? "Close user manual" : "Open user manual"}
                >
                  <BookOpenText className="h-3.5 w-3.5" />
                  {!isNavigatorCompact && <span>{showNavigatorManual ? "Back to Data" : "User Manual"}</span>}
                </button>
              </div>
            </div>
          </div>
        </aside>
        <div className="dashboard-main-pane mt-4 min-w-0 lg:mt-0">
          {showNavigatorManual && (
            <section id="monitor-user-manual" className="dashboard-shell mb-5 overflow-hidden rounded-sm border border-slate-200 bg-white animate-fade-slide">
              <div className="min-h-[72vh] p-4 md:p-6 xl:p-8">
                <div className="mx-auto flex h-full w-full max-w-6xl flex-col justify-center gap-6">
                  <header className="text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-700">Division Monitor Dashboard</p>
                    <h2 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">User Manual</h2>
                    <p className="mx-auto mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                      This guide appears in the main workspace so monitors can review process steps clearly before working on live data.
                    </p>
                  </header>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                    <article className="rounded-sm border border-slate-200 bg-slate-50 p-4 md:p-5">
                      <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">Step-by-step Workflow</p>
                      <ol className="mt-3 space-y-3">
                        {MONITOR_NAVIGATOR_MANUAL.map((step, index) => (
                          <li key={step.id} className="rounded-sm border border-slate-200 bg-white p-3">
                            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-sm bg-primary-100 text-xs font-bold text-primary-700">
                                {index + 1}
                              </span>
                              {step.title}
                            </p>
                            <p className="mt-2 text-sm font-medium text-slate-700">{step.objective}</p>
                            <ul className="mt-2 space-y-1">
                              {step.actions.map((action) => (
                                <li key={`${step.id}-${action}`} className="ml-5 list-disc text-sm text-slate-700">
                                  {action}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-sm font-semibold text-primary-700">Done when: {step.doneWhen}</p>
                          </li>
                        ))}
                      </ol>
                    </article>

                    <aside className="space-y-4">
                      <article className="rounded-sm border border-slate-200 bg-white p-4 md:p-5">
                        <p className="text-sm font-semibold uppercase tracking-wide text-slate-700">Workflow Status Guide</p>
                        <ul className="mt-3 space-y-2">
                          {MONITOR_MANUAL_STATUS_GUIDE.map((item) => (
                            <li key={item} className="ml-5 list-disc text-sm text-slate-700">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </article>
                      <article className="rounded-sm border border-primary-200 bg-primary-50 p-4 md:p-5">
                        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Quick Reminders</p>
                        <ul className="mt-3 space-y-2">
                          <li className="ml-5 list-disc text-sm text-primary-700">Review urgent schools first before routine checks.</li>
                          <li className="ml-5 list-disc text-sm text-primary-700">Write clear return notes to reduce repeated revisions.</li>
                          <li className="ml-5 list-disc text-sm text-primary-700">Use school and learner filters before sending reminders.</li>
                        </ul>
                      </article>
                      <button
                        type="button"
                        onClick={() => setShowNavigatorManual(false)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                      >
                        Return to Dashboard Data
                      </button>
                    </aside>
                  </div>
                </div>
              </div>
            </section>
          )}

          {!showNavigatorManual && (
            <section className="dashboard-shell mb-5 rounded-sm border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">{activeScreenMeta.title}</h2>
                  <p className="mt-1 text-xs text-slate-600">{activeScreenMeta.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrimaryAction}
                    disabled={isPrimaryActionDisabled}
                    className="inline-flex items-center gap-1 rounded-sm border border-primary-300/70 bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {activeScreenMeta.primaryLabel}
                  </button>
                  <button
                    id="monitor-submission-filters-toggle"
                    type="button"
                    onClick={() => setShowAdvancedFilters((current) => !current)}
                    aria-expanded={showAdvancedFilters}
                    className={`inline-flex items-center gap-1 rounded-sm border px-3 py-2 text-xs font-semibold transition ${
                      activeFilterChips.length > 0
                        ? "border-primary-200 bg-primary-50 text-primary-800 hover:bg-primary-100"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                  <Filter className="h-3.5 w-3.5" />
                    {showAdvancedFilters ? "Close Filters" : "Filters"}
                    {activeFilterChips.length > 0 && (
                      <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-white px-1 text-[10px] font-bold text-primary-700">
                        {activeFilterChips.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </section>
          )}

          {!showNavigatorManual && (
            <section className="dashboard-shell dashboard-shell-visible mb-5 rounded-sm">
              <div className="dashboard-nav-shell border-b border-slate-200 bg-white/95 p-2 backdrop-blur">
                <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <label className="relative w-full lg:max-w-lg">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={globalSearchInputRef}
                      type="text"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search school code, school name, or school head"
                      className="w-full rounded-sm border border-slate-200 bg-white py-2 pl-10 pr-20 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      /
                    </span>
                  </label>
                  <p className="hidden text-[11px] font-medium text-slate-600 lg:block">
                    <span className="font-semibold text-slate-800">/</span> Search ·{" "}
                    <span className="font-semibold text-slate-800">J/K</span> Navigate ·{" "}
                    <span className="font-semibold text-slate-800">R</span> Review
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <button
                    type="button"
                    title="Schools in the current scope."
                    onClick={() => setSchoolQuickPreset("all")}
                    className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                      schoolQuickPreset === "all"
                        ? "border-slate-300 bg-slate-100 text-slate-900"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    Schools: {stickySummaryStats.totalSchools}
                  </button>
                  <button
                    type="button"
                    title="Submitted packages waiting for monitor review."
                    onClick={() => setSchoolQuickPreset("pending")}
                    className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                      schoolQuickPreset === "pending"
                        ? "border-primary-300 bg-primary-100 text-primary-800"
                        : "border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
                    }`}
                  >
                    Pending: {stickySummaryStats.pending}
                  </button>
                  <button
                    type="button"
                    title="Schools missing a compliance record or indicator submission."
                    onClick={() => setSchoolQuickPreset("missing")}
                    className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                      schoolQuickPreset === "missing"
                        ? "border-indigo-300 bg-indigo-100 text-indigo-800"
                        : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    }`}
                  >
                    Missing: {stickySummaryStats.missing}
                  </button>
                  <button
                    type="button"
                    title="Packages returned to school heads for correction."
                    onClick={() => setSchoolQuickPreset("returned")}
                    className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                      schoolQuickPreset === "returned"
                        ? "border-amber-300 bg-amber-100 text-amber-800"
                        : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    }`}
                  >
                    Returned: {stickySummaryStats.returned}
                  </button>
                  <button
                    type="button"
                    title="Schools with missing or returned requirements."
                    onClick={() => setSchoolQuickPreset("high_risk")}
                    className={`inline-flex items-center rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition ${
                      schoolQuickPreset === "high_risk"
                        ? "border-rose-300 bg-rose-100 text-rose-800"
                        : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    }`}
                  >
                    High Risk: {stickySummaryStats.atRisk}
                  </button>
                  <button
                    type="button"
                    title="Refresh dashboard data."
                    onClick={() => void handleRefreshDashboard()}
                    disabled={isDashboardSyncing}
                    className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isDashboardSyncing ? "animate-spin" : ""}`} />
                    {isDashboardSyncing
                      ? "Syncing..."
                      : dashboardLastSyncedAt
                        ? `Sync: ${new Date(dashboardLastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                        : "Sync: N/A"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Presets</span>
                  {SCHOOL_QUICK_PRESET_OPTIONS.map((preset) => {
                    const isActive = schoolQuickPreset === preset.id;
                    const count = schoolPresetCounts[preset.id];

                    return (
                      <button
                        key={`sticky-preset-${preset.id}`}
                        type="button"
                        title={preset.hint}
                        onClick={() => setSchoolQuickPreset(preset.id)}
                        className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-semibold transition ${
                          isActive
                            ? "border-primary-300 bg-primary-100 text-primary-800"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span>{preset.label}</span>
                        <span className="rounded-sm bg-slate-100 px-1 text-[10px] font-bold text-slate-700">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                  </div>
                </div>
              </div>
            </section>
          )}

          {!showNavigatorManual && showSubmissionFilters && (
            <>
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(false)}
                className="fixed inset-0 z-[72] bg-slate-900/40"
                aria-label="Close filters"
              />
              <section
                id="monitor-submission-filters"
                role="dialog"
                aria-modal="true"
                aria-label="Filters"
                className={`fixed z-[73] border border-slate-200 bg-white p-4 shadow-2xl animate-fade-slide ${
                  isMobileViewport
                    ? "inset-x-0 bottom-0 max-h-[84vh] overflow-y-auto rounded-t-sm"
                    : "left-1/2 top-24 w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 rounded-sm"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Filters</h2>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedFilters(false)}
                    className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
                    aria-label="Close filters"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {quickFiltersPanelContent}
              </section>
            </>
          )}

      {!showNavigatorManual && activeTopNavigator === "overview" && (
        <MonitorOverviewSection
          isMobileViewport={isMobileViewport}
          desktopQuickJumpChips={desktopQuickJumpChips}
          mobileQuickJumpChips={mobileQuickJumpChips}
          sectionFocusClass={sectionFocusClass}
          needsActionCount={needsActionCount}
          returnedCount={returnedCount}
          submittedCount={submittedCount}
          renderAdvancedAnalytics={renderAdvancedAnalytics}
          isHidingAdvancedAnalytics={isHidingAdvancedAnalytics}
          targetsMet={targetsMet}
          syncAlerts={syncAlerts}
          statusDistribution={statusDistribution}
          regionAggregates={regionAggregates}
          submissionTrend={submissionTrend}
        />
      )}

      {!showNavigatorManual && activeTopNavigator === "reviews" && (
        <MonitorReviewsSection
          isMobileViewport={isMobileViewport}
          desktopQuickJumpChips={desktopQuickJumpChips}
          mobileQuickJumpChips={mobileQuickJumpChips}
          sectionFocusClass={sectionFocusClass}
          needsActionCount={needsActionCount}
          returnedCount={returnedCount}
          submittedCount={submittedCount}
          queueLaneLabel={queueLaneLabel(queueLane)}
          autoAdvanceQueue={autoAdvanceQueue}
          setAutoAdvanceQueue={setAutoAdvanceQueue}
          paginatedRequirementRows={paginatedRequirementRows}
          laneFilteredQueueRows={laneFilteredQueueRows}
          schoolDrawerKey={schoolDrawerKey}
          remindingSchoolKey={remindingSchoolKey}
          resetQueueFilters={resetQueueFilters}
          clearAllFilters={clearAllFilters}
          handleReviewSchool={handleReviewSchool}
          handleOpenSchool={handleOpenSchool}
          handleSendReminder={handleSendReminder}
          workflowTone={workflowTone}
          workflowLabel={workflowLabel}
          queuePriorityTone={queuePriorityTone}
          queuePriorityLabel={queuePriorityLabel}
          urgencyRowTone={urgencyRowTone}
          isUrgentRequirement={isUrgentRequirement}
          sanitizeAnchorToken={sanitizeAnchorToken}
          formatDateTime={formatDateTime}
          safeRequirementsPage={safeRequirementsPage}
          totalRequirementPages={totalRequirementPages}
          setRequirementsPage={setRequirementsPage}
          queueWorkspaceSchoolFilterKeys={queueWorkspaceSchoolFilterKeys}
          records={records}
          pushToast={pushToast}
          sendReminderForSchool={sendReminderForSchool}
          handleQueueSchoolFocus={handleQueueSchoolFocus}
          handleQueueReviewCompleted={handleQueueReviewCompleted}
        />
      )}

      {!showNavigatorManual && activeTopNavigator === "schools" && (
        <>
          <MonitorSchoolsSection
            sectionFocusClass={sectionFocusClass}
            isMobileViewport={isMobileViewport}
            desktopQuickJumpChips={desktopQuickJumpChips}
            mobileQuickJumpChips={mobileQuickJumpChips}
            totalSchoolsInScope={totalSchoolsInScope}
            monitorRadarTotals={monitorRadarTotals}
            schoolScopeRadarControl={schoolScopeRadarControl}
            studentRadarControl={studentRadarControl}
            teacherRadarControl={teacherRadarControl}
            paginatedCompactSchoolRowsCount={paginatedCompactSchoolRows.length}
            compactSchoolRowsCount={compactSchoolRows.length}
            schoolActionsMenuRef={schoolsSectionApi.schoolActionsMenuRef}
            bulkImportInputRef={schoolsSectionApi.bulkImportInputRef}
            onBulkImportFileChange={schoolsSectionApi.handleBulkImportFileChange}
            onOpenCreateRecordForm={schoolsSectionApi.openCreateRecordForm}
            onToggleAccountsPanel={schoolsSectionApi.toggleSchoolHeadAccountsPanel}
            showSchoolHeadAccountsPanel={schoolsSectionApi.showSchoolHeadAccountsPanel}
            onToggleActionsMenu={schoolsSectionApi.toggleActionsMenu}
            isSchoolActionsMenuOpen={schoolsSectionApi.isSchoolActionsMenuOpen}
            onOpenBulkImportPicker={schoolsSectionApi.openBulkImportPicker}
            isBulkImporting={schoolsSectionApi.isBulkImporting}
            onToggleArchivedRecords={() => {
              void schoolsSectionApi.toggleArchivedRecords();
            }}
            showArchivedRecords={schoolsSectionApi.showArchivedRecords}
            onToggleSchoolLearnerRecords={() => {
              schoolsSectionApi.closeActionsMenu();
              setShowSchoolLearnerRecords((current) => !current);
            }}
            showSchoolLearnerRecords={showSchoolLearnerRecords}
            onShowMfaResetApprovals={() => {
              schoolsSectionApi.closeActionsMenu();
              setShowMfaResetApprovalsDialog(true);
            }}
            schoolHeadAccountsPanelProps={schoolsSectionApi.schoolHeadAccountsPanelProps}
            messages={schoolsSectionApi.schoolMessagesProps}
            schoolRecordFormProps={schoolsSectionApi.schoolRecordFormProps}
            schoolRecordsListProps={schoolsSectionApi.schoolRecordsListProps}
            archivedSchoolsProps={schoolsSectionApi.archivedSchoolsProps}
          />
        <MonitorLearnerRecordsSection
          sectionFocusClass={sectionFocusClass}
          showSchoolLearnerRecords={showSchoolLearnerRecords}
          setShowSchoolLearnerRecords={setShowSchoolLearnerRecords}
          filteredSchoolKeys={filteredSchoolKeys}
          studentRecordsLookupTerm={studentRecordsLookupTerm}
        />
        </>
      )}

      <MonitorSchoolDrawer
        viewState={schoolDrawerViewState}
        loadingState={schoolDrawerLoadingState}
        data={schoolDrawerData}
        actions={schoolDrawerActions}
        formatting={schoolDrawerFormatting}
      />

      <div
        style={{ top: "calc(var(--shell-sticky-top, 10rem) + 0.75rem)" }}
        className="pointer-events-none fixed right-4 z-[85] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <article
            key={toast.id}
            className={`pointer-events-auto rounded-sm border px-3 py-2 text-xs font-semibold shadow-lg ${
              toast.tone === "success"
                ? "border-primary-200 bg-primary-50 text-primary-700"
                : toast.tone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p>{toast.message}</p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-sm border border-transparent p-0.5 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>
        ))}
      </div>
        </div>
      </div>
    </Shell>
  );
}
















