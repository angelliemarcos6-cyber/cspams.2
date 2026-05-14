import { describe, expect, it } from "vitest";
import {
  resolveActiveWorkspaceVisibleFileDefinitions,
  defaultRequiredSubmissionFileTypesForSchoolType,
  getActiveReportFileTypes,
  getActiveWorkspaceFileTypes,
  getSecondaryHistoricalFileTypes,
  getSubmissionUploadedFileTypes,
  isSubmissionFileUploaded,
  resolveSecondarySubmittedReportFileDefinitions,
  resolveSubmissionPresentationSchoolType,
  resolveSubmittedReportVisibleFileDefinitions,
  resolveSubmissionRequirementProfile,
  resolveVisibleSubmissionFileDefinitions,
} from "@/utils/submissionRequirements";

describe("defaultRequiredSubmissionFileTypesForSchoolType", () => {
  it("returns only core file types for public schools", () => {
    expect(defaultRequiredSubmissionFileTypesForSchoolType("public")).toEqual(["bmef", "smea"]);
  });

  it("returns only private fm-qad file types for private schools", () => {
    const result = defaultRequiredSubmissionFileTypesForSchoolType("private");

    expect(result).toContain("fm_qad_001");
    expect(result).toContain("fm_qad_041");
    expect(result).not.toContain("bmef");
    expect(result).not.toContain("smea");
  });
});

describe("resolveSubmissionRequirementProfile", () => {
  it("returns the public create-school hint for public schools", () => {
    expect(resolveSubmissionRequirementProfile("public").createSchoolHint).toBe(
      "School Head will submit fillable forms, BMEF, and SMEA.",
    );
  });

  it("returns the private create-school hint for private schools", () => {
    expect(resolveSubmissionRequirementProfile("private").createSchoolHint).toBe(
      "School Head will submit fillable forms and the required FM-QAD files.",
    );
  });
});

describe("submission presentation helpers", () => {
  it("prefers top-level schoolType over nested school.type for School Head presentation decisions", () => {
    expect(resolveSubmissionPresentationSchoolType({
      schoolType: "private",
      school: {
        id: "1",
        schoolCode: "123456",
        name: "Sample School",
        type: "public",
      },
    } as never, "public")).toBe("private");
  });

  it("prefers normalized presentation workspace file types over raw completion required file types", () => {
    expect(getActiveWorkspaceFileTypes({
      schoolType: "private",
      completion: {
        hasImetaFormData: false,
        hasBmefFile: false,
        hasSmeaFile: false,
        isComplete: false,
        requiredFileTypes: ["bmef", "smea"],
      },
      presentation: {
        activeWorkspaceFileTypes: ["fm_qad_001", "fm_qad_002"],
      },
    } as never, "private")).toEqual(["fm_qad_001", "fm_qad_002"]);
  });

  it("derives secondary historical file types from uploaded file types only as a fallback", () => {
    expect(getSecondaryHistoricalFileTypes({
      schoolType: "private",
      completion: {
        hasImetaFormData: false,
        hasBmefFile: true,
        hasSmeaFile: false,
        isComplete: false,
        requiredFileTypes: ["fm_qad_001"],
        uploadedFileTypes: ["bmef", "fm_qad_001"],
      },
    } as never, "private")).toEqual(["bmef"]);
  });

  it("derives uploaded file types from raw completion flags and file metadata as a shared fallback", () => {
    expect(getSubmissionUploadedFileTypes({
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
      completion: {
        hasImetaFormData: false,
        hasBmefFile: true,
        hasSmeaFile: false,
        isComplete: false,
        uploadedFileTypes: ["fm_qad_002"],
      },
    } as never)).toEqual(["fm_qad_002", "fm_qad_001", "bmef"]);
  });

  it("uses the shared uploaded-file helper for direct uploaded-state checks", () => {
    expect(isSubmissionFileUploaded({
      completion: {
        hasImetaFormData: false,
        hasBmefFile: false,
        hasSmeaFile: true,
        isComplete: false,
      },
    } as never, "smea")).toBe(true);
  });

  it("prefers normalized report file types over raw required file types", () => {
    expect(getActiveReportFileTypes({
      schoolType: "private",
      completion: {
        hasImetaFormData: false,
        hasBmefFile: false,
        hasSmeaFile: false,
        isComplete: false,
        requiredFileTypes: ["bmef", "smea"],
      },
      presentation: {
        activeReportFileTypes: ["fm_qad_001"],
      },
    } as never, "private")).toEqual(["fm_qad_001"]);
  });
});

