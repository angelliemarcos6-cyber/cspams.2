import { describe, expect, it } from "vitest";
import {
  buildWorkspaceProgressSummary,
  buildResetEntryForMetric,
  buildReportFileSubmissionByType,
  buildStrictSubmittedByType,
  buildWorkspaceAutosavePayloadOptions,
  buildWorkspaceFileSubmissionByType,
  resolveEditableWorkspaceSubmission,
  resolveMetricFromIndicatorInWorkspace,
  resolvePreferredWorkspaceSubmission,
  shouldRestorePersistedWorkspaceDraft,
  shouldReplaceInScopeWorkspaceSubmission,
  workspaceDraftGuidanceCopy,
  workspaceFileDraftStatusLabel,
} from "@/components/indicators/SchoolIndicatorPanel";
import { buildSubmissionUploadedFileFingerprint } from "@/utils/submissionRequirements";
import type { IndicatorMetric, IndicatorSubmission, IndicatorSubmissionItem } from "@/types";

describe("buildWorkspaceAutosavePayloadOptions", () => {
  it("keeps routine autosave incremental instead of promoting it to a full workspace replace", () => {
    expect(buildWorkspaceAutosavePayloadOptions()).toEqual({
      allowIncomplete: true,
      includeAllEntries: false,
    });
  });
});

describe("buildResetEntryForMetric", () => {
  it("clears reset numeric cells back to blank instead of synthetic zeroes", () => {
    const metric = buildMetric({
      dataType: "number",
      inputSchema: {},
    });

    expect(
      buildResetEntryForMetric(metric, [], {
        targetValue: "12",
        actualValue: "34",
        targetText: "",
        actualText: "",
        targetBoolean: "",
        actualBoolean: "",
        targetEnum: "",
        actualEnum: "",
        targetMatrix: {},
        actualMatrix: {},
        remarks: "note",
      }),
    ).toMatchObject({
      targetValue: "",
      actualValue: "",
      remarks: "",
    });
  });

  it("clears reset yearly-matrix cells back to blank so missing-state and completion recalculate correctly", () => {
    const metric = buildMetric({
      dataType: "yearly_matrix",
      inputSchema: {
        valueType: "integer",
        years: ["2025-2026", "2026-2027"],
      },
    });

    const entry = buildResetEntryForMetric(metric, ["2025-2026"], {
      targetValue: "",
      actualValue: "",
      targetText: "",
      actualText: "",
      targetBoolean: "",
      actualBoolean: "",
      targetEnum: "",
      actualEnum: "",
      targetMatrix: {
        "2025-2026": "585",
        "2026-2027": "900",
      },
      actualMatrix: {
        "2025-2026": "585",
        "2026-2027": "900",
      },
      remarks: "note",
    });

    expect(entry.targetMatrix["2025-2026"]).toBe("");
    expect(entry.actualMatrix["2025-2026"]).toBe("");
    expect(entry.targetMatrix["2026-2027"]).toBe("900");
    expect(entry.actualMatrix["2026-2027"]).toBe("900");
    expect(entry.remarks).toBe("");
  });
});

describe("shouldRestorePersistedWorkspaceDraft", () => {
  it("ignores legacy note-only autosave payloads after optional note removal", () => {
    expect(
      shouldRestorePersistedWorkspaceDraft({
        metricEntries: {},
        ...({ notes: "Legacy note-only draft" } as Record<string, unknown>),
      } as never),
    ).toBe(false);
  });
});

describe("workspace draft guidance", () => {
  it("keeps file-part status language distinct from final package submission", () => {
    expect(workspaceFileDraftStatusLabel(true)).toBe("Uploaded");
    expect(workspaceFileDraftStatusLabel(false)).toBe("Not Uploaded");
  });

  it("explains that sections and files can be persisted before final submit", () => {
    expect(workspaceDraftGuidanceCopy()).toContain("save sections");
    expect(workspaceDraftGuidanceCopy()).toContain("upload files individually");
    expect(workspaceDraftGuidanceCopy()).toContain("submit each workspace item individually");
    expect(workspaceDraftGuidanceCopy()).toContain("Final Submit");
  });
});

