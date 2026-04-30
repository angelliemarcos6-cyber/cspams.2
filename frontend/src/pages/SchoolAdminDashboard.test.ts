import { describe, expect, it } from "vitest";
import {
  resolvePreferredSubmittedReportAcademicYearId,
  resolveSelectedYearReportSubmission,
} from "@/pages/SchoolAdminDashboard";
import type { IndicatorSubmission } from "@/types";

function submission(overrides: Partial<IndicatorSubmission>): IndicatorSubmission {
  return {
    id: "submission-1",
    formType: "indicator",
    academicYear: { id: "year-1", name: "2025-2026" },
    reportingPeriod: "ANNUAL",
    status: "draft",
    statusLabel: "Draft",
    version: 1,
    notes: null,
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
    submittedAt: null,
    reviewedAt: null,
    reviewNotes: null,
    indicators: [],
    items: [],
    summary: {
      totalIndicators: 0,
      metIndicators: 0,
      belowTargetIndicators: 0,
      complianceRatePercent: 0,
    },
    completion: {
      hasImetaFormData: false,
      hasBmefFile: false,
      hasSmeaFile: false,
      isComplete: false,
    },
    ...overrides,
  };
}

describe("resolveSelectedYearReportSubmission", () => {
  it("ignores draft and returned submissions for the submitted package view", () => {
    const result = resolveSelectedYearReportSubmission([
      submission({ id: "draft-1", status: "draft", statusLabel: "Draft", updatedAt: "2026-04-30T00:00:00.000Z" }),
      submission({ id: "returned-1", status: "returned", statusLabel: "Returned", updatedAt: "2026-04-30T01:00:00.000Z" }),
    ]);

    expect(result).toBeNull();
  });

  it("prefers submitted or validated submissions when present", () => {
    const result = resolveSelectedYearReportSubmission([
      submission({ id: "submitted-1", status: "submitted", statusLabel: "Submitted", updatedAt: "2026-04-29T00:00:00.000Z" }),
      submission({ id: "validated-1", status: "validated", statusLabel: "Validated", updatedAt: "2026-04-30T00:00:00.000Z" }),
      submission({ id: "draft-1", status: "draft", statusLabel: "Draft", updatedAt: "2026-05-01T00:00:00.000Z" }),
    ]);

    expect(result?.id).toBe("validated-1");
  });
});

describe("resolvePreferredSubmittedReportAcademicYearId", () => {
  it("prefers the academic year of the latest finalized submission", () => {
    const result = resolvePreferredSubmittedReportAcademicYearId([
      submission({
        id: "submitted-old",
        status: "submitted",
        statusLabel: "Submitted",
        academicYear: { id: "year-1", name: "2025-2026" },
        updatedAt: "2026-04-29T00:00:00.000Z",
        school: { id: "school-1", schoolCode: "001", name: "Test School" },
      }),
      submission({
        id: "validated-new",
        status: "validated",
        statusLabel: "Validated",
        academicYear: { id: "year-2", name: "2026-2027" },
        updatedAt: "2026-04-30T00:00:00.000Z",
        school: { id: "school-1", schoolCode: "001", name: "Test School" },
      }),
      submission({
        id: "draft-newest",
        status: "draft",
        statusLabel: "Draft",
        academicYear: { id: "year-3", name: "2027-2028" },
        updatedAt: "2026-05-01T00:00:00.000Z",
        school: { id: "school-1", schoolCode: "001", name: "Test School" },
      }),
    ], "school-1");

    expect(result).toBe("year-2");
  });
});