describe("resolveVisibleSubmissionFileDefinitions", () => {
  it("shows only private requirement tabs for private schools with no uploads yet", () => {
    const result = resolveVisibleSubmissionFileDefinitions({ schoolType: "private" });

    expect(result.map((definition) => definition.type)).toContain("fm_qad_001");
    expect(result.map((definition) => definition.type)).not.toContain("bmef");
    expect(result.map((definition) => definition.type)).not.toContain("smea");
  });

  it("keeps uploaded file tabs visible even when they are not currently required", () => {
    const result = resolveVisibleSubmissionFileDefinitions({
      schoolType: "private",
      requiredFileTypes: ["fm_qad_001"],
      uploadedFileTypes: ["bmef", "fm_qad_001"],
    });

    expect(result.map((definition) => definition.type)).toEqual(["bmef", "fm_qad_001"]);
  });
});

describe("resolveSubmittedReportVisibleFileDefinitions", () => {
  it("shows only the private requirement set for private-school submitted report cards", () => {
    const result = resolveSubmittedReportVisibleFileDefinitions({
      schoolType: "private",
      requiredFileTypes: ["fm_qad_001", "fm_qad_002"],
    });

    expect(result.map((definition) => definition.type)).toEqual(["fm_qad_001", "fm_qad_002"]);
  });

  it("does not surface legacy uploaded public core files for private-school submitted report cards", () => {
    const result = resolveSubmittedReportVisibleFileDefinitions({
      schoolType: "private",
      requiredFileTypes: ["fm_qad_001"],
    });

    expect(result.map((definition) => definition.type)).not.toContain("bmef");
    expect(result.map((definition) => definition.type)).not.toContain("smea");
  });
});

describe("resolveActiveWorkspaceVisibleFileDefinitions", () => {
  it("prefers the assigned school type over stale submission-derived required file types", () => {
    const result = resolveActiveWorkspaceVisibleFileDefinitions({
      schoolType: "private",
      requiredFileTypes: ["bmef", "smea"],
    });

    expect(result.map((definition) => definition.type)).toContain("fm_qad_001");
    expect(result.map((definition) => definition.type)).not.toContain("bmef");
    expect(result.map((definition) => definition.type)).not.toContain("smea");
  });

  it("shows only the active private requirement set for private-school workspaces", () => {
    const result = resolveActiveWorkspaceVisibleFileDefinitions({
      schoolType: "private",
      requiredFileTypes: ["fm_qad_001", "fm_qad_002"],
    });

    expect(result.map((definition) => definition.type)).toEqual(
      defaultRequiredSubmissionFileTypesForSchoolType("private"),
    );
  });

  it("does not surface legacy uploaded public core files as active private-school workspace tabs", () => {
    const result = resolveActiveWorkspaceVisibleFileDefinitions({
      schoolType: "private",
      requiredFileTypes: ["fm_qad_001"],
    });

    expect(result.map((definition) => definition.type)).not.toContain("bmef");
    expect(result.map((definition) => definition.type)).not.toContain("smea");
  });
});

describe("resolveSecondarySubmittedReportFileDefinitions", () => {
  it("surfaces uploaded legacy public core files as secondary historical files for private schools", () => {
    const result = resolveSecondarySubmittedReportFileDefinitions({
      schoolType: "private",
      requiredFileTypes: ["fm_qad_001"],
      uploadedFileTypes: ["bmef", "smea", "fm_qad_001"],
    });

    expect(result.map((definition) => definition.type)).toEqual(["bmef", "smea"]);
  });

  it("does not include active required private files in the secondary historical list", () => {
    const result = resolveSecondarySubmittedReportFileDefinitions({
      schoolType: "private",
      requiredFileTypes: ["fm_qad_001", "fm_qad_002"],
      uploadedFileTypes: ["fm_qad_001", "fm_qad_002"],
    });

    expect(result).toEqual([]);
  });
});
