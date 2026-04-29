import type { IndicatorSubmissionItem } from "@/types";

const SCHOOL_YEAR_START_MONTH = 6;

export const SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL = "SCHOOL'S ACHIEVEMENTS AND LEARNING OUTCOMES";
export const KEY_PERFORMANCE_CATEGORY_LABEL = "KEY PERFORMANCE INDICATORS";
export const KEY_PERFORMANCE_METRIC_CODES = new Set([
  "NER",
  "RR",
  "DR",
  "TR",
  "NIR",
  "PR",
  "ALS_COMPLETER_PCT",
  "GPI",
  "IQR",
  "CR",
  "CSR",
  "PLM_NEARLY_PROF",
  "PLM_PROF",
  "PLM_HIGH_PROF",
  "AE_PASS_RATE",
  "VIOLENCE_REPORT_RATE",
  "LEARNER_SATISFACTION",
  "RIGHTS_AWARENESS",
  "RBE_MANIFEST",
]);

export const METRIC_LABEL_OVERRIDES: Record<string, string> = {
  IMETA_HEAD_NAME: "NAME OF SCHOOL HEAD",
  IMETA_ENROLL_TOTAL: "TOTAL NUMBER OF ENROLMENT",
  IMETA_SBM_LEVEL: "SBM LEVEL OF PRACTICE",
  PCR_K: "Pupil/Student Classroom Ratio (Kindergarten)",
  PCR_G1_3: "Pupil/Student Classroom Ratio (Grades 1 to 3)",
  PCR_G4_6: "Pupil/Student Classroom Ratio (Grades 4 to 6)",
  PCR_G7_10: "Pupil/Student Classroom Ratio (Grades 7 to 10)",
  PCR_G11_12: "Pupil/Student Classroom Ratio (Grades 11 to 12)",
  WASH_RATIO: "Water and Sanitation facility to pupil ratio",
  COMFORT_ROOMS: "Number of Comfort rooms",
  TOILET_BOWLS: "a. Toilet bowl",
  URINALS: "b. Urinal",
  HANDWASH_FAC: "Handwashing Facilities",
  LEARNING_MAT_RATIO: "Ideal learning materials to learner ratio",
  PSR_OVERALL: "Pupil/student seat ratio",
  PSR_K: "a. Kindergarten",
  PSR_G1_6: "b. Grades 1 - 6",
  PSR_G7_10: "c. Grades 7 - 10",
  PSR_G11_12: "d. Grades 11 - 12",
  ICT_RATIO: "ICT Package/E-classroom package to sections ratio",
  ICT_LAB: "a. ICT Laboratory",
  SCIENCE_LAB: "Science Laboratory",
  INTERNET_ACCESS: "Do you have internet access? (Y/N)",
  ELECTRICITY: "Do you have electricity (Y/N)",
  FENCE_STATUS: "Do you have a complete fence/gate? (Evident/Partially/Not Evident)",
  TEACHERS_TOTAL: "No. of Teachers",
  TEACHERS_MALE: "a. Male",
  TEACHERS_FEMALE: "b. Female",
  TEACHERS_PWD_TOTAL: "Teachers with Physical Disability",
  TEACHERS_PWD_MALE: "a. Male",
  TEACHERS_PWD_FEMALE: "b. Female",
  FUNCTIONAL_SGC: "Functional SGC",
  FEEDING_BENEFICIARIES: "School-Based Feeding Program Beneficiaries",
  CANTEEN_INCOME: "School-Managed Canteen (Annual income)",
  TEACHER_COOP_INCOME: "Teachers Cooperative Managed Canteen - if there is (Annual income)",
  SAFETY_PLAN: "Security and Safety (Contingency Plan)",
  SAFETY_EARTHQUAKE: "a. Earthquake",
  SAFETY_TYPHOON: "b. Typhoon",
  SAFETY_COVID: "c. COVID-19",
  SAFETY_POWER: "d. Power interruption",
  SAFETY_IN_PERSON: "e. In-person classes",
  TEACHERS_PFA: "No. of Teachers trained on Psychological First Aid (PFA)",
  TEACHERS_OCC_FIRST_AID: "No. of Teachers trained on Occupational First Aid",
  NER: "Net Enrollment Rate",
  RR: "Retention Rate",
  DR: "Drop-out Rate",
  TR: "Transition Rate",
  NIR: "Net Intake Rate",
  PR: "Participation Rate",
  ALS_COMPLETER_PCT: "ALS Completion Rate",
  GPI: "Gender Parity Index (GPI)",
  IQR: "Interquartile Ratio",
  CR: "Completion Rate",
  CSR: "Cohort Survival Rate",
  PLM_NEARLY_PROF: "Learning Mastery: Nearly Proficient (50%-74%)",
  PLM_PROF: "Learning Mastery: Proficient (75%-89%)",
  PLM_HIGH_PROF: "Learning Mastery: Highly Proficient (90%-100%)",
  AE_PASS_RATE: "A&E Test Pass Rate",
  VIOLENCE_REPORT_RATE: "Learners Reporting School Violence",
  LEARNER_SATISFACTION: "Learner Satisfaction",
  RIGHTS_AWARENESS: "Learners Aware of Education Rights",
  RBE_MANIFEST: "Schools/LCs Manifesting RBE Indicators",
};

