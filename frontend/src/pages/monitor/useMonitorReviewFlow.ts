import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";

type ReviewQueueRow = Pick<MonitorSchoolRequirementSummary, "schoolKey" | "schoolName">;
type ToastTone = "success" | "info" | "warning";

export interface ReviewCompletionPayload {
  schoolKey: string;
  schoolName: string;
  submissionId: string;
  action: "validated" | "returned";
}

interface UseMonitorReviewFlowArgs {
  laneFilteredQueueRows: ReviewQueueRow[];
  activeSchoolDrawerKey: string | null;
  onOpenSchoolDrawer: (schoolKey: string) => void;
  onRefreshActiveDrawer: () => void;
  onToast: (message: string, tone?: ToastTone) => void;
}

export interface UseMonitorReviewFlowResult {
  autoAdvanceQueue: boolean;
  setAutoAdvanceQueue: Dispatch<SetStateAction<boolean>>;
  handleQueueReviewCompleted: (payload: ReviewCompletionPayload) => void;
}

function resolveNextQueueRow(
  laneFilteredQueueRows: ReviewQueueRow[],
  completedSchoolKey: string,
): ReviewQueueRow | null {
  const currentIndex = laneFilteredQueueRows.findIndex((row) => row.schoolKey === completedSchoolKey);
  if (currentIndex >= 0) {
    return laneFilteredQueueRows[currentIndex + 1] ?? laneFilteredQueueRows[currentIndex - 1] ?? null;
  }

  return laneFilteredQueueRows[0] ?? null;
}

export function useMonitorReviewFlow({
  laneFilteredQueueRows,
  activeSchoolDrawerKey,
  onOpenSchoolDrawer,
  onRefreshActiveDrawer,
  onToast,
}: UseMonitorReviewFlowArgs): UseMonitorReviewFlowResult {
  const [lastReviewCompletion, setLastReviewCompletion] = useState<ReviewCompletionPayload | null>(null);
  const [autoAdvanceQueue, setAutoAdvanceQueue] = useState(true);

  const handleQueueReviewCompleted = useCallback((payload: ReviewCompletionPayload) => {
    setLastReviewCompletion(payload);
  }, []);

  useEffect(() => {
    if (!lastReviewCompletion) {
      return;
    }

    const nextRow = resolveNextQueueRow(laneFilteredQueueRows, lastReviewCompletion.schoolKey);
    const shouldKeepCurrentDrawerFocused =
      !autoAdvanceQueue || !nextRow || nextRow.schoolKey === lastReviewCompletion.schoolKey;

    if (
      shouldKeepCurrentDrawerFocused &&
      activeSchoolDrawerKey &&
      activeSchoolDrawerKey === lastReviewCompletion.schoolKey
    ) {
      onRefreshActiveDrawer();
    }

    if (autoAdvanceQueue && nextRow && nextRow.schoolKey !== lastReviewCompletion.schoolKey) {
      onOpenSchoolDrawer(nextRow.schoolKey);
      onToast(`Auto-focused next school: ${nextRow.schoolName}.`, "info");
    }

    setLastReviewCompletion(null);
  }, [
    activeSchoolDrawerKey,
    autoAdvanceQueue,
    laneFilteredQueueRows,
    lastReviewCompletion,
    onOpenSchoolDrawer,
    onRefreshActiveDrawer,
    onToast,
  ]);

  return {
    autoAdvanceQueue,
    setAutoAdvanceQueue,
    handleQueueReviewCompleted,
  };
}
