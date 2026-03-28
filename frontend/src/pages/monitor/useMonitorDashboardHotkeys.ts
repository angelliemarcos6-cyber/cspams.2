import { useEffect } from "react";
import type { MonitorTopNavigatorId } from "@/pages/monitor/monitorFilters";

interface UseMonitorDashboardHotkeysArgs<TQuickJumpItem extends { targetId: string }> {
  topNavigatorIds: MonitorTopNavigatorId[];
  quickJumpItems: TQuickJumpItem[];
  shouldShowQuickJump: boolean;
  canResolveQuickJumpTarget: (targetId: string) => boolean;
  onNavigateTop: (id: MonitorTopNavigatorId) => void;
  onQuickJump: (item: TQuickJumpItem) => void;
  onFocusGlobalSearch: () => void;
  onCycleSchoolFocus: (direction: 1 | -1) => void;
  onTriggerKeyboardReview: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

export function useMonitorDashboardHotkeys<TQuickJumpItem extends { targetId: string }>({
  topNavigatorIds,
  quickJumpItems,
  shouldShowQuickJump,
  canResolveQuickJumpTarget,
  onNavigateTop,
  onQuickJump,
  onFocusGlobalSearch,
  onCycleSchoolFocus,
  onTriggerKeyboardReview,
}: UseMonitorDashboardHotkeysArgs<TQuickJumpItem>) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;

      const shortcutIndex = Number(event.key) - 1;
      if (!Number.isInteger(shortcutIndex)) return;

      const shortcutId = topNavigatorIds[shortcutIndex];
      if (!shortcutId) return;

      event.preventDefault();
      onNavigateTop(shortcutId);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNavigateTop, topNavigatorIds]);

  useEffect(() => {
    if (typeof window === "undefined" || !shouldShowQuickJump) return;

    const onQuickJumpHotkey = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;
      if (isEditableTarget(event.target)) return;

      const shortcutIndex = Number(event.key) - 1;
      if (!Number.isInteger(shortcutIndex) || shortcutIndex < 0 || shortcutIndex >= quickJumpItems.length) {
        return;
      }

      const quickJumpItem = quickJumpItems[shortcutIndex];
      if (!quickJumpItem || !canResolveQuickJumpTarget(quickJumpItem.targetId)) {
        return;
      }

      event.preventDefault();
      onQuickJump(quickJumpItem);
    };

    window.addEventListener("keydown", onQuickJumpHotkey);
    return () => window.removeEventListener("keydown", onQuickJumpHotkey);
  }, [canResolveQuickJumpTarget, onQuickJump, quickJumpItems, shouldShowQuickJump]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyboardShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      if (event.key === "/") {
        event.preventDefault();
        onFocusGlobalSearch();
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "j") {
        event.preventDefault();
        onCycleSchoolFocus(1);
        return;
      }
      if (key === "k") {
        event.preventDefault();
        onCycleSchoolFocus(-1);
        return;
      }
      if (key === "r") {
        event.preventDefault();
        onTriggerKeyboardReview();
      }
    };

    window.addEventListener("keydown", onKeyboardShortcut);
    return () => window.removeEventListener("keydown", onKeyboardShortcut);
  }, [onCycleSchoolFocus, onFocusGlobalSearch, onTriggerKeyboardReview]);
}
