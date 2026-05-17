import { describe, expect, it } from "vitest";
import {
  buildMonitorDrawerHistorySummary,
  buildMonitorDrawerSnapshotSummary,
  buildMonitorDrawerSubmissionSummary,
} from "@/pages/monitor/useMonitorDrawerViewModel";

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

describe("buildMonitorDrawerSubmissionSummary", () => {
  it("keeps monitor package truth on the latest submitted or returned package when newer activity is only a draft", () => {
    const summary = buildMonitorDrawerSubmissionSummary(
      {
        schoolKey: "school-3",
        schoolCode: "401779",
        schoolName: "Private College",
        region: "II",
        level: "High School",
        type: "Private",
        schoolTypeRaw: "private",
        requirementModeLabel: "Active package requirements: FM-QAD uploads only.",
        activePackageLabel: "FM-QAD uploads only",
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
      },
      [
        {
          id: "draft-9",
          formType: "indicator",
          status: "draft",
          statusLabel: "Draft",
          reportingPeriod: "ANNUAL",
          version: 9,
          notes: null,
          reviewNotes: null,
          submittedAt: null,
          reviewedAt: null,
          createdAt: "2026-05-17T08:00:00.000Z",
          updatedAt: "2026-05-17T09:00:00.000Z",
          summary: { totalIndicators: 0, metIndicators: 0, belowTargetIndicators: 0, complianceRatePercent: 0 },
          indicators: [],
          academicYear: { id: "year-2", name: "2026-2027" },
        } as never,
        {
          id: "returned-5",
          formType: "indicator",
          status: "returned",
          statusLabel: "Returned",
          reportingPeriod: "ANNUAL",
          version: 5,
          notes: null,
          reviewNotes: null,
          submittedAt: "2026-05-16T09:00:00.000Z",
          reviewedAt: null,
          createdAt: "2026-05-16T08:00:00.000Z",
          updatedAt: "2026-05-16T09:00:00.000Z",
          summary: { totalIndicators: 0, metIndicators: 0, belowTargetIndicators: 0, complianceRatePercent: 72 },
          indicators: [],
          academicYear: { id: "year-1", name: "2025-2026" },
        } as never,
      ],
    );

    expect(summary?.latestActivitySubmissionId).toBe("draft-9");
    expect(summary?.latestMonitorRelevantSubmissionId).toBe("returned-5");
    expect(summary?.submissionStateExplanation).toContain("Latest activity is a draft");
  });
});

describe("buildMonitorDrawerHistorySummary", () => {
  it("explains when the latest package has no indicator rows but an older package can still drive history", () => {
    const summary = buildMonitorDrawerHistorySummary([
      {
        id: "draft-9",
        formType: "indicator",
        status: "draft",
        statusLabel: "Draft",
        reportingPeriod: "ANNUAL",
        version: 9,
        notes: null,
        reviewNotes: null,
        submittedAt: null,
        reviewedAt: null,
        createdAt: "2026-05-17T08:00:00.000Z",
        updatedAt: "2026-05-17T09:00:00.000Z",
        summary: { totalIndicators: 0, metIndicators: 0, belowTargetIndicators: 0, complianceRatePercent: 0 },
        indicators: [],
        academicYear: { id: "year-2", name: "2026-2027" },
      } as never,
      {
        id: "returned-5",
        formType: "indicator",
        status: "returned",
        statusLabel: "Returned",
        reportingPeriod: "ANNUAL",
        version: 5,
        notes: null,
        reviewNotes: null,
        submittedAt: "2026-05-16T09:00:00.000Z",
        reviewedAt: null,
        createdAt: "2026-05-16T08:00:00.000Z",
        updatedAt: "2026-05-16T09:00:00.000Z",
        summary: { totalIndicators: 0, metIndicators: 0, belowTargetIndicators: 0, complianceRatePercent: 72 },
        indicators: [
          {
            id: "indicator-1",
            metric: { id: "metric-1", code: "M001", name: "Metric 1", sortOrder: 1, inputSchema: null },
          },
        ],
        academicYear: { id: "year-1", name: "2025-2026" },
      } as never,
    ]);

    expect(summary?.latestHistoryPackageId).toBe("draft-9");
    expect(summary?.latestRenderableSubmissionId).toBe("returned-5");
    expect(summary?.packagesWithRenderableRowsCount).toBe(1);
    expect(summary?.packagesWithoutRenderableRowsCount).toBe(1);
    expect(summary?.historyFallbackReason).toContain("Latest package has no indicator rows");
  });

  it("explains when packages exist but none contain renderable indicator rows", () => {
    const summary = buildMonitorDrawerHistorySummary([
      {
        id: "pkg-1",
        formType: "indicator",
        status: "submitted",
        statusLabel: "Submitted",
        reportingPeriod: "ANNUAL",
        version: 1,
        notes: null,
        reviewNotes: null,
        submittedAt: "2026-05-16T09:00:00.000Z",
        reviewedAt: null,
        createdAt: "2026-05-16T08:00:00.000Z",
        updatedAt: "2026-05-16T09:00:00.000Z",
        summary: { totalIndicators: 0, metIndicators: 0, belowTargetIndicators: 0, complianceRatePercent: 72 },
        indicators: [],
        academicYear: { id: "year-1", name: "2025-2026" },
      } as never,
    ]);

    expect(summary?.latestRenderableSubmissionId).toBeNull();
    expect(summary?.historyAvailabilityLabel).toBe("Packages exist without indicator detail");
    expect(summary?.historyFallbackReason).toContain("none contain indicator rows");
  });
});
