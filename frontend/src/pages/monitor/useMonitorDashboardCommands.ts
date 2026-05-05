import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import { downloadCsvFile, workflowLabel } from "@/pages/monitor/monitorDashboardUiUtils";
import { ALL_SCHOOL_SCOPE, type MonitorTopNavigatorId } from "@/pages/monitor/monitorFilters";
import { formatDateTime } from "@/utils/analytics";

type DashboardToastTone = "success" | "info" | "warning";

interface ActiveScreenMeta {
  title: string;
  description: string;
  primaryLabel: string;
}

interface UseMonitorDashboardCommandsArgs {
  activeTopNavigator: MonitorTopNavigatorId;
  filteredRequirementRows: MonitorSchoolRequirementSummary[];
  compactSchoolRows: Array<{ summary: MonitorSchoolRequirementSummary }>;
  laneFilteredQueueRows: MonitorSchoolRequirementSummary[];
  actionQueueRows: MonitorSchoolRequirementSummary[];
  schoolRequirementByKey: Map<string, MonitorSchoolRequirementSummary>;
  selectedSchoolScopeKey: string;
  schoolDrawerKey: string | null;
  globalSearchInputRef: RefObject<HTMLInputElement | null>;
  onToast: (message: string, tone?: DashboardToastTone) => void;
  setShowNavigatorManual: Dispatch<SetStateAction<boolean>>;
  setActiveTopNavigator: Dispatch<SetStateAction<MonitorTopNavigatorId>>;
  openSchoolDrawer: (schoolKey: string) => void;
  onReviewSchool: (summary: MonitorSchoolRequirementSummary) => void;
  onOpenSchool: (summary: MonitorSchoolRequirementSummary) => void;
  focusAndScrollTo: (targetId: string) => void;
}

interface UseMonitorDashboardCommandsResult {
  activeScreenMeta: ActiveScreenMeta;
  isPrimaryActionDisabled: boolean;
  focusGlobalSearch: () => void;
  cycleSchoolFocus: (direction: 1 | -1) => void;
  triggerKeyboardReview: () => void;
  handlePrimaryAction: () => void;
}

export function useMonitorDashboardCommands({
  activeTopNavigator,
  filteredRequirementRows,
  compactSchoolRows,
  laneFilteredQueueRows,
  actionQueueRows,
  schoolRequirementByKey,
  selectedSchoolScopeKey,
  schoolDrawerKey,
  globalSearchInputRef,
  onToast,
  setShowNavigatorManual,
  setActiveTopNavigator,
  openSchoolDrawer,
  onReviewSchool,
  onOpenSchool,
  focusAndScrollTo,
}: UseMonitorDashboardCommandsArgs): UseMonitorDashboardCommandsResult {
  const focusGlobalSearch = useCallback(() => {
    const input = globalSearchInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [globalSearchInputRef]);

  const cycleSchoolFocus = useCallback(
    (direction: 1 | -1) => {
      if (compactSchoolRows.length === 0) {
        onToast("No school available in the current scope.", "warning");
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
    [
      compactSchoolRows,
      focusAndScrollTo,
      onToast,
      openSchoolDrawer,
      schoolDrawerKey,
      selectedSchoolScopeKey,
      setActiveTopNavigator,
      setShowNavigatorManual,
    ],
  );

  const triggerKeyboardReview = useCallback(() => {
    const activeSummary =
      (schoolDrawerKey ? schoolRequirementByKey.get(schoolDrawerKey) ?? null : null) ??
      laneFilteredQueueRows[0] ??
      actionQueueRows[0] ??
      compactSchoolRows[0]?.summary ??
      null;

    if (!activeSummary) {
      onToast("No school is ready for review right now.", "warning");
      return;
    }

    onReviewSchool(activeSummary);
  }, [actionQueueRows, compactSchoolRows, laneFilteredQueueRows, onReviewSchool, onToast, schoolDrawerKey, schoolRequirementByKey]);

  const activeScreenMeta = useMemo<ActiveScreenMeta>(() => {
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
          primaryLabel: "Open Selected School",
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

  const handlePrimaryAction = useCallback(() => {
    if (activeTopNavigator === "overview") {
      if (filteredRequirementRows.length === 0) {
        onToast("No rows available to export with current filters.", "warning");
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
      onToast(`Exported ${rows.length} school rows.`, "success");
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
          onOpenSchool(preferredSummary);
          return;
        }
      }

      if (compactSchoolRows.length > 0) {
        onOpenSchool(compactSchoolRows[0].summary);
        return;
      }

      onToast("No school available to open in the current scope.", "warning");
      return;
    }

    const nextReview = laneFilteredQueueRows[0] ?? actionQueueRows[0] ?? null;
    if (!nextReview) {
      onToast("No school is queued for review right now.", "warning");
      return;
    }
    onReviewSchool(nextReview);
  }, [
    actionQueueRows,
    activeTopNavigator,
    compactSchoolRows,
    filteredRequirementRows,
    laneFilteredQueueRows,
    onOpenSchool,
    onReviewSchool,
    onToast,
    schoolDrawerKey,
    schoolRequirementByKey,
    selectedSchoolScopeKey,
  ]);

  return {
    activeScreenMeta,
    isPrimaryActionDisabled,
    focusGlobalSearch,
    cycleSchoolFocus,
    triggerKeyboardReview,
    handlePrimaryAction,
  };
}
