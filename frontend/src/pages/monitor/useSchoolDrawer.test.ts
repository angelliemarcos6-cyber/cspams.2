import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSchoolDrawer } from "@/pages/monitor/useSchoolDrawer";

describe("useSchoolDrawer", () => {
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

  it("degrades synced count refresh gracefully when one synced total request fails", async () => {
    const queryStudents = vi.fn().mockResolvedValue({
      data: [],
      meta: {
        total: 12,
        recordCount: 12,
      },
    });
    const listTeachers = vi.fn().mockRejectedValue(new Error("Server Error"));

    const { result } = renderHook(() =>
      useSchoolDrawer({
        authSessionKey: "monitor:1",
        isAuthenticated: true,
        latestRealtimeBatch: null,
        resolveRecordId: (schoolKey) => (schoolKey ? "school-record-2" : ""),
        resolveSchoolCode: (schoolKey) => (schoolKey ? "SCH-002" : ""),
        listSubmissionsForSchool: vi.fn().mockResolvedValue([]),
        queryStudents,
        listTeachers,
      }),
    );

    await act(async () => {
      result.current.openSchoolDrawer("school-2");
    });

    await waitFor(() => {
      expect(result.current.accurateSyncedCountsBySchoolKey["school-2"]).toEqual({
        students: 12,
        teachers: 0,
      });
    });

    expect(result.current.syncedCountsError).toBe(
      "Unable to refresh synced teacher totals right now. Showing last available counts.",
    );
  });
});
