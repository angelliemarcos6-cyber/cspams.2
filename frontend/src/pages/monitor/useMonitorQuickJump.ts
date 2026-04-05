import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { QuickJumpItem } from "@/pages/monitor/monitorDashboardConfig";

export interface MonitorQuickJumpMeta {
  resolvedTargetId: string;
  isActive: boolean;
  isAvailable: boolean;
}

interface UseMonitorQuickJumpArgs {
  quickJumpItems: QuickJumpItem[];
  focusedSectionId: string | null;
  showAdvancedFilters: boolean;
  showAdvancedAnalytics: boolean;
  setShowAdvancedFilters: Dispatch<SetStateAction<boolean>>;
  setShowAdvancedAnalytics: Dispatch<SetStateAction<boolean>>;
  focusAndScrollTo: (targetId: string) => void;
}

export interface UseMonitorQuickJumpResult {
  shouldShowQuickJump: boolean;
  resolveQuickJumpTargetId: (targetId: string) => string;
  canResolveQuickJumpTarget: (targetId: string) => boolean;
  handleQuickJump: (item: QuickJumpItem) => void;
  getQuickJumpMeta: (item: QuickJumpItem) => MonitorQuickJumpMeta;
}

function scheduleFocus(focusAndScrollTo: (targetId: string) => void, targetId: string): number | null {
  if (typeof window === "undefined") {
    focusAndScrollTo(targetId);
    return null;
  }

  return window.setTimeout(() => {
    focusAndScrollTo(targetId);
  }, 80);
}

export function useMonitorQuickJump({
  quickJumpItems,
  focusedSectionId,
  showAdvancedFilters,
  showAdvancedAnalytics,
  setShowAdvancedFilters,
  setShowAdvancedAnalytics,
  focusAndScrollTo,
}: UseMonitorQuickJumpArgs): UseMonitorQuickJumpResult {
  const focusTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    };
  }, []);

  const shouldShowQuickJump = quickJumpItems.length > 0;

  const resolveQuickJumpTargetId = useCallback((targetId: string): string => {
    if (targetId === "monitor-analytics-toggle") {
      return "monitor-targets-snapshot";
    }

    return targetId;
  }, []);

  const canResolveQuickJumpTarget = useCallback(
    (targetId: string): boolean => {
      const resolvedTargetId = resolveQuickJumpTargetId(targetId);

      if (resolvedTargetId === "monitor-submission-filters") {
        return true;
      }

      if (resolvedTargetId === "monitor-targets-snapshot") {
        return true;
      }

      if (typeof document === "undefined") {
        return true;
      }

      return Boolean(document.getElementById(resolvedTargetId));
    },
    [resolveQuickJumpTargetId],
  );

  const handleQuickJump = useCallback(
    (item: QuickJumpItem) => {
      const resolvedTargetId = resolveQuickJumpTargetId(item.targetId);

      if (resolvedTargetId === "monitor-submission-filters" && !showAdvancedFilters) {
        setShowAdvancedFilters(true);
        if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = scheduleFocus(focusAndScrollTo, resolvedTargetId);
        return;
      }

      if (resolvedTargetId === "monitor-targets-snapshot" && !showAdvancedAnalytics) {
        setShowAdvancedAnalytics(true);
        if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = scheduleFocus(focusAndScrollTo, resolvedTargetId);
        return;
      }

      focusAndScrollTo(resolvedTargetId);
    },
    [
      focusAndScrollTo,
      resolveQuickJumpTargetId,
      setShowAdvancedAnalytics,
      setShowAdvancedFilters,
      showAdvancedAnalytics,
      showAdvancedFilters,
    ],
  );

  const getQuickJumpMeta = useCallback(
    (item: QuickJumpItem): MonitorQuickJumpMeta => {
      const resolvedTargetId = resolveQuickJumpTargetId(item.targetId);

      return {
        resolvedTargetId,
        isActive: focusedSectionId === resolvedTargetId,
        isAvailable: canResolveQuickJumpTarget(item.targetId),
      };
    },
    [canResolveQuickJumpTarget, focusedSectionId, resolveQuickJumpTargetId],
  );

  return {
    shouldShowQuickJump,
    resolveQuickJumpTargetId,
    canResolveQuickJumpTarget,
    handleQuickJump,
    getQuickJumpMeta,
  };
}
