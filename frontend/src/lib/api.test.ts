import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, apiRequestVoid, buildApiUrl, COOKIE_SESSION_TOKEN, getApiBaseUrl, normalizeApiBaseUrl } from "@/lib/api";

describe("api request helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("treats 204 No Content as success for void requests", async () => {
    document.cookie = "XSRF-TOKEN=test-xsrf-token; path=/";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequestVoid("/api/auth/logout", {
        method: "POST",
        token: COOKIE_SESSION_TOKEN,
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${getApiBaseUrl()}/api/auth/logout`);
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
});
