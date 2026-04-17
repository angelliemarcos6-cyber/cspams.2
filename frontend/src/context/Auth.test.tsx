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
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login({
        role: "monitor",
        login: "monitor@cspams.local",
        password: "Password123!",
      });
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

  it("does not restore auth from sessionStorage token data", async () => {
    window.sessionStorage.setItem("cspams.auth.session.v1", JSON.stringify({
      token: "restore-token",
      tokenType: "Bearer",
    }));

    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(result.current.user).toBeNull();
    expect(result.current.apiToken).toBe("");
  });

  it("does not fall back to cookie-session after bearer keepalive failure", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: "token-before-keepalive",
          tokenType: "Bearer",
          user: {
            id: 4,
            name: "Monitor User",
            email: "monitor@cspams.local",
            role: "monitor",
            schoolId: null,
            schoolCode: null,
            schoolName: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
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
          message: "Unauthenticated.",
        }),
        {
          status: 401,
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
      await result.current.login({
        role: "monitor",
        login: "monitor@cspams.local",
        password: "Password123!",
      });
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const fallbackCookieCall = fetchMock.mock.calls.find(([, init]) => {
      const typedInit = init as RequestInit | undefined;
      return typedInit?.credentials === "include";
    });
    expect(fallbackCookieCall).toBeUndefined();
    expect(result.current.user?.id).toBe(4);
  });

  it("accepts bearer-token login responses and keeps the authenticated user", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "temporary-bearer-token-1",
            tokenType: "Bearer",
            refreshAfter: new Date(Date.now() + 60_000).toISOString(),
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
      await expect(result.current.login({
        role: "monitor",
        login: "monitor@cspams.local",
        password: "Password123!",
      })).resolves.toMatchObject({
        status: "authenticated",
      });
    });

    expect(result.current.user?.email).toBe("monitor@cspams.local");
    expect(result.current.isAuthenticating).toBe(false);
    expect(result.current.apiToken).toBe("temporary-bearer-token-1");
    expect(window.sessionStorage.getItem("cspams.auth.session.v1")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails login when backend does not return a bearer token", async () => {
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
      );

    vi.stubGlobal("fetch", fetchMock);

    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(result.current.login({
        role: "monitor",
        login: "monitor@cspams.local",
        password: "Password123!",
      })).rejects.toThrow("Missing bearer token in login response.");
    });

    expect(result.current.user).toBeNull();
    expect(result.current.apiToken).toBe("");
  });

  it("refreshes bearer tokens before keepalive when refreshAfter has elapsed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "stale-token",
            tokenType: "Bearer",
            refreshAfter: "2000-01-01T00:00:00.000Z",
            user: {
              id: 7,
              name: "Monitor User",
              email: "monitor@cspams.local",
              role: "monitor",
              schoolId: null,
              schoolCode: null,
              schoolName: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "fresh-token",
            tokenType: "Bearer",
            refreshAfter: new Date(Date.now() + 60_000).toISOString(),
            user: {
              id: 7,
              name: "Monitor User",
              email: "monitor@cspams.local",
              role: "monitor",
              schoolId: null,
              schoolCode: null,
              schoolName: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: 7,
              name: "Monitor User",
              email: "monitor@cspams.local",
              role: "monitor",
              schoolId: null,
              schoolCode: null,
              schoolName: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login({
        role: "monitor",
        login: "monitor@cspams.local",
        password: "Password123!",
      });
    });

    await waitFor(() => {
      expect(result.current.user?.id).toBe(7);
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
    expect(result.current.apiToken).toBe("fresh-token");
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${getApiBaseUrl()}/api/auth/refresh`);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(`${getApiBaseUrl()}/api/auth/me`);
    const refreshInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const refreshHeaders = new Headers(refreshInit?.headers as HeadersInit);
    expect(refreshHeaders.get("Authorization")).toBe("Bearer stale-token");
    expect(refreshInit?.credentials).toBe("omit");
  });

  it("does not force logout on a transient keepalive 401 when refresh succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "token-before-keepalive",
            tokenType: "Bearer",
            user: {
              id: 9,
              name: "Monitor User",
              email: "monitor@cspams.local",
              role: "monitor",
              schoolId: null,
              schoolCode: null,
              schoolName: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Unauthenticated.",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "token-after-refresh",
            tokenType: "Bearer",
            refreshAfter: new Date(Date.now() + 60_000).toISOString(),
            user: {
              id: 9,
              name: "Monitor User",
              email: "monitor@cspams.local",
              role: "monitor",
              schoolId: null,
              schoolCode: null,
              schoolName: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: {
              id: 9,
              name: "Monitor User",
              email: "monitor@cspams.local",
              role: "monitor",
              schoolId: null,
              schoolCode: null,
              schoolName: null,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login({
        role: "monitor",
        login: "monitor@cspams.local",
        password: "Password123!",
      });
    });

    await waitFor(() => {
      expect(result.current.user?.id).toBe(9);
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(result.current.user?.id).toBe(9);
      expect(result.current.authError).toBe("");
      expect(result.current.apiToken).toBeTruthy();
    });

    expect(result.current.user).not.toBeNull();
    const fallbackCookieCall = fetchMock.mock.calls.find(([, init]) => {
      const typedInit = init as RequestInit | undefined;
      return typedInit?.credentials === "include";
    });
    expect(fallbackCookieCall).toBeUndefined();
  });
});
