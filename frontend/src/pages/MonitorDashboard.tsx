import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BellRing,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
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
import { MonitorManualScreen } from "@/pages/monitor/MonitorManualScreen";
import { MonitorMobileNavigator } from "@/pages/monitor/MonitorMobileNavigator";
import { MonitorOverviewSection } from "@/pages/monitor/MonitorOverviewSection";
import { MonitorQuickJumpChips } from "@/pages/monitor/MonitorQuickJumpChips";
import { MonitorReviewsSection } from "@/pages/monitor/MonitorReviewsSection";
import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import { MonitorSchoolsSection } from "@/pages/monitor/MonitorSchoolsSection";
import { MonitorSideNavigator } from "@/pages/monitor/MonitorSideNavigator";
import { SchoolScopeSelector } from "@/pages/monitor/SchoolScopeSelector";
import { MonitorToastStack } from "@/pages/monitor/MonitorToastStack";
import { StudentLookupSelector } from "@/pages/monitor/StudentLookupSelector";
import { TeacherLookupSelector } from "@/pages/monitor/TeacherLookupSelector";
import {
  MONITOR_QUICK_JUMPS,
  MONITOR_TOP_NAVIGATOR_IDS,
  RECORD_PAGE_SIZE,
  REQUIREMENT_FILTER_OPTIONS,
  REQUIREMENT_PAGE_SIZE,
  SCHOOL_QUICK_PRESET_OPTIONS,
} from "@/pages/monitor/monitorDashboardConfig";
import {
  downloadCsvFile,
  isUrgentRequirement,
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
import { useMonitorFilterUi } from "@/pages/monitor/useMonitorFilterUi";
import { useMonitorDrawerJumpActions } from "@/pages/monitor/useMonitorDrawerJumpActions";
import { useMonitorPageStateGuard } from "@/pages/monitor/useMonitorPageStateGuard";
import { useMonitorRadarTotals } from "@/pages/monitor/useMonitorRadarTotals";
import { useMonitorQuickJump } from "@/pages/monitor/useMonitorQuickJump";
import { useMonitorRequirementData } from "@/pages/monitor/useMonitorRequirementData";
import { useMonitorReviewFlow } from "@/pages/monitor/useMonitorReviewFlow";
import { useMonitorSchoolActionRouter } from "@/pages/monitor/useMonitorSchoolActionRouter";
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
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);

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
  const quickJump = useMonitorQuickJump({
    quickJumpItems,
    focusedSectionId,
    showAdvancedFilters,
    showAdvancedAnalytics,
    setShowAdvancedFilters,
    setShowAdvancedAnalytics,
    focusAndScrollTo,
  });
  const {
    activeFilterChips,
    hiddenAdvancedFilterCount,
    clearAllFilters,
    resetQueueFilters,
    clearFilterChip,
  } = useMonitorFilterUi({
    filtersHydrated,
    activeTopNavigator,
    queueLane,
    selectedSchoolScopeKey,
    selectedStudentLookupId,
    selectedTeacherLookupId,
    filterDateFrom,
    filterDateTo,
    requirementFilter,
    schoolQuickPreset,
    effectiveSearch,
    statusFilter,
    selectedSchoolScope,
    selectedStudentLookup,
    selectedTeacherLookup,
    showAdvancedFilters,
    openScopeDropdownId,
    setShowMoreFilters,
    setShowAdvancedFilters,
    resetMonitorFilters,
    setSchoolScopeQuery,
    setStudentLookupQuery,
    setTeacherLookupQuery,
    setOpenScopeDropdownId,
    setSearch,
    setStatusFilter,
    setRequirementFilter,
    setQueueLane,
    setSchoolQuickPreset,
    setFilterDateFrom,
    setFilterDateTo,
    setSelectedSchoolScopeKey,
    setSelectedStudentLookupId,
    setSelectedTeacherLookupId,
  });
  useMonitorPageStateGuard({
    filterDateFrom,
    filterDateTo,
    requirementFilter,
    schoolQuickPreset,
    effectiveSearch,
    selectedSchoolScopeKey,
    selectedStudentLookupId,
    selectedTeacherLookupId,
    statusFilter,
    requirementsPage,
    recordsPage,
    totalRequirementPages,
    totalRecordPages,
    visibleRequirementFilterIds,
    setRequirementsPage,
    setRecordsPage,
    setRequirementFilter,
  });
  const {
    remindingSchoolKey,
    sendReminderForSchool,
    handleReviewSchool,
    handleOpenSchool,
    handleSendReminder,
    handleReviewRecord,
    handleOpenSchoolRecord,
    handleQueueSchoolFocus,
  } = useMonitorSchoolActionRouter({
    scopedRecordBySchoolKey,
    recordBySchoolKey,
    schoolRequirementByKey,
    setActiveTopNavigator,
    openSchoolDrawer,
    focusAndScrollTo,
    pushToast,
    sendReminder,
  });
  const {
    handleJumpToMissingIndicators,
    handleJumpToReturnedIndicators,
  } = useMonitorDrawerJumpActions({
    missingDrawerIndicatorKeys,
    returnedDrawerIndicatorKeys,
    schoolIndicatorMatrix,
    setActiveSchoolDrawerTab,
    setHighlightedDrawerIndicatorKey,
    pushToast,
  });

  const handleMonitorTopNavigate = useCallback((id: MonitorTopNavigatorId) => {
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
  }, [focusAndScrollTo, isMobileViewport, setActiveTopNavigator, setIsNavigatorVisible, setShowNavigatorManual]);

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
    shouldShowQuickJump: quickJump.shouldShowQuickJump,
    canResolveQuickJumpTarget: quickJump.canResolveQuickJumpTarget,
    onNavigateTop: handleMonitorTopNavigate,
    onQuickJump: quickJump.handleQuickJump,
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
            {hiddenAdvancedFilterCount > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-primary-50 px-1 text-[10px] font-bold text-primary-700">
                {hiddenAdvancedFilterCount}
              </span>
            )}
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

  const desktopQuickJumpChips = (
    <MonitorQuickJumpChips
      items={quickJumpItems}
      mobile={false}
      getQuickJumpMeta={quickJump.getQuickJumpMeta}
      onQuickJump={quickJump.handleQuickJump}
    />
  );
  const mobileQuickJumpChips = (
    <MonitorQuickJumpChips
      items={quickJumpItems}
      mobile
      getQuickJumpMeta={quickJump.getQuickJumpMeta}
      onQuickJump={quickJump.handleQuickJump}
    />
  );
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
  const handleToggleNavigatorChrome = useCallback(() => {
    if (isMobileViewport) {
      setIsNavigatorVisible((current) => !current);
      return;
    }

    setIsNavigatorCompact((current) => !current);
  }, [isMobileViewport, setIsNavigatorCompact, setIsNavigatorVisible]);
  const handleToggleNavigatorManual = useCallback(() => {
    setShowNavigatorManual((current) => !current);
    setFocusedSectionId(null);
    closeSchoolDrawer();
  }, [closeSchoolDrawer, setFocusedSectionId, setShowNavigatorManual]);

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
        <MonitorMobileNavigator
          activeTopNavigator={activeTopNavigator}
          navigatorBadges={navigatorBadges}
          onNavigate={handleMonitorTopNavigate}
        />
      )}

      <div
        className={`dashboard-left-layout mb-5 min-w-0 lg:grid lg:items-stretch lg:gap-6 lg:transition-[grid-template-columns] lg:duration-[240ms] lg:ease-in-out ${
          isNavigatorCompact ? "lg:grid-cols-[5.25rem_minmax(0,1fr)]" : "lg:grid-cols-[17rem_minmax(0,1fr)]"
        }`}
      >
        <MonitorSideNavigator
          activeTopNavigator={activeTopNavigator}
          navigatorBadges={navigatorBadges}
          isNavigatorCompact={isNavigatorCompact}
          isNavigatorVisible={isNavigatorVisible}
          isMobileViewport={isMobileViewport}
          showNavigatorManual={showNavigatorManual}
          shouldRenderNavigatorItems={shouldRenderNavigatorItems}
          showNavigatorHeaderText={showNavigatorHeaderText}
          onToggleNavigator={handleToggleNavigatorChrome}
          onNavigate={handleMonitorTopNavigate}
          onToggleManual={handleToggleNavigatorManual}
        />
        <div className="dashboard-main-pane mt-4 min-w-0 lg:mt-0">
          {showNavigatorManual && <MonitorManualScreen onClose={() => setShowNavigatorManual(false)} />}

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

      <MonitorToastStack toasts={toasts} onDismiss={dismissToast} />
        </div>
      </div>
    </Shell>
  );
}
















