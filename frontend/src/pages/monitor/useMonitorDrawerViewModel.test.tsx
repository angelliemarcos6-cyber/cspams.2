import { describe, expect, it } from "vitest";
import { buildMonitorDrawerSnapshotSummary } from "@/pages/monitor/useMonitorDrawerViewModel";

describe("buildMonitorDrawerSnapshotSummary", () => {
  it("makes private active package requirements explicit in the snapshot summary", () => {
    const summary = buildMonitorDrawerSnapshotSummary({
      schoolKey: "school-1",
      schoolCode: "401777",
      schoolName: "AMA CC - Santiago City",
      region: "II",
      level: "High School",
      type: "Private",
      schoolTypeRaw: "private",
      requirementModeLabel: "Active package requirements: FM-QAD uploads only.",
      activePackageLabel: "FM-QAD uploads only",
      address: "N/A",
      hasComplianceRecord: true,
      indicatorStatus: null,
      hasActivePackageSubmission: false,
      missingCount: 1,
      awaitingReviewCount: 0,
      lastActivityAt: null,
      reportedStudents: 0,
      reportedTeachers: 0,
      synchronizedStudents: 0,
      synchronizedTeachers: 0,
    });

    expect(summary?.activePackageLabel).toBe("FM-QAD uploads only");
    expect(summary?.requirementModeLabel).toBe("Active package requirements: FM-QAD uploads only.");
    expect(summary?.summaryHeadline).toContain("Active private package is not yet submitted.");
  });

  it("explains returned package state as monitor-facing action", () => {
    const summary = buildMonitorDrawerSnapshotSummary({
      schoolKey: "school-2",
      schoolCode: "401778",
      schoolName: "Sample Public School",
      region: "II",
      level: "Elementary",
      type: "Public",
      schoolTypeRaw: "public",
      requirementModeLabel: "Active package requirements: BMEF and SMEA.",
      activePackageLabel: "BMEF and SMEA",
      address: "N/A",
      hasComplianceRecord: true,
      indicatorStatus: "returned",
      hasActivePackageSubmission: true,
      missingCount: 0,
      awaitingReviewCount: 0,
      lastActivityAt: null,
      reportedStudents: 0,
      reportedTeachers: 0,
      synchronizedStudents: 0,
      synchronizedTeachers: 0,
    });

    expect(summary?.currentIssueLabel).toBe("Returned package needs correction.");
    expect(summary?.needsAction).toBe(true);
    expect(summary?.summaryHeadline).toContain("returned for correction");
  });
});
