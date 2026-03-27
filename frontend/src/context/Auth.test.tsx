import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/context/Auth";
import { getApiBaseUrl } from "@/lib/api";

describe("AuthProvider logout", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=test-xsrf-token; path=/";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("clears the current user after a successful 204 logout response", async () => {
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
        "Backend returned bearer-token auth during login. Check SANCTUM_STATEFUL_DOMAINS, CORS, and session cookie settings.",
      );
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticating).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
