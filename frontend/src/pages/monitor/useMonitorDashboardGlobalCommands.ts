import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { MonitorTopNavigatorId } from "@/pages/monitor/monitorFilters";

type DashboardToastTone = "success" | "info" | "warning";

interface UseMonitorDashboardGlobalCommandsArgs {
  refreshRecords: () => Promise<unknown>;
  refreshSubmissions: () => Promise<unknown>;
  refreshStudents: () => Promise<unknown>;
  refreshTeachers: () => Promise<unknown>;
  onToast: (message: string, tone?: DashboardToastTone) => void;
  setShowNavigatorManual: Dispatch<SetStateAction<boolean>>;
  setActiveTopNavigator: Dispatch<SetStateAction<MonitorTopNavigatorId>>;
  focusAndScrollTo: (targetId: string) => void;
  isMobileViewport: boolean;
  setIsNavigatorVisible: Dispatch<SetStateAction<boolean>>;
}

interface UseMonitorDashboardGlobalCommandsResult {
  handleRefreshDashboard: () => Promise<void>;
  handleMonitorTopNavigate: (id: MonitorTopNavigatorId) => void;
}

const TOP_NAV_TARGET_BY_ID: Record<MonitorTopNavigatorId, string> = {
  overview: "monitor-overview-metrics",
  schools: "monitor-school-records",
  reviews: "monitor-action-queue",
};

export function useMonitorDashboardGlobalCommands({
  refreshRecords,
  refreshSubmissions,
  refreshStudents,
  refreshTeachers,
  onToast,
  setShowNavigatorManual,
  setActiveTopNavigator,
  focusAndScrollTo,
  isMobileViewport,
  setIsNavigatorVisible,
}: UseMonitorDashboardGlobalCommandsArgs): UseMonitorDashboardGlobalCommandsResult {
  const navTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (navTimerRef.current !== null) window.clearTimeout(navTimerRef.current);
    };
  }, []);

  const handleRefreshDashboard = useCallback(async () => {
    const results = await Promise.allSettled([
      refreshRecords(),
      refreshSubmissions(),
      refreshStudents(),
      refreshTeachers(),
    ]);

    if (results.some((result) => result.status === "rejected")) {
      onToast("Some dashboard data failed to refresh. Please try again.", "warning");
    }
  }, [onToast, refreshRecords, refreshSubmissions, refreshStudents, refreshTeachers]);

  const handleMonitorTopNavigate = useCallback(
    (id: MonitorTopNavigatorId) => {
      setShowNavigatorManual(false);
      setActiveTopNavigator(id);

      if (typeof window !== "undefined") {
        const targetId = TOP_NAV_TARGET_BY_ID[id];
        if (targetId) {
          if (navTimerRef.current !== null) window.clearTimeout(navTimerRef.current);
          navTimerRef.current = window.setTimeout(() => {
            navTimerRef.current = null;
            focusAndScrollTo(targetId);
          }, 70);
        }
      }

      if (isMobileViewport) {
        setIsNavigatorVisible(false);
      }
    },
    [focusAndScrollTo, isMobileViewport, setActiveTopNavigator, setIsNavigatorVisible, setShowNavigatorManual],
  );

  return {
    handleRefreshDashboard,
    handleMonitorTopNavigate,
  };
}
