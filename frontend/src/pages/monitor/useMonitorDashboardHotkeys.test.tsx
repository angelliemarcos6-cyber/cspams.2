import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMonitorDashboardHotkeys } from "@/pages/monitor/useMonitorDashboardHotkeys";

describe("useMonitorDashboardHotkeys", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses Ctrl+R to trigger the existing monitor dashboard refresh handler", () => {
    const onRefreshDashboard = vi.fn();

    renderHook(() =>
      useMonitorDashboardHotkeys({
        topNavigatorIds: ["schools", "reviews"],
        quickJumpItems: [],
        shouldShowQuickJump: false,
        canResolveQuickJumpTarget: () => false,
        onNavigateTop: vi.fn(),
        onQuickJump: vi.fn(),
        onFocusGlobalSearch: vi.fn(),
        onCycleSchoolFocus: vi.fn(),
        onTriggerKeyboardReview: vi.fn(),
        onRefreshDashboard,
      }),
    );

    fireEvent.keyDown(window, { key: "r", ctrlKey: true });

    expect(onRefreshDashboard).toHaveBeenCalledTimes(1);
  });

  it("ignores Ctrl+R while typing in editable fields", () => {
    const onRefreshDashboard = vi.fn();

    renderHook(() =>
      useMonitorDashboardHotkeys({
        topNavigatorIds: ["schools", "reviews"],
        quickJumpItems: [],
        shouldShowQuickJump: false,
        canResolveQuickJumpTarget: () => false,
        onNavigateTop: vi.fn(),
        onQuickJump: vi.fn(),
        onFocusGlobalSearch: vi.fn(),
        onCycleSchoolFocus: vi.fn(),
        onTriggerKeyboardReview: vi.fn(),
        onRefreshDashboard,
      }),
    );

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: "r", ctrlKey: true });

    expect(onRefreshDashboard).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });
});
