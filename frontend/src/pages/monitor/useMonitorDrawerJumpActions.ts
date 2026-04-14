import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { SchoolIndicatorMatrix } from "@/pages/monitor/monitorDrawerTypes";
import { sanitizeAnchorToken } from "@/pages/monitor/monitorDashboardUiUtils";
import type { SchoolDrawerTab } from "@/pages/monitor/useSchoolDrawer";

type ToastTone = "success" | "info" | "warning";

interface UseMonitorDrawerJumpActionsArgs {
  missingDrawerIndicatorKeys: string[];
  returnedDrawerIndicatorKeys: string[];
  schoolIndicatorMatrix: SchoolIndicatorMatrix;
  setActiveSchoolDrawerTab: Dispatch<SetStateAction<SchoolDrawerTab>>;
  setHighlightedDrawerIndicatorKey: Dispatch<SetStateAction<string | null>>;
  pushToast: (message: string, tone?: ToastTone) => void;
}

export interface UseMonitorDrawerJumpActionsResult {
  handleJumpToMissingIndicators: () => void;
  handleJumpToReturnedIndicators: () => void;
}

export function useMonitorDrawerJumpActions({
  missingDrawerIndicatorKeys,
  returnedDrawerIndicatorKeys,
  schoolIndicatorMatrix,
  setActiveSchoolDrawerTab,
  setHighlightedDrawerIndicatorKey,
  pushToast,
}: UseMonitorDrawerJumpActionsArgs): UseMonitorDrawerJumpActionsResult {
  const jumpToDrawerIndicator = useCallback(
    (targetKey: string, emptyMessage: string) => {
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
    },
    [pushToast, setActiveSchoolDrawerTab, setHighlightedDrawerIndicatorKey],
  );

  const handleJumpToMissingIndicators = useCallback(() => {
    const targetKey = missingDrawerIndicatorKeys[0] ?? "";
    jumpToDrawerIndicator(targetKey, "No missing indicators were detected.");
  }, [jumpToDrawerIndicator, missingDrawerIndicatorKeys]);

  const handleJumpToReturnedIndicators = useCallback(() => {
    const fallbackKey =
      returnedDrawerIndicatorKeys[0] ??
      (schoolIndicatorMatrix.latestSubmission?.status === "returned"
        ? schoolIndicatorMatrix.rows[0]?.key ?? ""
        : "");

    jumpToDrawerIndicator(fallbackKey, "No returned indicators were found in the latest package.");
  }, [jumpToDrawerIndicator, returnedDrawerIndicatorKeys, schoolIndicatorMatrix]);

  return {
    handleJumpToMissingIndicators,
    handleJumpToReturnedIndicators,
  };
}
