import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, apiRequestVoid, buildApiUrl, COOKIE_SESSION_TOKEN, getApiBaseUrl, normalizeApiBaseUrl } from "@/lib/api";

describe("api request helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("treats standardized JSON success responses as success for void requests", async () => {
    document.cookie = "XSRF-TOKEN=test-xsrf-token; path=/";
    const fetchMock = vi.fn().mockResolvedValue(
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

    await expect(
      apiRequestVoid("/api/auth/logout", {
        method: "POST",
        token: COOKIE_SESSION_TOKEN,
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${getApiBaseUrl()}/api/auth/logout`);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("X-CSPAMS-Auth-Transport")).toBe("cookie");
  });

  it("keeps apiRequest strict for endpoints that should return JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(apiRequest("/api/example")).rejects.toMatchObject({
        message: "No payload was returned for this request.",
        status: 204,
    });
  });

  it("normalizes configured base URLs that already include /api", () => {
    expect(normalizeApiBaseUrl("https://cspams.example.com/api")).toBe("https://cspams.example.com");
    expect(normalizeApiBaseUrl("/api")).toBe("");
    expect(buildApiUrl("/api/auth/login", "https://cspams.example.com/api")).toBe(
      "https://cspams.example.com/api/auth/login",
    );
    expect(buildApiUrl("/sanctum/csrf-cookie", "/api")).toBe("/sanctum/csrf-cookie");
  });

  it("marks bearer requests with explicit token transport", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          authMode: "token",
          user: { role: "monitor" },
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

    await expect(apiRequest("/api/auth/me", { token: "plain-text-token" })).resolves.toMatchObject({
      authMode: "token",
    });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer plain-text-token");
    expect(headers.get("X-CSPAMS-Auth-Transport")).toBe("token");
  });
});
