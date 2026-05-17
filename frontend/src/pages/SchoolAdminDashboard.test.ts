import { describe, expect, it } from "vitest";
import {
  buildSubmittedReportBlankStateLines,
  buildSubmittedReportSourceContext,
  buildSchoolAdminRefreshBatches,
  buildDashboardViewYearStorageKey,
  resolveInitialSubmittedReportAcademicYearId,
  resolveSchoolAdminHeaderContext,
  resolveSubmittedReportIndicatorByMetricCode,
  resolveSubmittedReportSubmissionForView,
  resolvePreferredSubmittedReportAcademicYearId,
  resolveSelectedYearReportSubmission,
  resolveStableSubmittedReportViewSubmission,
} from "@/pages/SchoolAdminDashboard";
import type { IndicatorSubmission, IndicatorSubmissionItem } from "@/types";

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

  it("uses submitted lineage recency before generic update freshness", () => {
    const result = resolveSelectedYearReportSubmission([
      submission({
        id: "submitted-newer-lineage",
        status: "submitted",
        statusLabel: "Submitted",
        submittedAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      }),
      submission({
        id: "validated-later-touch",
        status: "validated",
        statusLabel: "Validated",
        submittedAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
      }),
    ]);

    expect(result?.id).toBe("submitted-newer-lineage");
  });
});

