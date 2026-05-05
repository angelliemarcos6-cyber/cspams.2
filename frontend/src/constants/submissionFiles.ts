import type { IndicatorSubmissionFileType } from "@/types";

export interface SubmissionFileTabDefinition {
  type: IndicatorSubmissionFileType;
  label: string;
  shortLabel: string;
  description: string;
  core: boolean;
}

export const SUBMISSION_FILE_DEFINITIONS: SubmissionFileTabDefinition[] = [
  {
    type: "bmef",
    label: "BMEF",
    shortLabel: "BMEF",
    description: "Basic Education Monitoring and Evaluation Framework report.",
    core: true,
  },
  {
    type: "smea",
    label: "SMEA",
    shortLabel: "SMEA",
    description: "School Monitoring, Evaluation, and Adjustment report.",
    core: true,
  },
  {
    type: "fm_qad_001",
    label: "FM-QAD-001 Qualitative Evaluation Processing Sheet for Establishment of Private School",
    shortLabel: "FM-QAD-001",
    description: "Upload-only section. Accepted formats: PDF, DOCX, XLSX (max 10MB).",
    core: false,
  },
  {
    type: "fm_qad_002",
    label: "FM-QAD-002 Qualitative Evaluation Processing Sheet for Recognition of Private Schools",
    shortLabel: "FM-QAD-002",
    description: "Upload-only section. Accepted formats: PDF, DOCX, XLSX (max 10MB).",
    core: false,
  },
  {
    type: "fm_qad_003",
    label: "FM-QAD-003 Qualitative Evaluation Processing Sheet for Renewal Permit & Government Recognition",
    shortLabel: "FM-QAD-003",
    description: "Upload-only section. Accepted formats: PDF, DOCX, XLSX (max 10MB).",
    core: false,
  },
  {
    type: "fm_qad_004",
    label: "FM-QAD-004 Qualitative Evaluation Processing Sheet for SHS",
    shortLabel: "FM-QAD-004",
    description: "Upload-only section. Accepted formats: PDF, DOCX, XLSX (max 10MB).",
    core: false,
  },
  {
    type: "fm_qad_008",
    label: "FM-QAD-008 Checklist for Application for SPED",
    shortLabel: "FM-QAD-008",
    description: "Upload-only section. Accepted formats: PDF, DOCX, XLSX (max 10MB).",
    core: false,
  },
  {
    type: "fm_qad_009",
    label: "FM-QAD-009 Checklist for Application for the Issuance of Special Order",
    shortLabel: "FM-QAD-009",
    description: "Upload-only section. Accepted formats: PDF, DOCX, XLSX (max 10MB).",
    core: false,
  },
  {
    type: "fm_qad_010",
    label: "FM-QAD-010 Checklist for Application for Tuition Fee Increase",
    shortLabel: "FM-QAD-010",
    description: "Upload-only section. Accepted formats: PDF, DOCX, XLSX (max 10MB).",
    core: false,
  },
  {
    type: "fm_qad_011",
    label: "FM-QAD-011 Processing Sheet for Application for Additional Strand in SHS",
    shortLabel: "FM-QAD-011",
    description: "Upload-only section. Accepted formats: PDF, DOCX, XLSX (max 10MB).",
    core: false,
  },
  {
    type: "fm_qad_034",
    label: "FM-QAD-034 Requirements for the Opening of Science Class",
    shortLabel: "FM-QAD-034",
    description: "Upload-only section. Accepted formats: PDF, DOCX, XLSX (max 10MB).",
    core: false,
  },
  {
    type: "fm_qad_041",
    label: "FM-QAD-041 Request for Confirmation of School Fees",
    shortLabel: "FM-QAD-041",
    description: "Upload-only section. Accepted formats: PDF, DOCX, XLSX (max 10MB).",
    core: false,
  },
];

export const SUBMISSION_FILE_TYPES = SUBMISSION_FILE_DEFINITIONS.map((entry) => entry.type);

export const SUBMISSION_FILE_DEFINITION_BY_TYPE: Record<IndicatorSubmissionFileType, SubmissionFileTabDefinition> =
  SUBMISSION_FILE_DEFINITIONS.reduce((accumulator, definition) => {
    accumulator[definition.type] = definition;
    return accumulator;
  }, {} as Record<IndicatorSubmissionFileType, SubmissionFileTabDefinition>);
