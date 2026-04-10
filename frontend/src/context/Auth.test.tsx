import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/context/Auth";
import { getApiBaseUrl } from "@/lib/api";
import * as realtime from "@/lib/realtime";
import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/sessionCleanup";

describe("AuthProvider", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=test-xsrf-token; path=/";
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("clears the current user and client session artifacts after a successful logout response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            mode: "cookie",
            user: {
              id: 1,
              name: "Monitor User",
              email: "monitor@cspams.local",
              role: "monitor",
              schoolId: null,
              schoolCode: null,
              schoolName: null,
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            message: "Logout successful",
            data: null,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);
    const stopRealtimeBridgeSpy = vi.spyOn(realtime, "stopRealtimeBridge").mockImplementation(() => {});
    window.localStorage.setItem("cspams.monitor.filters.v1", JSON.stringify({ q: "north" }));
    window.sessionStorage.setItem("cspams.monitor.nav.v1", JSON.stringify({ visible: true }));
    window.history.replaceState(null, "", "/?tab=reviews#/monitor");

    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user?.email).toBe("monitor@cspams.local");
    });

    await act(async () => {
      await result.current.logout();
    });

    await waitFor(() => {
      expect(result.current.user).toBeNull();
      expect(result.current.isLoggingOut).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${getApiBaseUrl()}/api/auth/logout`);
    expect(stopRealtimeBridgeSpy).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("cspams.monitor.filters.v1")).toBeNull();
    expect(window.sessionStorage.getItem("cspams.monitor.nav.v1")).toBeNull();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#/monitor");
  });

  it("captures restore-time 403 details without leaving a user session", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Your account is suspended.",
          accountStatus: "suspended",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.authError).toBe("Your account is suspended.");
    expect(result.current.authErrorCode).toBe(403);
    expect(result.current.accountStatus).toBe("suspended");
  });

  it("restores a token-mode session from stored bearer credentials", async () => {
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "stored-bearer-token");

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          mode: "token",
          user: {
            id: 1,
            name: "Monitor User",
            email: "monitor@cspams.local",
            role: "monitor",
            schoolId: null,
            schoolCode: null,
            schoolName: null,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user?.email).toBe("monitor@cspams.local");
    expect(result.current.authMode).toBe("token");
    expect(result.current.requestToken).toBe("stored-bearer-token");
    expect(window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe("stored-bearer-token");

    const requestInit = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(requestInit?.headers);
    expect(requestInit?.credentials).toBe("omit");
    expect(headers.get("Authorization")).toBe("Bearer stored-bearer-token");
    expect(headers.get("X-CSRF-TOKEN")).toBeNull();
  });
});
