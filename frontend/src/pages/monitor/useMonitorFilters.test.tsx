import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ALL_SCHOOL_SCOPE, MONITOR_FILTER_STORAGE_KEY } from "@/pages/monitor/monitorFilters";
import { useMonitorFilters } from "@/pages/monitor/useMonitorFilters";

describe("useMonitorFilters", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/#/monitor");
  });

  it("does not restore persisted school scope from local storage across monitor sessions", async () => {
    window.localStorage.setItem(
      `${MONITOR_FILTER_STORAGE_KEY}:monitor:7`,
      JSON.stringify({
        search: "north district",
        schoolScopeKey: "code:old-scope",
        schoolQuickPreset: "pending",
      }),
    );

    const { result } = renderHook(() => useMonitorFilters("monitor:7"));

    await waitFor(() => {
      expect(result.current.filtersHydrated).toBe(true);
    });

    expect(result.current.search).toBe("north district");
    expect(result.current.schoolQuickPreset).toBe("pending");
    expect(result.current.selectedSchoolScopeKey).toBe(ALL_SCHOOL_SCOPE);
  });

  it("still accepts school scope from explicit URL query params but does not persist it back to storage", async () => {
    window.history.replaceState(null, "", "/?school=code:santa-rosa&q=santa#/monitor");

    const { result } = renderHook(() => useMonitorFilters("monitor:8"));

    await waitFor(() => {
      expect(result.current.filtersHydrated).toBe(true);
    });

    expect(result.current.selectedSchoolScopeKey).toBe("code:santa-rosa");

    const raw = window.localStorage.getItem(`${MONITOR_FILTER_STORAGE_KEY}:monitor:8`);
    expect(raw).not.toBeNull();

    const persisted = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    expect(persisted.schoolScopeKey).toBeUndefined();
  });
});
