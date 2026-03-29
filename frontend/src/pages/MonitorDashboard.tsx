import { useCallback, useMemo, useRef, useState } from "react";
import { DashboardHelpDialog } from "@/components/DashboardHelpDialog";
import { MonitorMfaResetApprovalsDialog } from "@/components/MonitorMfaResetApprovalsDialog";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/context/Auth";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import { useStudentData } from "@/context/StudentData";
import { useTeacherData } from "@/context/TeacherData";
import { MonitorSchoolDrawer } from "@/pages/monitor/MonitorSchoolDrawer";
import { MonitorDashboardToolbar } from "@/pages/monitor/MonitorDashboardToolbar";
import { MonitorFiltersPanel } from "@/pages/monitor/MonitorFiltersPanel";
import { MonitorLearnerRecordsSection } from "@/pages/monitor/MonitorLearnerRecordsSection";
import { MonitorManualScreen } from "@/pages/monitor/MonitorManualScreen";
import { MonitorMobileNavigator } from "@/pages/monitor/MonitorMobileNavigator";
import { MonitorDashboardShellActions } from "@/pages/monitor/MonitorDashboardShellActions";
import { MonitorOverviewSection } from "@/pages/monitor/MonitorOverviewSection";
import { MonitorReviewsSection } from "@/pages/monitor/MonitorReviewsSection";
import { MonitorSchoolsSection } from "@/pages/monitor/MonitorSchoolsSection";
import { MonitorSideNavigator } from "@/pages/monitor/MonitorSideNavigator";
import { MonitorToastStack } from "@/pages/monitor/MonitorToastStack";
import {
  MONITOR_QUICK_JUMPS,
  MONITOR_TOP_NAVIGATOR_IDS,
  RECORD_PAGE_SIZE,
  REQUIREMENT_FILTER_OPTIONS,
  REQUIREMENT_PAGE_SIZE,
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
import { useMonitorDashboardGlobalCommands } from "@/pages/monitor/useMonitorDashboardGlobalCommands";
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
import { useMonitorDashboardBindings } from "@/pages/monitor/useMonitorDashboardBindings";
import { useMonitorDashboardCommands } from "@/pages/monitor/useMonitorDashboardCommands";
import { useMonitorUiRefresh } from "@/pages/monitor/useMonitorUiRefresh";
import { useSchoolDrawer } from "@/pages/monitor/useSchoolDrawer";
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
    activateSchoolHeadAccount,
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
  const {
    handleRefreshDashboard,
    handleMonitorTopNavigate,
  } = useMonitorDashboardGlobalCommands({
    refreshRecords,
    refreshSubmissions,
    refreshStudents,
    refreshTeachers,
    onToast: pushToast,
    setShowNavigatorManual,
    setActiveTopNavigator,
    focusAndScrollTo,
    isMobileViewport,
    setIsNavigatorVisible,
  });

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
  const {
    activeScreenMeta,
    isPrimaryActionDisabled,
    focusGlobalSearch,
    cycleSchoolFocus,
    triggerKeyboardReview,
    handlePrimaryAction,
  } = useMonitorDashboardCommands({
    activeTopNavigator,
    filteredRequirementRows,
    compactSchoolRows,
    laneFilteredQueueRows,
    actionQueueRows,
    schoolRequirementByKey,
    selectedSchoolScopeKey,
    schoolDrawerKey,
    globalSearchInputRef,
    onToast: pushToast,
    setShowNavigatorManual,
    setActiveTopNavigator,
    openSchoolDrawer,
    onReviewSchool: handleReviewSchool,
    onOpenSchool: handleOpenSchool,
    focusAndScrollTo,
  });

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

  const {
    quickJumpBindings,
    quickFiltersProps,
    schoolScopeRadarSelectorProps,
    studentRadarSelectorProps,
    teacherRadarSelectorProps,
    schoolDrawerProps,
  } = useMonitorDashboardBindings({
    quickJumpItems,
    getQuickJumpMeta: quickJump.getQuickJumpMeta,
    onQuickJump: quickJump.handleQuickJump,
    activeTopNavigator,
    showMoreFilters,
    setShowMoreFilters,
    hiddenAdvancedFilterCount,
    statusFilter,
    onStatusFilterChange: setStatusFilter,
    schoolStatusCounts,
    requirementFilter,
    onRequirementFilterChange: setRequirementFilter,
    visibleRequirementFilterOptions,
    queueLane,
    onQueueLaneChange: setQueueLane,
    queueLaneCounts,
    filterDateFrom,
    filterDateTo,
    onFilterDateFromChange: setFilterDateFrom,
    onFilterDateToChange: setFilterDateTo,
    isLoading,
    schoolScopeQuery,
    setSchoolScopeQuery,
    selectedSchoolScope,
    filteredSchoolScopeOptions,
    schoolScopeOptions,
    handleSelectAllSchools,
    handleSelectSchoolScope,
    studentLookupQuery,
    setStudentLookupQuery,
    selectedStudentLabel,
    isStudentLookupSyncing,
    studentLookupPlaceholder: selectedTeacherLookup ? "Search teacher's students" : "Search students",
    filteredStudentLookupOptions,
    teacherScopedStudentLookupOptions,
    selectedStudentId: selectedStudentLookup?.id ?? null,
    handleClearStudentLookup,
    handleSelectStudentLookup,
    teacherLookupQuery,
    setTeacherLookupQuery,
    selectedTeacherLabel,
    isTeacherLookupSyncing,
    filteredTeacherLookupOptions,
    teacherLookupOptions,
    selectedTeacherId: selectedTeacherLookup?.id ?? null,
    handleClearTeacherLookup,
    handleSelectTeacherLookup,
    openScopeDropdownId,
    toggleScopeDropdown,
    showAdvancedAnalytics,
    setShowAdvancedAnalytics,
    activeFilterChips,
    clearAllFilters,
    clearFilterChip,
    schoolDrawerBuildArgs: {
      isOpen: Boolean(schoolDrawerKey),
      showNavigatorManual,
      isMobileViewport,
      activeTopNavigator,
      activeSchoolDrawerTab,
      highlightedDrawerIndicatorKey,
      expandedDrawerIndicatorRows,
      syncedCountsLoadingSchoolKey,
      syncedCountsError,
      isSchoolDrawerSubmissionsLoading,
      schoolDrawerSubmissionsError,
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
      setActiveSchoolDrawerTab,
      closeSchoolDrawer,
      handleJumpToMissingIndicators,
      handleJumpToReturnedIndicators,
      toggleDrawerIndicatorLabel,
      workflowTone,
      workflowLabel,
      formatDateTime,
    },
  });
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
    activateSchoolHeadAccount,
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
        <MonitorDashboardShellActions
          isDashboardSyncing={isDashboardSyncing}
          dashboardLastSyncedAt={dashboardLastSyncedAt}
          syncStatus={syncStatus}
          syncScope={syncScope}
          onRefresh={() => void handleRefreshDashboard()}
          onOpenHelp={() => setShowHelpDialog(true)}
        />
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
            <MonitorDashboardToolbar
              activeScreenMeta={activeScreenMeta}
              isPrimaryActionDisabled={isPrimaryActionDisabled}
              onPrimaryAction={handlePrimaryAction}
              showAdvancedFilters={showAdvancedFilters}
              activeFilterCount={activeFilterChips.length}
              onToggleFilters={() => setShowAdvancedFilters((current) => !current)}
              search={search}
              onSearchChange={setSearch}
              globalSearchInputRef={globalSearchInputRef}
              schoolQuickPreset={schoolQuickPreset}
              onSelectSchoolQuickPreset={setSchoolQuickPreset}
              stickySummaryStats={stickySummaryStats}
              schoolPresetCounts={schoolPresetCounts}
              onRefresh={() => void handleRefreshDashboard()}
              isDashboardSyncing={isDashboardSyncing}
              dashboardLastSyncedAt={dashboardLastSyncedAt}
            />
          )}

          <MonitorFiltersPanel
            isOpen={!showNavigatorManual && showSubmissionFilters}
            isMobileViewport={isMobileViewport}
            onClose={() => setShowAdvancedFilters(false)}
            quickFiltersProps={quickFiltersProps}
          />

          {!showNavigatorManual && activeTopNavigator === "overview" && (
            <MonitorOverviewSection
              isMobileViewport={isMobileViewport}
              quickJumpBindings={quickJumpBindings}
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
              quickJumpBindings={quickJumpBindings}
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
                quickJumpBindings={quickJumpBindings}
                totalSchoolsInScope={totalSchoolsInScope}
                monitorRadarTotals={monitorRadarTotals}
                schoolScopeRadarSelectorProps={schoolScopeRadarSelectorProps}
                studentRadarSelectorProps={studentRadarSelectorProps}
                teacherRadarSelectorProps={teacherRadarSelectorProps}
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

          <MonitorSchoolDrawer {...schoolDrawerProps} />

          <MonitorToastStack toasts={toasts} onDismiss={dismissToast} />
        </div>
      </div>
    </Shell>
  );
}
