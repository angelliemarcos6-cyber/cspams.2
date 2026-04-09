import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/context/Auth";
import { getApiBaseUrl } from "@/lib/api";
import * as realtime from "@/lib/realtime";
import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/sessionCleanup";

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

  it("clears the current user and client session artifacts after a successful logout response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authMode: "cookie_session",
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

  it("retries with bearer fallback when cookie-session auth does not persist", async () => {
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
            authMode: "cookie_session",
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
            authMode: "token",
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

    let loginResult: Awaited<ReturnType<typeof result.current.login>> | null = null;
    await act(async () => {
      loginResult = await result.current.login({
        role: "monitor",
        login: "monitor@cspams.local",
        password: "Password123!",
      });
    });

    expect(loginResult).toMatchObject({
      status: "authenticated",
      user: {
        email: "monitor@cspams.local",
      },
    });
    expect(result.current.user?.email).toBe("monitor@cspams.local");
    expect(result.current.authMode).toBe("token");
    expect(result.current.requestToken).toBe("temporary-bearer-token");
    expect(window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe("temporary-bearer-token");
    expect(result.current.isAuthenticating).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const fallbackRequestHeaders = fetchMock.mock.calls[3]?.[1]?.headers as Headers;
    expect(fallbackRequestHeaders.get("X-CSPAMS-Auth-Transport")).toBe("token");
  });
});
