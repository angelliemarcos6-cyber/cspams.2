import {
  SUBMISSION_FILE_DEFINITIONS,
  SUBMISSION_FILE_DEFINITION_BY_TYPE,
  SUBMISSION_FILE_TYPES,
  type SubmissionFileTabDefinition,
} from "@/constants/submissionFiles";
import type { IndicatorSubmission, IndicatorSubmissionFileEntry, IndicatorSubmissionFileType } from "@/types";

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

export function resolveSubmissionPresentationSchoolType(
  submission: Pick<IndicatorSubmission, "schoolType" | "school"> | null | undefined,
  fallbackSchoolType?: string | null,
): string | null {
  return submission?.schoolType
    ?? submission?.school?.type
    ?? fallbackSchoolType
    ?? null;
}

export function resolveSubmissionSchoolId(
  submission: Pick<IndicatorSubmission, "schoolId" | "school"> | null | undefined,
): string {
  return String(submission?.schoolId ?? submission?.school?.id ?? "").trim();
}

export function hasUploadedSubmissionFileEntry(
  entry: Pick<IndicatorSubmissionFileEntry, "uploaded"> | null | undefined,
): boolean {
  return Boolean(entry?.uploaded);
}

export function getSubmissionUploadedFileTypes(
  submission: Pick<IndicatorSubmission, "files" | "completion"> | null | undefined,
): IndicatorSubmissionFileType[] {
  const uploadedTypes = new Set<IndicatorSubmissionFileType>(submission?.completion?.uploadedFileTypes ?? []);

  for (const type of SUBMISSION_FILE_TYPES) {
    if (hasUploadedSubmissionFileEntry(submission?.files?.[type] ?? null)) {
      uploadedTypes.add(type);
    }
  }

  if (submission?.completion?.hasBmefFile) {
    uploadedTypes.add("bmef");
  }

  if (submission?.completion?.hasSmeaFile) {
    uploadedTypes.add("smea");
  }

  return Array.from(uploadedTypes);
}

export function isSubmissionFileUploaded(
  submission: Pick<IndicatorSubmission, "files" | "completion"> | null | undefined,
  type: IndicatorSubmissionFileType,
): boolean {
  return getSubmissionUploadedFileTypes(submission).includes(type);
}

export function getActiveWorkspaceFileTypes(
  submission: Pick<IndicatorSubmission, "presentation" | "completion" | "schoolType" | "school"> | null | undefined,
  fallbackSchoolType?: string | null,
): IndicatorSubmissionFileType[] {
  const schoolType = resolveSubmissionPresentationSchoolType(submission, fallbackSchoolType);

  // School Head package meaning should prefer the normalized presentation contract.
  return submission?.presentation?.activeWorkspaceFileTypes
    ?? submission?.presentation?.activeFileTypes
    ?? submission?.completion?.requiredFileTypes
    ?? defaultRequiredSubmissionFileTypesForSchoolType(schoolType);
}

export function getActiveReportFileTypes(
  submission: Pick<IndicatorSubmission, "presentation" | "completion" | "schoolType" | "school"> | null | undefined,
  fallbackSchoolType?: string | null,
): IndicatorSubmissionFileType[] {
  const schoolType = resolveSubmissionPresentationSchoolType(submission, fallbackSchoolType);

  // Raw completion.requiredFileTypes remains a compatibility fallback only.
  return submission?.presentation?.activeReportFileTypes
    ?? submission?.presentation?.activeFileTypes
    ?? submission?.completion?.requiredFileTypes
    ?? defaultRequiredSubmissionFileTypesForSchoolType(schoolType);
}

export function getSecondaryHistoricalFileTypes(
  submission: Pick<IndicatorSubmission, "presentation" | "completion" | "schoolType" | "school"> | null | undefined,
  fallbackSchoolType?: string | null,
): IndicatorSubmissionFileType[] {
  if (submission?.presentation?.secondaryHistoricalFileTypes) {
    return submission.presentation.secondaryHistoricalFileTypes;
  }

  const activeFileTypes = new Set(getActiveReportFileTypes(submission, fallbackSchoolType));
  const uploadedFileTypes = getSubmissionUploadedFileTypes(submission);

  return uploadedFileTypes.filter((type) => !activeFileTypes.has(type));
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
  const normalizedSchoolType = String(options.schoolType ?? "").trim().toLowerCase();
  const requiredTypes = new Set<IndicatorSubmissionFileType>(
    normalizedSchoolType
      ? defaultRequiredSubmissionFileTypesForSchoolType(normalizedSchoolType)
      : options.requiredFileTypes?.length
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
