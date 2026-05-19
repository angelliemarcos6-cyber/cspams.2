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
    vi.unstubAllEnvs();
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
    window.sessionStorage.setItem("cspams.auth.session.v2", JSON.stringify({
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
    window.sessionStorage.setItem("cspams.auth.session.v2", JSON.stringify({
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

  it("establishes bearer-backed login and persists a reload-safe auth descriptor", async () => {
    document.cookie = "";
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
      expect(result.current.apiToken).toBe("temporary-bearer-token-1");
    });
    expect(window.sessionStorage.getItem("cspams.auth.session.v2")).toContain("\"mode\":\"bearer\"");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `${getApiBaseUrl()}/api/auth/login`,
      `${getApiBaseUrl()}/api/auth/me`,
    ]);
    const loginInit = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];
    const loginHeaders = new Headers(loginInit?.headers as HeadersInit);
    expect(loginInit?.credentials).toBe("include");
    expect(loginHeaders.get("Authorization")).toBeNull();
    expect(loginHeaders.get("X-CSPAMS-Auth-Mode")).toBe("stateful");
    const meInit = (fetchMock.mock.calls[1] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];
    const meHeaders = new Headers(meInit?.headers as HeadersInit);
    expect(meInit?.credentials).toBe("omit");
    expect(meHeaders.get("Authorization")).toBe("Bearer temporary-bearer-token-1");
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
    const loginInit = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];
    const loginHeaders = new Headers(loginInit?.headers as HeadersInit);
    expect(loginInit?.credentials).toBe("include");
    expect(loginHeaders.get("X-CSPAMS-Auth-Mode")).toBe("stateful");
  });

  it("does not restore cookie-session state when explicit stateful browser auth is disabled", async () => {
    vi.stubEnv("VITE_ENABLE_STATEFUL_SPA_API", "false");
    window.sessionStorage.setItem("cspams.auth.session.v2", JSON.stringify({
      mode: "cookie",
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
    expect(window.sessionStorage.getItem("cspams.auth.session.v2")).toBeNull();
  });

  it("does not fall back to cookie-session login when explicit stateful browser auth is disabled", async () => {
    vi.stubEnv("VITE_ENABLE_STATEFUL_SPA_API", "false");

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
      })).rejects.toThrow("Your login succeeded, but dashboard access could not be verified. Missing bearer token in login response.");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
    expect(result.current.apiToken).toBe("");
  });

  it("uses stateless bearer-entry login transport when explicit stateful browser auth is disabled", async () => {
    vi.stubEnv("VITE_ENABLE_STATEFUL_SPA_API", "false");

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
      await result.current.login({
        role: "monitor",
        login: "monitor@cspams.local",
        password: "Password123!",
      });
    });

    const loginInit = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];
    const loginHeaders = new Headers(loginInit?.headers as HeadersInit);
    expect(loginInit?.credentials).toBe("omit");
    expect(loginHeaders.get("X-CSPAMS-Auth-Mode")).toBeNull();
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
      })).rejects.toThrow("Your login succeeded, but dashboard access could not be verified. Please sign in again.");
    });

    expect(result.current.user).toBeNull();
    expect(result.current.apiToken).toBe("");
    expect(window.sessionStorage.getItem("cspams.auth.session.v2")).toBeNull();
  });

  it("verifies bearer-token usability before completing MFA sign-in", async () => {
    document.cookie = "";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/verify-mfa")) {
        return new Response(JSON.stringify({ token: "mfa-token", tokenType: "Bearer", user: { id: 2, name: "Monitor User", email: "monitor@cspams.local", role: "monitor", schoolId: null, schoolCode: null, schoolName: null } }), { status: 200, headers: { "Content-Type": "application/json" } });
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
    const verifyInit = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];
    expect(verifyInit?.credentials).toBe("include");
    const verifyHeaders = new Headers(verifyInit?.headers as HeadersInit);
    expect(verifyHeaders.get("X-CSPAMS-Auth-Mode")).toBe("stateful");
    expect(result.current.apiToken).toBe("mfa-token");
  });

  it("verifies bearer-token usability before completing required-password reset sign-in", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/reset-required-password")) {
        return new Response(JSON.stringify({ token: "reset-token", tokenType: "Bearer", user: { id: 3, name: "School Head", email: "head@cspams.local", role: "school_head", schoolId: 42, schoolCode: "401777", schoolName: "AMA CC - Santiago City" } }), { status: 200, headers: { "Content-Type": "application/json" } });
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
    const resetInit = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];
    const resetHeaders = new Headers(resetInit?.headers as HeadersInit);
    expect(resetInit?.credentials).toBe("include");
    expect(resetHeaders.get("X-CSPAMS-Auth-Mode")).toBe("stateful");
    expect(result.current.apiToken).toBe("reset-token");
  });

  it("verifies bearer-token usability before completing MFA reset sign-in", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/mfa/reset/complete")) {
        return new Response(JSON.stringify({ token: "reset-mfa-token", tokenType: "Bearer", user: { id: 4, name: "Monitor User", email: "monitor@cspams.local", role: "monitor", schoolId: null, schoolCode: null, schoolName: null }, backupCodes: ["ABC123"], message: "Done" }), { status: 200, headers: { "Content-Type": "application/json" } });
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
    const completeResetInit = (fetchMock.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined)?.[1];
    const completeResetHeaders = new Headers(completeResetInit?.headers as HeadersInit);
    expect(completeResetInit?.credentials).toBe("include");
    expect(completeResetHeaders.get("X-CSPAMS-Auth-Mode")).toBe("stateful");
    expect(result.current.apiToken).toBe("reset-mfa-token");
  });

  it("keeps bearer refresh behavior stable for persisted bearer-mode sessions", async () => {
    window.sessionStorage.setItem("cspams.auth.session.v2", JSON.stringify({
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
    window.sessionStorage.setItem("cspams.auth.session.v2", JSON.stringify({
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

  it("ignores stale legacy cookie-mode restore state from older builds", async () => {
    window.sessionStorage.setItem("cspams.auth.session.v1", JSON.stringify({
      mode: "cookie",
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
    expect(window.sessionStorage.getItem("cspams.auth.session.v1")).toBeNull();
    expect(window.sessionStorage.getItem("cspams.auth.session.v2")).toBeNull();
  });

  it("migrates legacy bearer restore state from older builds", async () => {
    window.sessionStorage.setItem("cspams.auth.session.v1", JSON.stringify({
      mode: "bearer",
      token: "legacy-bearer-token",
      tokenType: "Bearer",
    }));

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: {
            id: 14,
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
    expect(headers.get("Authorization")).toBe("Bearer legacy-bearer-token");
    expect(window.sessionStorage.getItem("cspams.auth.session.v1")).toBeNull();
    expect(window.sessionStorage.getItem("cspams.auth.session.v2")).toContain("\"mode\":\"bearer\"");
    expect(result.current.user?.id).toBe(14);
  });
});
