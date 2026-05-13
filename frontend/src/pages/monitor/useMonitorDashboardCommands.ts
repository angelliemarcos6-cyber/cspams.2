import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import { ALL_SCHOOL_SCOPE, type MonitorTopNavigatorId } from "@/pages/monitor/monitorFilters";

type DashboardToastTone = "success" | "info" | "warning";

interface ActiveScreenMeta {
  title: string;
  description: string;
  primaryLabel: string;
}

interface UseMonitorDashboardCommandsArgs {
  activeTopNavigator: MonitorTopNavigatorId;
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
      case "schools":
        return {
          title: "Schools",
          description: "",
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
    activeTopNavigator === "schools"
      ? compactSchoolRows.length === 0
      : laneFilteredQueueRows.length === 0 && actionQueueRows.length === 0;

  const handlePrimaryAction = useCallback(() => {
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
