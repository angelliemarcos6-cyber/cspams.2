import { describe, expect, it } from "vitest";
import { buildMonitorDrawerYearDetail } from "@/pages/monitor/monitorSchoolDetailYear";
import { buildMonitorDrawerHistorySummary } from "@/pages/monitor/monitorSchoolDetailHistory";
import {
  buildMonitorSchoolIndicatorMatrix,
  deriveMissingMonitorDrawerIndicatorKeys,
  deriveReturnedMonitorDrawerIndicatorKeys,
} from "@/pages/monitor/monitorSchoolDetailMatrix";
import {
  buildMonitorSchoolDetailAlerts,
  buildMonitorSchoolDetailSnapshot,
} from "@/pages/monitor/monitorSchoolDetailAlerts";

describe("buildMonitorDrawerYearDetail", () => {
  it("builds a simple public selected-year checklist and keeps finalized report truth year-scoped", () => {
    const detail = buildMonitorDrawerYearDetail(
      {
        schoolKey: "school-1",
        schoolCode: "401777",
        schoolName: "Sample Public School",
        region: "II",
        level: "Elementary",
        type: "Public",
        schoolTypeRaw: "public",
        requirementModeLabel: "Active package requirements: BMEF and SMEA.",
        activePackageLabel: "BMEF and SMEA",
        address: "N/A",
        hasComplianceRecord: true,
        indicatorStatus: "submitted",
        hasActivePackageSubmission: true,
        missingCount: 0,
        awaitingReviewCount: 1,
        lastActivityAt: null,
        reportedStudents: 0,
        reportedTeachers: 0,
        synchronizedStudents: 0,
        synchronizedTeachers: 0,
      },
      "2025-2026",
      [
        {
          id: "sub-1",
          formType: "indicator",
          status: "submitted",
          statusLabel: "Submitted",
          reportingPeriod: "ANNUAL",
          version: 1,
          notes: null,
          reviewNotes: null,
          submittedAt: "2026-05-17T08:00:00.000Z",
          reviewedAt: null,
          createdAt: "2026-05-17T07:00:00.000Z",
          updatedAt: "2026-05-17T08:00:00.000Z",
          summary: { totalIndicators: 2, metIndicators: 2, belowTargetIndicators: 0, complianceRatePercent: 100 },
          files: {
            bmef: { type: "bmef", uploaded: true, path: null, originalFilename: "bmef.pdf", sizeBytes: 10, uploadedAt: "2026-05-17T08:00:00.000Z", downloadUrl: null },
            smea: { type: "smea", uploaded: true, path: null, originalFilename: "smea.pdf", sizeBytes: 10, uploadedAt: "2026-05-17T08:00:00.000Z", downloadUrl: null },
          },
          indicators: [
            {
              id: "a1",
              metric: {
                id: "m1",
                code: "IMETA_HEAD_NAME",
                name: "Name",
                sortOrder: 1,
                inputSchema: { valueType: "text", years: ["2025-2026"] },
              },
              targetValue: null,
              actualValue: null,
              varianceValue: null,
              actualDisplay: "Jane Doe",
              targetDisplay: null,
              complianceStatus: "met",
              remarks: null,
            },
            {
              id: "k1",
              metric: {
                id: "m2",
                code: "NER",
                name: "NER",
                sortOrder: 2,
                inputSchema: { valueType: "percentage", years: ["2025-2026"] },
              },
              targetValue: 100,
              actualValue: 98,
              varianceValue: 2,
              actualDisplay: "2025-2026: 98.00% | 2026-2027: 0.00%",
              targetDisplay: "2025-2026: 100.00% | 2026-2027: 0.00%",
              targetTypedValue: { values: { "2025-2026": 100 } },
              actualTypedValue: { values: { "2025-2026": 98 } },
              complianceStatus: "met",
              remarks: null,
            },
          ],
          academicYear: { id: "year-1", name: "2025-2026" },
        } as never,
        {
          id: "sub-2",
          formType: "indicator",
          status: "validated",
          statusLabel: "Validated",
          reportingPeriod: "ANNUAL",
          version: 2,
          notes: null,
          reviewNotes: null,
          submittedAt: "2027-05-17T08:00:00.000Z",
          reviewedAt: "2027-05-18T08:00:00.000Z",
          createdAt: "2027-05-17T07:00:00.000Z",
          updatedAt: "2027-05-18T08:00:00.000Z",
          summary: { totalIndicators: 1, metIndicators: 1, belowTargetIndicators: 0, complianceRatePercent: 100 },
          indicators: [],
          academicYear: { id: "year-2", name: "2026-2027" },
        } as never,
      ],
      [
        {
          key: "IMETA_HEAD_NAME",
          code: "IMETA_HEAD_NAME",
          label: "NAME OF SCHOOL HEAD",
          category: "SCHOOL'S ACHIEVEMENTS AND LEARNING OUTCOMES",
          sortOrder: 1,
          valuesByYear: { "2025-2026": { target: "", actual: "Jane Doe" } },
        },
        {
          key: "NER",
          code: "NER",
          label: "Net Enrollment Rate",
          category: "KEY PERFORMANCE INDICATORS",
          sortOrder: 2,
          valuesByYear: { "2025-2026": { target: "100.00%", actual: "98.00%" } },
        },
      ],
    );

    expect(detail?.selectedYearLabel).toBe("2025-2026");
    expect(detail?.checklistItems.map((item) => `${item.label}:${item.statusLabel}`)).toEqual([
      "School Achievements:For Review",
      "Key Performance:For Review",
      "BMEF:For Review",
      "SMEA:For Review",
    ]);
    expect(detail?.reportSourceContext[0]).toContain("2025-2026");
    expect(detail?.schoolAchievementRows[0]?.value).toBe("Jane Doe");
    expect(detail?.kpiRows[0]?.actual).toBe("98.00%");
  });

  it("builds private FM-QAD checklist items and keeps report values as placeholders when no finalized year report exists", () => {
    const detail = buildMonitorDrawerYearDetail(
      {
        schoolKey: "school-2",
        schoolCode: "401778",
        schoolName: "Private School",
        region: "II",
        level: "High School",
        type: "Private",
        schoolTypeRaw: "private",
        requirementModeLabel: "Active package requirements: FM-QAD uploads only.",
        activePackageLabel: "FM-QAD uploads only",
        address: "N/A",
        hasComplianceRecord: true,
        indicatorStatus: "draft",
        hasActivePackageSubmission: false,
        missingCount: 1,
        awaitingReviewCount: 0,
        lastActivityAt: null,
        reportedStudents: 0,
        reportedTeachers: 0,
        synchronizedStudents: 0,
        synchronizedTeachers: 0,
      },
      "2025-2026",
      [
        {
          id: "draft-1",
          formType: "indicator",
          status: "draft",
          statusLabel: "Draft",
          reportingPeriod: "ANNUAL",
          version: 1,
          notes: null,
          reviewNotes: null,
          submittedAt: null,
          reviewedAt: null,
          createdAt: "2026-05-16T07:00:00.000Z",
          updatedAt: "2026-05-16T08:00:00.000Z",
          summary: { totalIndicators: 1, metIndicators: 0, belowTargetIndicators: 1, complianceRatePercent: 0 },
          files: {
            fm_qad_001: { type: "fm_qad_001", uploaded: true, path: null, originalFilename: "fm-1.pdf", sizeBytes: 10, uploadedAt: "2026-05-16T08:00:00.000Z", downloadUrl: null },
          },
          indicators: [
            {
              id: "a1",
              metric: { id: "m1", code: "IMETA_HEAD_NAME", name: "Name", sortOrder: 1, inputSchema: null },
              targetValue: null,
              actualValue: null,
              varianceValue: null,
              actualDisplay: "John Doe",
              targetDisplay: null,
              complianceStatus: "missing",
              remarks: null,
            },
          ],
          academicYear: { id: "year-1", name: "2025-2026" },
        } as never,
      ],
      [
        {
          key: "IMETA_HEAD_NAME",
          code: "IMETA_HEAD_NAME",
          label: "NAME OF SCHOOL HEAD",
          category: "SCHOOL'S ACHIEVEMENTS AND LEARNING OUTCOMES",
          sortOrder: 1,
          valuesByYear: { "2025-2026": { target: "", actual: "John Doe" } },
        },
      ],
    );

    expect(detail?.selectedYearLabel).toBe("2025-2026");
    expect(detail?.finalizedReportSubmission).toBeNull();
    expect(detail?.reportBlankStateLines[0]).toContain("No finalized submitted report package exists yet");
    expect(detail?.checklistItems.some((item) => item.label === "FM-QAD-001" && item.statusLabel === "Uploaded")).toBe(true);
    expect(detail?.checklistItems.some((item) => item.label === "FM-QAD-002" && item.statusLabel === "Missing")).toBe(true);
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
    expect(summary?.historyFallbackReason).toContain("Latest package has no indicator rows");
  });
});

