import { describe, expect, it } from "vitest";
import { toRealtimeAuthorizationError } from "@/lib/realtime";

describe("toRealtimeAuthorizationError", () => {
  it("hides raw browser network fetch errors behind a dashboard-safe fallback message", () => {
    const normalized = toRealtimeAuthorizationError(new Error("NetworkError when attempting to fetch resource."));

    expect(normalized.message).toBe(
      "Realtime updates are temporarily unavailable. Dashboard sync will continue automatically.",
    );
  });

  it("preserves timeout messaging for aborted realtime authorization requests", () => {
    const normalized = toRealtimeAuthorizationError(new DOMException("Aborted", "AbortError"));

    expect(normalized.message).toBe("Realtime authorization timed out.");
  });
});