export function schoolYearStartValue(value: string): number | null {
  const match = value.trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end !== start + 1) {
    return null;
  }
  return start;
}

export function deriveSchoolYearLabel(dateInput: string | null | undefined): string {
  const parsed = new Date(dateInput ?? "");
  const now = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const startYear = now.getMonth() + 1 >= SCHOOL_YEAR_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

export function toDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).trim();
}

export function typedYearValues(payload: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const typed = payload as { values?: unknown };
  if (!typed.values || typeof typed.values !== "object") {
    return {};
  }

  const values: Record<string, string> = {};
  for (const [year, value] of Object.entries(typed.values as Record<string, unknown>)) {
    const normalized = toDisplayValue(value);
    if (normalized.length > 0) {
      values[year] = normalized;
    }
  }

  return values;
}

function typedScalarValue(payload: Record<string, unknown> | null | undefined): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const typed = payload as Record<string, unknown>;
  return (
    toDisplayValue(typed.value)
    || toDisplayValue(typed.scalar_value)
    || toDisplayValue(typed.raw_value)
  );
}

function typedCompositeValue(payload: Record<string, unknown> | null | undefined): string {
  const valuesByYear = typedYearValues(payload);
  const sortedYears = sortSchoolYears(Object.keys(valuesByYear));
  if (sortedYears.length === 0) {
    return "";
  }

  if (sortedYears.length === 1) {
    return valuesByYear[sortedYears[0]] ?? "";
  }

  return sortedYears
    .map((year) => {
      const value = valuesByYear[year];
      return value ? `${year}: ${value}` : "";
    })
    .filter((value) => value.length > 0)
    .join("; ");
}

export function resolveSubmissionItemDisplayValue(
  indicator: IndicatorSubmissionItem | null | undefined,
  kind: "target" | "actual",
): string {
  if (!indicator) {
    return "-";
  }

  const typedRaw = kind === "target"
    ? indicator.targetTypedValue
    : indicator.actualTypedValue;
  const displayRaw = kind === "target"
    ? indicator.targetDisplay
    : indicator.actualDisplay;
  const valueRaw = kind === "target"
    ? indicator.targetValue
    : indicator.actualValue;

  const typed = typedRaw && typeof typedRaw === "object"
    ? (typedRaw as Record<string, unknown>)
    : null;

  return (
    toDisplayValue(displayRaw)
    || typedScalarValue(typed)
    || typedCompositeValue(typed)
    || toDisplayValue(valueRaw)
    || "-"
  );
}

export function indicatorCategoryLabel(metricCode: string | null | undefined): string {
  if (metricCode && KEY_PERFORMANCE_METRIC_CODES.has(metricCode)) {
    return KEY_PERFORMANCE_CATEGORY_LABEL;
  }
  return SCHOOL_ACHIEVEMENTS_CATEGORY_LABEL;
}

export function indicatorDisplayLabel(metricCode: string | null | undefined, fallbackName: string): string {
  if (metricCode && METRIC_LABEL_OVERRIDES[metricCode]) {
    return METRIC_LABEL_OVERRIDES[metricCode];
  }
  return fallbackName;
}

export function sortSchoolYears(years: Iterable<string>): string[] {
  return [...new Set(Array.from(years, (year) => year.trim()).filter((year) => year.length > 0))]
    .sort((a, b) => {
      const aStart = schoolYearStartValue(a);
      const bStart = schoolYearStartValue(b);
      if (aStart !== null && bStart !== null) {
        return aStart - bStart;
      }
      if (aStart !== null) return -1;
      if (bStart !== null) return 1;
      return a.localeCompare(b);
    });
}

export function schoolTypeLabel(value: string | null | undefined): string {
  if (!value) return "N/A";
  const normalized = value.toLowerCase();
  if (normalized === "public") return "Public";
  if (normalized === "private") return "Private";
  return value;
}
