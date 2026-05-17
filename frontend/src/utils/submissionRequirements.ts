import {
  SUBMISSION_FILE_DEFINITIONS,
  SUBMISSION_FILE_DEFINITION_BY_TYPE,
  SUBMISSION_FILE_TYPES,
  type SubmissionFileTabDefinition,
} from "@/constants/submissionFiles";
import type {
  IndicatorMetric,
  IndicatorSubmission,
  IndicatorSubmissionFileEntry,
  IndicatorSubmissionFiles,
  IndicatorSubmissionFileType,
  IndicatorSubmissionItem,
} from "@/types";

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
      createSchoolHint: "Private School Head workspace uses FM-QAD uploads only. BMEF and SMEA are not part of the active package.",
    };
  }

  return {
    schoolType: "public",
    requiredFileTypes: SUBMISSION_FILE_TYPES.filter((type) => SUBMISSION_FILE_DEFINITION_BY_TYPE[type].core),
    createSchoolHint: "Public School Head workspace uses BMEF and SMEA as the active package requirements.",
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
  const uploadedTypes = new Set<IndicatorSubmissionFileType>();
  const fileEntries = submission?.files ?? null;

  for (const type of SUBMISSION_FILE_TYPES) {
    if (hasUploadedSubmissionFileEntry(fileEntries?.[type] ?? null)) {
      uploadedTypes.add(type);
    }
  }

  for (const type of submission?.completion?.uploadedFileTypes ?? []) {
    if (!fileEntries || !(type in fileEntries)) {
      uploadedTypes.add(type);
    }
  }

  if (submission?.completion?.hasBmefFile && !fileEntries?.bmef) {
    uploadedTypes.add("bmef");
  }

  if (submission?.completion?.hasSmeaFile && !fileEntries?.smea) {
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

export function buildSubmissionUploadedFileFingerprint(
  submission: Pick<IndicatorSubmission, "files" | "completion"> | null | undefined,
): string {
  return SUBMISSION_FILE_TYPES
    .map((type) => `${type}:${isSubmissionFileUploaded(submission, type) ? 1 : 0}`)
    .join("|");
}

export function resolveExactMetricIdentity(
  indicator: (Pick<IndicatorSubmissionItem, "metric"> & Record<string, unknown>) | null | undefined,
  metricsById: ReadonlyMap<string, IndicatorMetric>,
  metricsByCode: ReadonlyMap<string, IndicatorMetric>,
): IndicatorMetric | null {
  const directMetric = indicator?.metric ?? null;
  const idCandidates = [
    directMetric?.id,
    indicator?.metricId,
    indicator?.metric_id,
    indicator?.performance_metric_id,
  ];

  for (const candidate of idCandidates) {
    const metricId = String(candidate ?? "").trim();
    if (!metricId) {
      continue;
    }

    const exactMetric = metricsById.get(metricId);
    if (exactMetric) {
      return exactMetric;
    }
  }

  const codeCandidates = [
    directMetric?.code,
    indicator?.metricCode,
    indicator?.metric_code,
  ];

  for (const candidate of codeCandidates) {
    const metricCode = String(candidate ?? "").trim();
    if (!metricCode) {
      continue;
    }

    const exactMetric = metricsByCode.get(metricCode);
    if (exactMetric) {
      return exactMetric;
    }
  }

  return null;
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

export function getSubmissionVisibleFiles(
  submission: Pick<IndicatorSubmission, "files"> | null | undefined,
  visibleFileTypes: readonly IndicatorSubmissionFileType[],
): IndicatorSubmissionFiles {
  return visibleFileTypes.reduce<IndicatorSubmissionFiles>((accumulator, type) => {
    const entry = submission?.files?.[type] ?? null;
    if (entry) {
      accumulator[type] = entry;
    }
    return accumulator;
  }, {});
}

export function getActiveReportVisibleFiles(
  submission: Pick<IndicatorSubmission, "files" | "presentation" | "completion" | "schoolType" | "school"> | null | undefined,
  fallbackSchoolType?: string | null,
): IndicatorSubmissionFiles {
  return getSubmissionVisibleFiles(
    submission,
    getActiveReportFileTypes(submission, fallbackSchoolType),
  );
}

export function getSecondaryHistoricalVisibleFiles(
  submission: Pick<IndicatorSubmission, "files" | "presentation" | "completion" | "schoolType" | "school"> | null | undefined,
  fallbackSchoolType?: string | null,
): IndicatorSubmissionFiles {
  return getSubmissionVisibleFiles(
    submission,
    getSecondaryHistoricalFileTypes(submission, fallbackSchoolType),
  );
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
