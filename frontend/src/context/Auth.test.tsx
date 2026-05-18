import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/context/Auth";
import { COOKIE_SESSION_TOKEN, getApiBaseUrl } from "@/lib/api";
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        return new Response(
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
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/auth/me")) {
        return new Response(
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
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/auth/logout") || url.endsWith("/sanctum/csrf-cookie")) {
        return new Response(null, { status: 204 });
      }

      return new Response(JSON.stringify({ message: "Unexpected request" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

    vi.stubGlobal("fetch", fetchMock);
    const stopRealtimeBridgeSpy = vi.spyOn(realtime, "stopRealtimeBridge").mockImplementation(() => {});
    window.localStorage.setItem("cspams.monitor.filters.v1", JSON.stringify({ q: "north" }));
    window.localStorage.setItem("cspams.monitor.filters.v1:monitor:1", JSON.stringify({ q: "south" }));
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

    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(lastCall?.[0]).toBe(`${getApiBaseUrl()}/api/auth/logout`);
    expect(stopRealtimeBridgeSpy).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("cspams.monitor.filters.v1")).toBeNull();
    expect(window.localStorage.getItem("cspams.monitor.filters.v1:monitor:1")).toBeNull();
    expect(window.sessionStorage.getItem("cspams.monitor.nav.v1")).toBeNull();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#/monitor");
  });

  it("restores auth from a persisted cookie-session descriptor on hard reload", async () => {
    window.sessionStorage.setItem("cspams.auth.session.v1", JSON.stringify({
      mode: "cookie",
    }));

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: {
            id: 12,
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${getApiBaseUrl()}/api/auth/me`);
    const requestInit = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];
    const headers = new Headers(requestInit?.headers as HeadersInit);
    expect(requestInit?.credentials).toBe("include");
    expect(headers.get("Authorization")).toBeNull();
    expect(result.current.user?.id).toBe(12);
    expect(result.current.apiToken).toBe(COOKIE_SESSION_TOKEN);
  });

  it("does not fall back to cookie-session after bearer keepalive failure", async () => {
    window.sessionStorage.setItem("cspams.auth.session.v1", JSON.stringify({
      mode: "bearer",
      token: "token-before-keepalive",
      tokenType: "Bearer",
    }));

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
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
      expect(result.current.user?.id).toBe(4);
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    expect(result.current.user?.id).toBe(4);
  });

  it("establishes cookie-session login and persists a reload-safe auth descriptor", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        return new Response(
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
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/auth/me")) {
        return new Response(
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
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/sanctum/csrf-cookie")) {
        return new Response(null, { status: 204 });
      }

      return new Response(JSON.stringify({ message: "Unexpected request" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

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
    });

    await waitFor(() => {
      expect(result.current.user?.email).toBe("monitor@cspams.local");
      expect(result.current.isAuthenticating).toBe(false);
      expect(result.current.apiToken).toBe(COOKIE_SESSION_TOKEN);
    });
    expect(window.sessionStorage.getItem("cspams.auth.session.v1")).toContain("\"mode\":\"cookie\"");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestInit = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];
    const headers = new Headers(requestInit?.headers as HeadersInit);
    expect(requestInit?.credentials).toBe("include");
    expect(headers.get("Authorization")).toBeNull();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${getApiBaseUrl()}/api/auth/me`);
  });

  it("accepts cookie-session login responses even when no bearer token is returned", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        return new Response(
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
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/auth/me")) {
        return new Response(
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
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/sanctum/csrf-cookie")) {
        return new Response(null, { status: 204 });
      }

      return new Response(JSON.stringify({ message: "Unexpected request" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

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
    });

    await waitFor(() => {
      expect(result.current.user?.id).toBe(1);
      expect(result.current.apiToken).toBe(COOKIE_SESSION_TOKEN);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${getApiBaseUrl()}/api/auth/me`);
  });

  it("does not leave a false authenticated session when login succeeds but cookie-session verification fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        return new Response(
          JSON.stringify({
            token: "temporary-bearer-token-1",
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
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/auth/me")) {
        return new Response(
          JSON.stringify({
            message: "Unauthenticated.",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/sanctum/csrf-cookie")) {
        return new Response(null, { status: 204 });
      }

      return new Response(JSON.stringify({ message: "Unexpected request" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    });

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
      })).rejects.toMatchObject({
        status: 401,
      });
    });

    expect(result.current.user).toBeNull();
    expect(result.current.apiToken).toBe("");
    expect(window.sessionStorage.getItem("cspams.auth.session.v1")).toBeNull();
  });

  it("verifies cookie-session usability before completing MFA sign-in", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/verify-mfa")) {
        return new Response(JSON.stringify({ user: { id: 2, name: "Monitor User", email: "monitor@cspams.local", role: "monitor", schoolId: null, schoolCode: null, schoolName: null } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/auth/me")) {
        return new Response(JSON.stringify({ user: { id: 2, name: "Monitor User", email: "monitor@cspams.local", role: "monitor", schoolId: null, schoolCode: null, schoolName: null } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "Unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
    });

    vi.stubGlobal("fetch", fetchMock);
    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.verifyMfa({ role: "monitor", login: "monitor@cspams.local", challengeId: "challenge-1", code: "123456" });
    });

    expect(result.current.user?.id).toBe(2);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `${getApiBaseUrl()}/api/auth/verify-mfa`,
      `${getApiBaseUrl()}/api/auth/me`,
    ]);
  });

  it("verifies cookie-session usability before completing required-password reset sign-in", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/reset-required-password")) {
        return new Response(JSON.stringify({ user: { id: 3, name: "School Head", email: "head@cspams.local", role: "school_head", schoolId: 42, schoolCode: "401777", schoolName: "AMA CC - Santiago City" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/auth/me")) {
        return new Response(JSON.stringify({ user: { id: 3, name: "School Head", email: "head@cspams.local", role: "school_head", schoolId: 42, schoolCode: "401777", schoolName: "AMA CC - Santiago City" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "Unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
    });

    vi.stubGlobal("fetch", fetchMock);
    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.resetRequiredPassword({
        role: "school_head",
        login: "401777",
        password: "Temp123!",
        newPassword: "NewPassword123!",
        confirmPassword: "NewPassword123!",
      });
    });

    expect(result.current.user?.id).toBe(3);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `${getApiBaseUrl()}/api/auth/reset-required-password`,
      `${getApiBaseUrl()}/api/auth/me`,
    ]);
  });

  it("verifies cookie-session usability before completing MFA reset sign-in", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/mfa/reset/complete")) {
        return new Response(JSON.stringify({ user: { id: 4, name: "Monitor User", email: "monitor@cspams.local", role: "monitor", schoolId: null, schoolCode: null, schoolName: null }, backupCodes: ["ABC123"], message: "Done" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/auth/me")) {
        return new Response(JSON.stringify({ user: { id: 4, name: "Monitor User", email: "monitor@cspams.local", role: "monitor", schoolId: null, schoolCode: null, schoolName: null } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: "Unexpected request" }), { status: 500, headers: { "Content-Type": "application/json" } });
    });

    vi.stubGlobal("fetch", fetchMock);
    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.completeMonitorMfaReset({
        login: "monitor@cspams.local",
        password: "Password123!",
        requestId: 10,
        approvalToken: "approve1",
      });
    });

    expect(result.current.user?.id).toBe(4);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `${getApiBaseUrl()}/api/auth/mfa/reset/complete`,
      `${getApiBaseUrl()}/api/auth/me`,
    ]);
  });

  it("keeps bearer refresh behavior stable for persisted bearer-mode sessions", async () => {
    window.sessionStorage.setItem("cspams.auth.session.v1", JSON.stringify({
      mode: "bearer",
      token: "stale-token",
      tokenType: "Bearer",
      refreshAfter: "2000-01-01T00:00:00.000Z",
    }));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token: "stale-token",
            tokenType: "Bearer",
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

  it("does not force logout on a transient bearer keepalive 401 when refresh succeeds", async () => {
    window.sessionStorage.setItem("cspams.auth.session.v1", JSON.stringify({
      mode: "bearer",
      token: "token-before-keepalive",
      tokenType: "Bearer",
    }));

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
  });
});