describe("monitor school detail matrix helpers", () => {
  it("keeps current-year missing and returned keys tied to the selected year only", () => {
    const submissions = [
      {
        id: "sub-2025",
        formType: "indicator",
        status: "returned",
        statusLabel: "Returned",
        reportingPeriod: "ANNUAL",
        version: 1,
        submittedAt: "2026-05-17T08:00:00.000Z",
        reviewedAt: null,
        createdAt: "2026-05-17T07:00:00.000Z",
        updatedAt: "2026-05-17T08:00:00.000Z",
        summary: { totalIndicators: 2, metIndicators: 1, belowTargetIndicators: 1, complianceRatePercent: 50 },
        indicators: [
          {
            id: "a1",
            metric: { id: "m1", code: "IMETA_HEAD_NAME", name: "Name", sortOrder: 1, inputSchema: null },
            actualDisplay: "Jane Doe",
            targetDisplay: null,
            complianceStatus: "met",
            targetTypedValue: null,
            actualTypedValue: null,
          },
          {
            id: "k1",
            metric: { id: "m2", code: "NER", name: "NER", sortOrder: 2, inputSchema: null },
            actualDisplay: "95.00%",
            targetDisplay: "",
            complianceStatus: "returned",
            targetTypedValue: null,
            actualTypedValue: null,
          },
        ],
        academicYear: { id: "year-1", name: "2025-2026" },
      } as never,
      {
        id: "sub-2026",
        formType: "indicator",
        status: "validated",
        statusLabel: "Validated",
        reportingPeriod: "ANNUAL",
        version: 1,
        submittedAt: "2027-05-17T08:00:00.000Z",
        reviewedAt: null,
        createdAt: "2027-05-17T07:00:00.000Z",
        updatedAt: "2027-05-17T08:00:00.000Z",
        summary: { totalIndicators: 1, metIndicators: 1, belowTargetIndicators: 0, complianceRatePercent: 100 },
        indicators: [
          {
            id: "a2",
            metric: { id: "m1", code: "IMETA_HEAD_NAME", name: "Name", sortOrder: 1, inputSchema: null },
            actualDisplay: "John Doe",
            targetDisplay: null,
            complianceStatus: "met",
            targetTypedValue: null,
            actualTypedValue: null,
          },
        ],
        academicYear: { id: "year-2", name: "2026-2027" },
      } as never,
    ];

    const matrix = buildMonitorSchoolIndicatorMatrix(submissions as never);
    const rowKeySet = new Set(matrix.rows.map((row) => row.key));

    expect(deriveMissingMonitorDrawerIndicatorKeys(matrix.rows, "2025-2026")).toContain("NER");
    expect(deriveMissingMonitorDrawerIndicatorKeys(matrix.rows, "2026-2027")).toContain("NER");
    expect(deriveReturnedMonitorDrawerIndicatorKeys(submissions as never, "2025-2026", rowKeySet)).toEqual(["NER"]);
    expect(deriveReturnedMonitorDrawerIndicatorKeys(submissions as never, "2026-2027", rowKeySet)).toEqual([]);
  });
});

