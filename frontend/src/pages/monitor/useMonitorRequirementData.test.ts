import { describe, expect, it } from "vitest";
import { buildMonitorRequirementSummaryState } from "@/pages/monitor/useMonitorRequirementData";

describe("buildMonitorRequirementSummaryState", () => {
  it("makes private active package meaning explicit in monitor summary state", () => {
    const result = buildMonitorRequirementSummaryState(
      {
        type: "private",
        indicatorLatest: null,
      },
      true,
    );

    expect(result.packageSchoolType).toBe("private");
    expect(result.activePackageLabel).toBe("FM-QAD uploads only");
    expect(result.requirementModeLabel).toBe("Active package requirements: FM-QAD uploads only.");
    expect(result.missingCount).toBe(1);
  });

  it("treats only monitor-relevant submitted states as active package submission truth", () => {
    const draftState = buildMonitorRequirementSummaryState(
      {
        type: "public",
        indicatorLatest: {
          id: "sub-1",
          status: "draft",
          submittedAt: null,
          reviewedAt: null,
          createdAt: null,
          updatedAt: null,
        },
      },
      true,
    );
    const returnedState = buildMonitorRequirementSummaryState(
      {
        type: "public",
        indicatorLatest: {
          id: "sub-2",
          status: "returned",
          submittedAt: null,
          reviewedAt: null,
          createdAt: null,
          updatedAt: null,
        },
      },
      true,
    );

    expect(draftState.hasActivePackageSubmission).toBe(false);
    expect(returnedState.hasActivePackageSubmission).toBe(true);
    expect(returnedState.hasAnySubmitted).toBe(true);
  });
});
