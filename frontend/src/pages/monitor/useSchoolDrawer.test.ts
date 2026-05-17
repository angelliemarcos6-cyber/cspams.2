import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildSyncedCountsRefreshOutcome,
  buildSyncedCountsUnavailableMessage,
  isFreshSchoolDetailCountsCacheEntry,
  isMissingSchoolRecordError,
  matchesDrawerSchool,
  useSchoolDrawer,
} from "@/pages/monitor/useSchoolDrawer";

describe("useSchoolDrawer", () => {
  it("matches monitor realtime updates by either strict school code or strict record id", () => {
    expect(matchesDrawerSchool("school-1", "401777", "school-1", "")).toBe(true);
    expect(matchesDrawerSchool("other-school", "401777", "school-1", "401777")).toBe(true);
    expect(matchesDrawerSchool("other-school", "DIFFERENT", "school-1", "401777")).toBe(false);
  });

  it("recognizes the archived school record error without surfacing it as a generic failure", () => {
    expect(
      isMissingSchoolRecordError(new Error("School record not found. It may have been archived or permanently deleted.")),
    ).toBe(true);
    expect(isMissingSchoolRecordError(new Error("Server Error"))).toBe(false);
  });

  it("builds the synced-count fallback warning per failed source", () => {
    expect(buildSyncedCountsUnavailableMessage(true, true)).toBe(
      "Unable to refresh synced student and teacher totals right now. Showing last available counts.",
    );
    expect(buildSyncedCountsUnavailableMessage(true, false)).toBe(
      "Unable to refresh synced student totals right now. Showing last available counts.",
    );
    expect(buildSyncedCountsUnavailableMessage(false, true)).toBe(
      "Unable to refresh synced teacher totals right now. Showing last available counts.",
    );
  });

  it("treats cached synced counts as stale only after the TTL window", () => {
    expect(
      isFreshSchoolDetailCountsCacheEntry({ students: 10, teachers: 2, fetchedAt: 1000 }, 1000 + 45_000),
    ).toBe(true);
    expect(
      isFreshSchoolDetailCountsCacheEntry({ students: 10, teachers: 2, fetchedAt: 1000 }, 1000 + 45_001),
    ).toBe(false);
  });

  it("builds partial synced-count refresh outcomes without dropping last known values", () => {
    const outcome = buildSyncedCountsRefreshOutcome(
      {
        status: "fulfilled",
        value: { data: [], meta: { total: 12, recordCount: 12 } },
      },
      {
        status: "rejected",
        reason: new Error("Server Error"),
      },
      { students: 9, teachers: 3 },
    );

    expect(outcome.nextCounts).toEqual({ students: 12, teachers: 3 });
    expect(outcome.error).toBe(
      "Unable to refresh synced teacher totals right now. Showing last available counts.",
    );
  });

  it("closes the stale drawer when the selected school has already been archived or deleted", async () => {
    const listSubmissionsForSchool = vi
      .fn()
      .mockRejectedValue(new Error("School record not found. It may have been archived or permanently deleted."));

    const { result } = renderHook(() =>
      useSchoolDrawer({
        authSessionKey: "monitor:1",
        isAuthenticated: true,
        latestRealtimeBatch: null,
        resolveRecordId: (schoolKey) => (schoolKey ? "school-record-1" : ""),
        resolveSchoolCode: () => "",
        listSubmissionsForSchool,
        queryStudents: vi.fn(),
        listTeachers: vi.fn(),
      }),
    );

    await act(async () => {
      result.current.openSchoolDrawer("school-1");
    });

    await waitFor(() => {
      expect(result.current.schoolDrawerKey).toBeNull();
    });

    expect(result.current.schoolDrawerSubmissionsError).toBe("");
    expect(listSubmissionsForSchool).toHaveBeenCalledWith(
      "school-record-1",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
