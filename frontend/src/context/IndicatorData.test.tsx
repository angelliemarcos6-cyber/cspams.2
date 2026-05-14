import { describe, expect, it } from "vitest";
import {
  buildIndicatorDataSessionKey,
  materializeSubmissionFromLightweightPayload,
} from "@/context/IndicatorData";

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

describe("materializeSubmissionFromLightweightPayload", () => {
  it("preserves lightweight file metadata for uploaded fm-qad files", () => {
    const submission = materializeSubmissionFromLightweightPayload({
      id: "sub-1",
      schoolId: "school-1",
      schoolType: "private",
      academicYearId: "ay-1",
      reportingPeriod: "ANNUAL",
      status: "draft",
      version: 2,
      notes: null,
      submittedAt: null,
      reviewedAt: null,
      updatedAt: "2026-05-14T08:00:00.000Z",
      completion: {
        hasImetaFormData: true,
        hasBmefFile: false,
        hasSmeaFile: false,
        isComplete: false,
        requiredFileTypes: ["fm_qad_001"],
        uploadedFileTypes: ["fm_qad_001"],
        missingFileTypes: [],
      },
      files: {
        fm_qad_001: {
          type: "fm_qad_001",
          uploaded: true,
          path: null,
          originalFilename: "fm-qad-001.pdf",
          sizeBytes: 2048,
          uploadedAt: "2026-05-14T08:00:00.000Z",
          downloadUrl: "/api/submissions/sub-1/download/fm_qad_001",
          viewUrl: "/api/submissions/sub-1/view/fm_qad_001",
        },
      },
      academicYear: {
        id: "ay-1",
        name: "2025-2026",
      },
    });

    const file = submission.files?.fm_qad_001;

    expect(submission.schoolType).toBe("private");
    expect(submission.presentation?.activeWorkspaceFileTypes).toEqual(["fm_qad_001"]);
    expect(submission.presentation?.secondaryHistoricalFileTypes).toEqual([]);
    expect(file).toBeDefined();
    expect(file?.originalFilename).toBe("fm-qad-001.pdf");
    expect(file?.sizeBytes).toBe(2048);
    expect(file?.uploadedAt).toBe("2026-05-14T08:00:00.000Z");
    expect(file?.path).toBeNull();
  });
});
