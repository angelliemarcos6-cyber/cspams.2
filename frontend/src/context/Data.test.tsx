import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DataProvider, useData } from "@/context/Data";
import { useAuth } from "@/context/Auth";
import { apiRequestRaw } from "@/lib/api";
import { subscribeSharedSyncPolling } from "@/lib/sharedSyncPolling";

vi.mock("@/context/Auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiRequestRaw: vi.fn(),
  isApiError: vi.fn(() => false),
}));

vi.mock("@/lib/sharedSyncPolling", () => ({
  subscribeSharedSyncPolling: vi.fn(() => () => {}),
}));

describe("DataProvider school record sync recovery", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      role: "monitor",
      username: "Monitor User",
      user: {
        id: 1,
        name: "Monitor User",
        email: "monitor@cspams.local",
        role: "monitor",
        schoolId: null,
        schoolCode: null,
        schoolName: null,
      },
      apiToken: "test-token",
      authError: "",
      authErrorCode: null,
      accountStatus: null,
      isLoading: false,
      isAuthenticating: false,
      isLoggingOut: false,
      clearAuthError: vi.fn(),
      login: vi.fn(),
      verifyMfa: vi.fn(),
      requestMonitorPasswordReset: vi.fn(),
      resetMonitorPassword: vi.fn(),
      requestMonitorMfaReset: vi.fn(),
      completeMonitorMfaReset: vi.fn(),
      completeAccountSetup: vi.fn(),
      resetRequiredPassword: vi.fn(),
      logout: vi.fn(),
      listActiveSessions: vi.fn(),
      revokeSessionDevice: vi.fn(),
      revokeOtherSessions: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("retries without ETag when sync count is nonzero but records are empty", async () => {
    const apiRequestRawMock = vi.mocked(apiRequestRaw);

    apiRequestRawMock
      .mockResolvedValueOnce({
        status: 304,
        data: null,
        headers: new Headers({
          "X-Sync-Record-Count": "46",
          "X-Sync-Etag": "\"etag-46\"",
          "X-Sync-Scope": "division",
          "X-Sync-Scope-Key": "division:all|filters:none",
          "X-Synced-At": "2026-05-07T06:36:00.000Z",
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          data: [
            {
              id: "1",
              schoolId: "900001",
              schoolCode: "900001",
              schoolName: "Santiago Elementary",
              level: "Elementary",
              district: "District 1",
              address: "District 1, Santiago City",
              type: "public",
              studentCount: 120,
              teacherCount: 12,
              region: "Region II",
              status: "active",
              submittedBy: "Monitor User",
              lastUpdated: "2026-05-07T06:36:01.000Z",
              deletedAt: null,
              schoolHeadAccount: null,
              indicatorLatest: null,
            },
          ],
          meta: {
            syncedAt: "2026-05-07T06:36:01.000Z",
            scope: "division",
            scopeKey: "division:all|filters:none",
            recordCount: 46,
            targetsMet: null,
            alerts: [],
          },
        },
        headers: new Headers({
          "X-Sync-Etag": "\"etag-46-refresh\"",
          "X-Sync-Scope": "division",
          "X-Sync-Scope-Key": "division:all|filters:none",
          "X-Synced-At": "2026-05-07T06:36:01.000Z",
        }),
      });

    const wrapper = ({ children }: { children: ReactNode }) => <DataProvider>{children}</DataProvider>;
    const { result } = renderHook(() => useData(), { wrapper });

    await act(async () => {
      await result.current.refreshRecords();
    });

    await waitFor(() => {
      expect(result.current.records).toHaveLength(1);
      expect(result.current.recordCount).toBe(46);
    });

    expect(apiRequestRawMock).toHaveBeenCalledTimes(2);
    expect(apiRequestRawMock.mock.calls[0]?.[0]).toBe("/api/dashboard/records");
    expect(apiRequestRawMock.mock.calls[0]?.[1]).toMatchObject({
      token: "test-token",
      extraHeaders: undefined,
    });
    expect(apiRequestRawMock.mock.calls[1]?.[1]).toMatchObject({
      token: "test-token",
      extraHeaders: undefined,
    });
    expect(subscribeSharedSyncPolling).toHaveBeenCalled();
  });
});