describe("monitor school detail snapshot helpers", () => {
  it("builds school detail and alerts without driving current-year truth from history helpers", () => {
    const detail = buildMonitorSchoolDetailSnapshot({
      schoolDrawerKey: "school-1",
      schoolRequirementByKey: new Map([
        ["school-1", {
          schoolCode: "401777",
          schoolName: "AMA CC - Santiago City",
          region: "II",
          requirementModeLabel: "",
          activePackageLabel: "",
          hasComplianceRecord: false,
          indicatorStatus: "returned",
          hasActivePackageSubmission: true,
          missingCount: 2,
          awaitingReviewCount: 1,
          lastActivityAt: null,
        } as never],
      ]),
      recordBySchoolKey: new Map([
        ["school-1", {
          schoolId: "401777",
          schoolCode: "401777",
          schoolName: "AMA CC - Santiago City",
          region: "II",
          level: "High School",
          type: "private",
          address: "N/A",
          district: "N/A",
          studentCount: 10,
          teacherCount: 2,
          lastUpdated: null,
        } as never],
      ]),
      studentStatsBySchoolKey: new Map([["school-1", { students: 8, teachers: new Set(["t1"]) }]]),
      accurateSyncedCountsBySchoolKey: { "school-1": { students: 8, teachers: 1 } },
    });

    expect(detail?.type).toBe("Private");
    expect(detail?.schoolTypeRaw).toBe("private");

    const alerts = buildMonitorSchoolDetailAlerts(detail, "Unable to load school submissions.");
    expect(alerts.map((alert) => alert.id)).toEqual([
      "missing-compliance-record",
      "returned-package",
      "missing-required-indicators",
      "pending-review",
      "student-count-mismatch",
      "teacher-count-mismatch",
      "submission-load-issue",
    ]);
  });
});
