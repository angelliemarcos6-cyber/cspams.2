import {
  SUBMISSION_FILE_DEFINITIONS,
  SUBMISSION_FILE_DEFINITION_BY_TYPE,
  SUBMISSION_FILE_TYPES,
  type SubmissionFileTabDefinition,
} from "@/constants/submissionFiles";
import type { IndicatorSubmissionFileType } from "@/types";

export interface SubmissionRequirementProfile {
  schoolType: "public" | "private";
  requiredFileTypes: IndicatorSubmissionFileType[];
  createSchoolHint: string;
}

export function resolveSubmissionRequirementProfile(
  schoolType: string | null | undefined,
): SubmissionRequirementProfile {
  const normalizedSchoolType = String(schoolType ?? "").trim().toLowerCase();

  if (normalizedSchoolType === "private") {
    return {
      schoolType: "private",
      requiredFileTypes: SUBMISSION_FILE_TYPES.filter((type) => !SUBMISSION_FILE_DEFINITION_BY_TYPE[type].core),
      createSchoolHint: "School Head will submit fillable forms and the required FM-QAD files.",
    };
  }

  return {
    schoolType: "public",
    requiredFileTypes: SUBMISSION_FILE_TYPES.filter((type) => SUBMISSION_FILE_DEFINITION_BY_TYPE[type].core),
    createSchoolHint: "School Head will submit fillable forms, BMEF, and SMEA.",
  };
}

export function defaultRequiredSubmissionFileTypesForSchoolType(
  schoolType: string | null | undefined,
): IndicatorSubmissionFileType[] {
  return resolveSubmissionRequirementProfile(schoolType).requiredFileTypes;
}

export function resolveVisibleSubmissionFileDefinitions(options: {
  schoolType?: string | null;
  requiredFileTypes?: IndicatorSubmissionFileType[] | null;
  uploadedFileTypes?: IndicatorSubmissionFileType[] | null;
}): SubmissionFileTabDefinition[] {
  const requiredTypes = new Set<IndicatorSubmissionFileType>(
    options.requiredFileTypes?.length
      ? options.requiredFileTypes
      : defaultRequiredSubmissionFileTypesForSchoolType(options.schoolType),
  );
  const uploadedTypes = new Set<IndicatorSubmissionFileType>(options.uploadedFileTypes ?? []);

  return SUBMISSION_FILE_DEFINITIONS.filter((definition) => (
    requiredTypes.has(definition.type) || uploadedTypes.has(definition.type)
  ));
}

export function resolveSubmittedReportVisibleFileDefinitions(options: {
  schoolType?: string | null;
  requiredFileTypes?: IndicatorSubmissionFileType[] | null;
}): SubmissionFileTabDefinition[] {
  const requiredTypes = new Set<IndicatorSubmissionFileType>(
    options.requiredFileTypes?.length
      ? options.requiredFileTypes
      : defaultRequiredSubmissionFileTypesForSchoolType(options.schoolType),
  );

  return SUBMISSION_FILE_DEFINITIONS.filter((definition) => requiredTypes.has(definition.type));
}

export function resolveActiveWorkspaceVisibleFileDefinitions(options: {
  schoolType?: string | null;
  requiredFileTypes?: IndicatorSubmissionFileType[] | null;
}): SubmissionFileTabDefinition[] {
  const requiredTypes = new Set<IndicatorSubmissionFileType>(
    options.requiredFileTypes?.length
      ? options.requiredFileTypes
      : defaultRequiredSubmissionFileTypesForSchoolType(options.schoolType),
  );

  return SUBMISSION_FILE_DEFINITIONS.filter((definition) => requiredTypes.has(definition.type));
}

export function resolveSecondarySubmittedReportFileDefinitions(options: {
  schoolType?: string | null;
  requiredFileTypes?: IndicatorSubmissionFileType[] | null;
  uploadedFileTypes?: IndicatorSubmissionFileType[] | null;
}): SubmissionFileTabDefinition[] {
  const requiredTypes = new Set<IndicatorSubmissionFileType>(
    options.requiredFileTypes?.length
      ? options.requiredFileTypes
      : defaultRequiredSubmissionFileTypesForSchoolType(options.schoolType),
  );
  const uploadedTypes = new Set<IndicatorSubmissionFileType>(options.uploadedFileTypes ?? []);

  return SUBMISSION_FILE_DEFINITIONS.filter((definition) => (
    uploadedTypes.has(definition.type) && !requiredTypes.has(definition.type)
  ));
}
