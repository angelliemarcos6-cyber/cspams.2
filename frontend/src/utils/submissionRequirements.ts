import {
  SUBMISSION_FILE_DEFINITIONS,
  SUBMISSION_FILE_DEFINITION_BY_TYPE,
  SUBMISSION_FILE_TYPES,
  type SubmissionFileTabDefinition,
} from "@/constants/submissionFiles";
import type { IndicatorSubmissionFileType } from "@/types";

export function defaultRequiredSubmissionFileTypesForSchoolType(
  schoolType: string | null | undefined,
): IndicatorSubmissionFileType[] {
  const normalizedSchoolType = String(schoolType ?? "").trim().toLowerCase();

  if (normalizedSchoolType === "private") {
    return SUBMISSION_FILE_TYPES.filter((type) => !SUBMISSION_FILE_DEFINITION_BY_TYPE[type].core);
  }

  return SUBMISSION_FILE_TYPES.filter((type) => SUBMISSION_FILE_DEFINITION_BY_TYPE[type].core);
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
