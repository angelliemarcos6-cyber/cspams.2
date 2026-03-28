import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/context/Auth";
import { getApiBaseUrl } from "@/lib/api";
import * as realtime from "@/lib/realtime";

describe("AuthProvider logout", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=test-xsrf-token; path=/";
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("clears the current user and client session artifacts after a successful 204 logout response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
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
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

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

  it("rejects login when the backend falls back to bearer-token auth", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Unauthenticated.",
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "temporary-bearer-token",
            tokenType: "Bearer",
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

    await act(async () => {
      await expect(
        result.current.login({
          role: "monitor",
          login: "monitor@cspams.local",
          password: "Password123!",
        }),
      ).rejects.toThrow(
        "Backend returned bearer-token auth during login. This frontend expects Sanctum cookie-session auth. Check VITE_API_BASE_URL, SANCTUM_STATEFUL_DOMAINS, CORS_ALLOWED_ORIGINS, and session cookie settings.",
      );
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticating).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