describe("resolvePreferredSubmittedReportAcademicYearId", () => {
  it("prefers the academic year of the latest finalized submission", () => {
    const result = resolvePreferredSubmittedReportAcademicYearId([
      submission({
        id: "submitted-old",
        status: "submitted",
        statusLabel: "Submitted",
        schoolId: "school-1",
        academicYear: { id: "year-1", name: "2025-2026" },
        updatedAt: "2026-04-29T00:00:00.000Z",
        school: { id: "school-1", schoolCode: "001", name: "Test School" },
      }),
      submission({
        id: "validated-new",
        status: "validated",
        statusLabel: "Validated",
        schoolId: "school-1",
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

  it("ignores finalized submissions whose strict school identity does not match the School Head school", () => {
    const result = resolvePreferredSubmittedReportAcademicYearId([
      submission({
        id: "wrong-school",
        status: "submitted",
        statusLabel: "Submitted",
        schoolId: "school-2",
        academicYear: { id: "year-2", name: "2026-2027" },
        updatedAt: "2026-04-30T00:00:00.000Z",
      }),
      submission({
        id: "right-school",
        status: "submitted",
        statusLabel: "Submitted",
        schoolId: "school-1",
        academicYear: { id: "year-1", name: "2025-2026" },
        updatedAt: "2026-04-29T00:00:00.000Z",
      }),
    ], "school-1");

    expect(result).toBe("year-1");
  });
});

describe("resolveInitialSubmittedReportAcademicYearId", () => {
  it("prefers a stored academic year when it is valid for the current School Head session", () => {
    const result = resolveInitialSubmittedReportAcademicYearId([
      { id: "year-1", isCurrent: false },
      { id: "year-2", isCurrent: true },
    ], "year-1");

    expect(result).toBe("year-1");
  });

  it("defaults to the current academic year instead of the latest historical finalized year", () => {
    const result = resolveInitialSubmittedReportAcademicYearId([
      { id: "year-1", isCurrent: false },
      { id: "year-2", isCurrent: true },
      { id: "year-3", isCurrent: false },
    ], "");

    expect(result).toBe("year-2");
  });
});

describe("buildDashboardViewYearStorageKey", () => {
  it("scopes the stored year selection per School Head user and school", () => {
    expect(buildDashboardViewYearStorageKey(25, "103811")).toBe(
      "cspams:school-admin-dashboard:view-year:25:103811",
    );
  });

  it("returns an empty key when either the user or school context is missing", () => {
    expect(buildDashboardViewYearStorageKey(null, "103811")).toBe("");
    expect(buildDashboardViewYearStorageKey(25, "")).toBe("");
  });
});

describe("buildSchoolAdminRefreshBatches", () => {
  it("eagerly includes the full School Head submission preload after the snapshot refresh", () => {
    const refreshRecords = async () => undefined;
    const refreshSubmissions = async () => undefined;
    const refreshAllSubmissions = async () => undefined;

    expect(
      buildSchoolAdminRefreshBatches(refreshRecords, refreshSubmissions, refreshAllSubmissions),
    ).toEqual([
      [refreshRecords, refreshSubmissions],
      [refreshAllSubmissions],
    ]);
  });
});

describe("buildSubmittedReportBlankStateLines", () => {
  it("keeps the selected-year no-finalized-package explanation explicit while preserving reference-table semantics", () => {
    expect(buildSubmittedReportBlankStateLines()).toEqual([
      "No finalized submitted report package exists yet for the selected academic year.",
      "The report tables are shown for reference. Finalized values will appear here after you submit the package.",
    ]);
  });
});

describe("buildSubmittedReportSourceContext", () => {
  it("keeps the submitted report header explicitly scoped to the selected report year", () => {
    expect(
      buildSubmittedReportSourceContext(
        submission({
          id: "42",
          status: "submitted",
          statusLabel: "Submitted",
        }),
        "2025-2026",
      ),
    ).toEqual([
      "Viewing finalized submitted report for SY 2025-2026.",
      "Source package: #42 (Submitted).",
    ]);
  });
});

describe("resolveSchoolAdminHeaderContext", () => {
  it("uses the assigned school address instead of region-oriented fallback data", () => {
    const result = resolveSchoolAdminHeaderContext(
      {
        schoolName: "Private Academy",
        schoolCode: "900123",
        address: "Santiago City, Isabela",
      },
      {
        schoolName: "Different Name",
        schoolCode: "111111",
      } as never,
    );

    expect(result).toEqual({
      schoolName: "Private Academy",
      schoolCode: "900123",
      schoolAddress: "Santiago City, Isabela",
    });
  });

  it("does not fall back to unrelated address data when the assigned record has no address", () => {
    const result = resolveSchoolAdminHeaderContext(
      {
        schoolName: "Private Academy",
        schoolCode: "900123",
        address: null,
      } as never,
      {
        schoolName: "Private Academy",
        schoolCode: "900123",
      } as never,
    );

    expect(result.schoolAddress).toBe("N/A");
  });

  it("uses the authenticated assigned-school address as a safe fallback when records are not ready yet", () => {
    const result = resolveSchoolAdminHeaderContext(
      null,
      {
        schoolName: "Private Academy",
        schoolCode: "900123",
        schoolAddress: "Santiago City, Isabela",
      } as never,
    );

    expect(result.schoolAddress).toBe("Santiago City, Isabela");
  });
});

describe("resolveSubmittedReportSubmissionForView", () => {
  it("rejects a finalized submission when it belongs to a different school", () => {
    const result = resolveSubmittedReportSubmissionForView(
      submission({
        status: "submitted",
        statusLabel: "Submitted",
        schoolId: "school-2",
        school: { id: "school-2", schoolCode: "002", name: "Other School", type: "private" },
      }),
      { selectedSchoolId: "school-1", selectedAcademicYearId: "year-1" },
    );

    expect(result).toBeNull();
  });

  it("rejects a finalized submission when its strict school identity mismatches even if nested school data is absent", () => {
    const result = resolveSubmittedReportSubmissionForView(
      submission({
        status: "submitted",
        statusLabel: "Submitted",
        schoolId: "school-2",
        school: undefined,
      }),
      { selectedSchoolId: "school-1", selectedAcademicYearId: "year-1" },
    );

    expect(result).toBeNull();
  });

  it("rejects a finalized submission when it belongs to a different academic year", () => {
    const result = resolveSubmittedReportSubmissionForView(
      submission({
        status: "submitted",
        statusLabel: "Submitted",
        school: { id: "school-1", schoolCode: "001", name: "Test School", type: "private" },
        academicYear: { id: "year-2", name: "2026-2027" },
      }),
      { selectedSchoolId: "school-1", selectedAcademicYearId: "year-1" },
    );

    expect(result).toBeNull();
  });
});

describe("resolveStableSubmittedReportViewSubmission", () => {
  it("keeps hydrated finalized detail when it belongs to the same selected-year finalized report source", () => {
    const selected = submission({
      id: "submission-1",
      status: "submitted",
      statusLabel: "Submitted",
      indicators: [],
      items: [],
      schoolId: "school-1",
    });
    const hydrated = submission({
      id: "submission-1",
      status: "submitted",
      statusLabel: "Submitted",
      schoolId: "school-1",
      indicators: [
        {
          id: "indicator-1",
          metric: {
            id: "NER",
            code: "NER",
            name: "Net Enrollment Rate",
            category: "test",
            framework: "imeta",
            dataType: "number",
          },
          targetValue: 1,
          actualValue: 2,
          varianceValue: 1,
          complianceStatus: "met",
          remarks: null,
        },
      ],
      items: [],
    });

    const result = resolveStableSubmittedReportViewSubmission(selected, hydrated, {
      selectedSchoolId: "school-1",
      selectedAcademicYearId: "year-1",
    });

    expect(result).toBe(hydrated);
  });

  it("does not let an older hydrated finalized row override a newer selected-year finalized package", () => {
    const selected = submission({
      id: "submission-2",
      status: "submitted",
      statusLabel: "Submitted",
      schoolId: "school-1",
      submittedAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    });
    const hydrated = submission({
      id: "submission-1",
      status: "submitted",
      statusLabel: "Submitted",
      schoolId: "school-1",
      submittedAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
      indicators: [
        {
          id: "indicator-1",
          metric: {
            id: "NER",
            code: "NER",
            name: "Net Enrollment Rate",
            category: "test",
            framework: "imeta",
            dataType: "number",
          },
          targetValue: 1,
          actualValue: 2,
          varianceValue: 1,
          complianceStatus: "met",
          remarks: null,
        },
      ],
      items: [],
    });

    const result = resolveStableSubmittedReportViewSubmission(selected, hydrated, {
      selectedSchoolId: "school-1",
      selectedAcademicYearId: "year-1",
    });

    expect(result).toBe(selected);
  });
});

describe("resolveSubmittedReportIndicatorByMetricCode", () => {
  function indicator(metricCode: string, metricName: string): IndicatorSubmissionItem {
    return {
      id: `${metricCode}-${metricName}`,
      metric: {
        id: metricCode,
        code: metricCode,
        name: metricName,
        category: "test",
        framework: "imeta",
        dataType: "number",
      },
      targetValue: 1,
      actualValue: 2,
      varianceValue: 1,
      complianceStatus: "met",
      remarks: null,
    };
  }

  it("returns the exact metric-code match when it is unique", () => {
    const result = resolveSubmittedReportIndicatorByMetricCode(
      [indicator("NER", "Net Enrollment Rate"), indicator("RR", "Retention Rate")],
      "NER",
    );

    expect(result?.metric?.code).toBe("NER");
  });

  it("returns null when the same metric code appears more than once", () => {
    const result = resolveSubmittedReportIndicatorByMetricCode(
      [indicator("NER", "Net Enrollment Rate"), indicator("NER", "Duplicate NER")],
      "NER",
    );

    expect(result).toBeNull();
  });
});