describe("buildWorkspaceProgressSummary", () => {
  it("combines completed indicator sections and uploaded required files into one truthful workspace summary", () => {
    const summary = buildWorkspaceProgressSummary({
      categoryProgressById: new Map([
        ["school_achievements_learning_outcomes", { total: 43, complete: 43 }],
        ["key_performance_indicators", { total: 19, complete: 12 }],
      ]),
      categoryIds: [
        "school_achievements_learning_outcomes",
        "key_performance_indicators",
      ],
      fileTypes: ["fm_qad_001", "fm_qad_002"],
      uploadedFileTypes: {
        bmef: false,
        smea: false,
        fm_qad_001: true,
        fm_qad_002: false,
        fm_qad_003: false,
        fm_qad_004: false,
        fm_qad_008: false,
        fm_qad_009: false,
        fm_qad_010: false,
        fm_qad_011: false,
        fm_qad_034: false,
        fm_qad_041: false,
      },
      submittedScopeIds: ["school_achievements_learning_outcomes"],
    });

    expect(summary.totalScopeCount).toBe(4);
    expect(summary.readyScopeCount).toBe(2);
    expect(summary.submittedScopeCount).toBe(1);
    expect(summary.readyScopeIds).toEqual([
      "school_achievements_learning_outcomes",
      "fm_qad_001",
    ]);
    expect(summary.readyUnsubmittedScopeIds).toEqual(["fm_qad_001"]);
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

  it("includes private FM-QAD upload-state changes in the shared workspace fingerprint helper", () => {
    const withoutUpload = buildSubmission({
      files: {},
      completion: {
        hasImetaFormData: false,
        hasBmefFile: false,
        hasSmeaFile: false,
        isComplete: false,
      },
    });
    const withUpload = buildSubmission({
      files: {
        fm_qad_001: {
          type: "fm_qad_001",
          uploaded: true,
          path: "/tmp/fm-qad-001.pdf",
          originalFilename: "fm-qad-001.pdf",
          sizeBytes: 100,
          uploadedAt: "2026-01-01T00:00:00Z",
          downloadUrl: "/download/fm_qad_001",
          viewUrl: "/view/fm_qad_001",
        },
      },
      completion: {
        hasImetaFormData: false,
        hasBmefFile: false,
        hasSmeaFile: false,
        isComplete: false,
      },
    });

    expect(buildSubmissionUploadedFileFingerprint(withoutUpload)).not.toBe(
      buildSubmissionUploadedFileFingerprint(withUpload),
    );
  });
});

describe("workspace submission precedence", () => {
  it("prefers the freshest editable draft or returned submission over newer finalized rows", () => {
    const returned = buildSubmission({
      id: "returned-1",
      status: "returned",
      updatedAt: "2026-05-17T08:00:00Z",
    });
    const submitted = buildSubmission({
      id: "submitted-1",
      status: "submitted",
      updatedAt: "2026-05-17T09:00:00Z",
    });

    expect(resolveEditableWorkspaceSubmission([submitted, returned], null)?.id).toBe("returned-1");
    expect(resolvePreferredWorkspaceSubmission([submitted, returned], null)?.id).toBe("returned-1");
  });

  it("prefers the freshest finalized row instead of a stale finalized editing submission id", () => {
    const submitted = buildSubmission({
      id: "submitted-1",
      status: "submitted",
      updatedAt: "2026-05-17T09:00:00Z",
    });
    const validated = buildSubmission({
      id: "validated-1",
      status: "validated",
      updatedAt: "2026-05-17T08:00:00Z",
    });

    expect(resolvePreferredWorkspaceSubmission([submitted, validated], "validated-1")?.id).toBe("submitted-1");
  });

  it("replaces a stale finalized in-scope row when a fresher finalized row becomes preferred", () => {
    const current = buildSubmission({
      id: "submitted-older",
      status: "submitted",
      updatedAt: "2026-05-17T08:00:00Z",
    });
    const preferred = buildSubmission({
      id: "submitted-newer",
      status: "submitted",
      updatedAt: "2026-05-17T09:00:00Z",
    });

    expect(shouldReplaceInScopeWorkspaceSubmission(current, preferred)).toBe(true);
    expect(shouldReplaceInScopeWorkspaceSubmission(preferred, current)).toBe(false);
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
