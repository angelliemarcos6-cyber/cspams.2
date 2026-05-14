import { describe, expect, it } from "vitest";
import {
  defaultRequiredSubmissionFileTypesForSchoolType,
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
