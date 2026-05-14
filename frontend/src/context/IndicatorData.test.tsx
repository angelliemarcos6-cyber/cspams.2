import { describe, expect, it } from "vitest";
import { buildIndicatorDataSessionKey } from "@/context/IndicatorData";

describe("buildIndicatorDataSessionKey", () => {
  it("includes assigned school context for School Head users", () => {
    expect(buildIndicatorDataSessionKey({
      id: 25,
      role: "school_head",
      schoolId: 900123,
      schoolType: "private",
    } as never)).toBe("school_head:25:900123:private");
  });

  it("changes when the School Head school context changes", () => {
    const first = buildIndicatorDataSessionKey({
      id: 25,
      role: "school_head",
      schoolId: 900123,
      schoolType: "private",
    } as never);
    const second = buildIndicatorDataSessionKey({
      id: 25,
      role: "school_head",
      schoolId: 900124,
      schoolType: "public",
    } as never);

    expect(first).not.toBe(second);
  });

  it("keeps monitor session identity keyed only by role and user id", () => {
    expect(buildIndicatorDataSessionKey({
      id: 1,
      role: "monitor",
      schoolId: null,
      schoolType: null,
    } as never)).toBe("monitor:1");
  });
});
