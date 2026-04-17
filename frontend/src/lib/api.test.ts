import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, apiRequestVoid, COOKIE_SESSION_TOKEN, getApiBaseUrl } from "@/lib/api";

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

  it("attaches Authorization bearer headers for token-based requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/auth/me", {
      token: "sample-bearer-token",
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(requestInit?.headers as HeadersInit);

    expect(headers.get("Authorization")).toBe("Bearer sample-bearer-token");
    expect(requestInit?.credentials).toBe("omit");
  });
});
