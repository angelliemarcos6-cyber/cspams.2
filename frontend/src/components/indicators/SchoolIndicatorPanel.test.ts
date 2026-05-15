import { describe, expect, it } from "vitest";
import {
  buildReportFileSubmissionByType,
  buildStrictSubmittedByType,
  buildWorkspaceAutosavePayloadOptions,
  buildWorkspaceFileSubmissionByType,
  resolveMetricFromIndicatorInWorkspace,
} from "@/components/indicators/SchoolIndicatorPanel";
import type { IndicatorMetric, IndicatorSubmission, IndicatorSubmissionItem } from "@/types";

describe("buildWorkspaceAutosavePayloadOptions", () => {
  it("keeps routine autosave in partial mode instead of promoting it to a full workspace replace", () => {
    expect(buildWorkspaceAutosavePayloadOptions()).toEqual({
      allowIncomplete: true,
      includeAllEntries: false,
    });
  });
});

function buildSubmission(overrides: Partial<IndicatorSubmission>): IndicatorSubmission {
  return {
    id: "submission-1",
    formType: "indicator",
    status: "draft",
    statusLabel: "Draft",
    reportingPeriod: "ANNUAL",
    version: 1,
    notes: null,
    reviewNotes: null,
    submittedAt: null,
    reviewedAt: null,
    createdAt: null,
    updatedAt: null,
    summary: {
      totalIndicators: 0,
      metIndicators: 0,
      belowTargetIndicators: 0,
      complianceRatePercent: 0,
    },
    indicators: [],
    ...overrides,
  };
}

function buildMetric(overrides: Partial<IndicatorMetric>): IndicatorMetric {
  return {
    id: "metric-1",
    code: "FM_QAD_TEST",
    name: "FM QAD Test",
    category: "school_achievements_learning_outcomes",
    framework: "imeta",
    dataType: "number",
    ...overrides,
  };
}

function buildIndicatorItem(overrides: Partial<IndicatorSubmissionItem>): IndicatorSubmissionItem {
  return {
    id: "item-1",
    targetValue: null,
    actualValue: null,
    varianceValue: null,
    complianceStatus: "met",
    remarks: null,
    ...overrides,
  };
}

describe("private workspace file lineage hardening", () => {
  it("does not infer report file submissions from a finalized package without that specific uploaded file", () => {
    const finalizedSubmission = buildSubmission({
      status: "submitted",
      files: {
        fm_qad_002: {
          type: "fm_qad_002",
          uploaded: true,
          path: "/tmp/fm-qad-002.pdf",
          originalFilename: "fm-qad-002.pdf",
          sizeBytes: 100,
          uploadedAt: "2026-01-01T00:00:00Z",
          downloadUrl: "/download/fm_qad_002",
          viewUrl: "/view/fm_qad_002",
        },
      },
    });

    const byType = buildReportFileSubmissionByType([finalizedSubmission]);

    expect(byType.fm_qad_001).toBeNull();
    expect(byType.fm_qad_002?.id).toBe("submission-1");
  });

  it("keeps active workspace file state tied to the editable submission only", () => {
    const editableSubmission = buildSubmission({
      files: {
        fm_qad_002: {
          type: "fm_qad_002",
          uploaded: true,
          path: "/tmp/fm-qad-002.pdf",
          originalFilename: "fm-qad-002.pdf",
          sizeBytes: 100,
          uploadedAt: "2026-01-01T00:00:00Z",
          downloadUrl: "/download/fm_qad_002",
          viewUrl: "/view/fm_qad_002",
        },
      },
    });

    const byType = buildWorkspaceFileSubmissionByType(editableSubmission);
    const submittedByType = buildStrictSubmittedByType(byType);

    expect(byType.fm_qad_001).toBeNull();
    expect(submittedByType.fm_qad_001).toBe(false);
    expect(byType.fm_qad_002?.id).toBe("submission-1");
    expect(submittedByType.fm_qad_002).toBe(true);
  });
});

describe("resolveMetricFromIndicatorInWorkspace", () => {
  it("does not use loose metric-name fallback in workspace hydration", () => {
    const metric = buildMetric({
      id: "metric-1",
      code: "IMETA_ENROLL_TOTAL",
      name: "TOTAL NUMBER OF ENROLMENT",
    });
    const metricsById = new Map<string, IndicatorMetric>([[metric.id, metric]]);
    const metricsByCode = new Map<string, IndicatorMetric>([[metric.code, metric]]);
    const metricsByName = new Map<string, IndicatorMetric>([[metric.name.toLowerCase(), metric]]);
    const indicator = buildIndicatorItem({
      metric: undefined,
      ...({ metric_name: "TOTAL NUMBER OF ENROLMENT" } as Partial<IndicatorSubmissionItem>),
    });

    expect(resolveMetricFromIndicatorInWorkspace(indicator, metricsById, metricsByCode, metricsByName)).toBeNull();
  });
});
