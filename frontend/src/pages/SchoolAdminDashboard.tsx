import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CircleHelp,
  ClipboardList,
  Database,
  Download,
  Eye,
  LayoutDashboard,
  RefreshCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { DashboardHelpDialog } from "@/components/DashboardHelpDialog";
import { Shell } from "@/components/Shell";
import { SchoolIndicatorPanel } from "@/components/indicators/SchoolIndicatorPanel";
import { useAuth } from "@/context/Auth";
import { useData } from "@/context/Data";
import { useIndicatorData } from "@/context/IndicatorData";
import { COOKIE_SESSION_TOKEN, getApiBaseUrl } from "@/lib/api";
import { runRefreshBatches } from "@/lib/runRefreshBatches";
import { resolveSubmissionItemDisplayValue } from "@/pages/monitor/monitorDrawerViewModelUtils";
import type {
  IndicatorSubmission,
  IndicatorSubmissionFileEntry,
  IndicatorSubmissionFileType,
  IndicatorSubmissionItem,
} from "@/types";

/* ── Quick-jump targets ── */
/* ── Helpers ── */
function latestSubmission<T extends { updatedAt: string | null; createdAt: string | null }>(entries: T[]): T | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => {
    const aDate = new Date((a as { submittedAt?: string | null }).submittedAt ?? a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bDate = new Date((b as { submittedAt?: string | null }).submittedAt ?? b.updatedAt ?? b.createdAt ?? 0).getTime();
    return bDate - aDate;
  });
  return sorted[0] ?? null;
}

function submissionRecencyScore(submission: IndicatorSubmission): number {
  const timestamp = new Date(submission.updatedAt ?? submission.submittedAt ?? submission.createdAt ?? 0).getTime();
  const version = Number(submission.version ?? 0);
  return (Number.isFinite(timestamp) ? timestamp : 0) * 1_000 + (Number.isFinite(version) ? version : 0);
}

export function resolvePreferredSubmittedReportAcademicYearId(
  entries: IndicatorSubmission[],
  selectedSchoolId: string,
): string | null {
  const finalizedEntries = entries
    .filter((entry) => isFinalizedSubmissionStatus(entry.status))
    .filter((entry) => (
      selectedSchoolId.length === 0
      || String(entry.school?.id ?? "") === selectedSchoolId
    ))
    .slice()
    .sort((left, right) => submissionRecencyScore(right) - submissionRecencyScore(left));

  return finalizedEntries[0]?.academicYear?.id ?? null;
}

export function resolveSelectedYearReportSubmission(entries: IndicatorSubmission[]): IndicatorSubmission | null {
  const finalizedEntries = entries.filter((entry) => isFinalizedSubmissionStatus(entry.status));
  if (finalizedEntries.length === 0) {
    return null;
  }

  const priorityByStatus: Record<string, number> = {
    submitted: 0,
    validated: 1,
  };

  const ranked = finalizedEntries
    .slice()
    .sort((left, right) => {
      const freshnessDelta = submissionRecencyScore(right) - submissionRecencyScore(left);
      if (freshnessDelta !== 0) {
        return freshnessDelta;
      }

      const leftStatus = String(left.status ?? "").trim().toLowerCase();
      const rightStatus = String(right.status ?? "").trim().toLowerCase();
      const leftRank = priorityByStatus[leftStatus] ?? Number.MAX_SAFE_INTEGER;
      const rightRank = priorityByStatus[rightStatus] ?? Number.MAX_SAFE_INTEGER;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return (
        new Date(right.submittedAt ?? right.updatedAt ?? right.createdAt ?? 0).getTime()
        - new Date(left.submittedAt ?? left.updatedAt ?? left.createdAt ?? 0).getTime()
      );
    });

  return ranked[0] ?? null;
}

function normalizeFileExtension(filename: string | null | undefined): string {
  const value = String(filename ?? "").trim().toLowerCase();
  if (!value.includes(".")) return "";
  return value.slice(value.lastIndexOf(".") + 1);
}

function normalizeMetricLookupKey(label: string | null | undefined): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isFinalizedSubmissionStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "submitted" || normalized === "validated";
}

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : "-";
  }

  return String(value);
}

function submissionRows(submission: IndicatorSubmission | null | undefined): IndicatorSubmissionItem[] {
  if (!submission) {
    return [];
  }

  const directIndicators = Array.isArray(submission.indicators) ? submission.indicators : [];
  if (directIndicators.length > 0) {
    return directIndicators;
  }

  return Array.isArray(submission.items) ? submission.items : [];
}

function submissionHasRenderableIndicatorDetails(submission: IndicatorSubmission | null | undefined): boolean {
  return submissionRows(submission).some((item) => {
    const metricCode = String(item.metric?.code ?? "").trim();
    const metricName = String(item.metric?.name ?? "").trim();
    return metricCode.length > 0 || metricName.length > 0;
  });
}

function buildSubmissionRefreshFingerprint(submission: IndicatorSubmission | null | undefined): string {
  if (!submission?.id) {
    return "";
  }

  return [
    submission.id,
    submission.status ?? "",
    submission.version ?? "",
    submission.updatedAt ?? "",
    submission.submittedAt ?? "",
  ].join(":");
}

function resolveIndicatorValue(
  indicator: IndicatorSubmissionItem | null | undefined,
  kind: "target" | "actual",
): string {
  return resolveSubmissionItemDisplayValue(indicator, kind);
}

function selectedYearLabel(
  yearId: string,
  years: Array<{ id: string; name: string }>,
  fallback: string,
): string {
  if (!yearId || yearId === "all") {
    return fallback;
  }

  return years.find((year) => year.id === yearId)?.name ?? fallback;
}

function academicYearStartValue(value: string | null | undefined): number | null {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (!match) {
    return null;
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end !== start + 1) {
    return null;
  }

  return start;
}

function compareAcademicYearsAscending(a: { name: string }, b: { name: string }): number {
  const aStart = academicYearStartValue(a.name);
  const bStart = academicYearStartValue(b.name);

  if (aStart !== null && bStart !== null) {
    return aStart - bStart;
  }
  if (aStart !== null) {
    return -1;
  }
  if (bStart !== null) {
    return 1;
  }

  return String(a.name).localeCompare(String(b.name));
}

function buildSelectedYearLoadKey(schoolId: string, academicYearId: string): string {
  return `${schoolId}:${academicYearId}`;
}

const MOBILE_BREAKPOINT = 768;
const SCHOOL_ACHIEVEMENT_ROWS = [
  { key: "school_head_name", label: "NAME OF SCHOOL HEAD" },
  { key: "total_enrolment", label: "TOTAL NUMBER OF ENROLMENT" },
  { key: "sbm_level_of_practice", label: "SBM LEVEL OF PRACTICE" },
  { key: "classroom_ratio_kindergarten", label: "Pupil/Student Classroom Ratio (Kindergarten)" },
  { key: "classroom_ratio_grades_1_3", label: "Pupil/Student Classroom Ratio (Grades 1 to 3)" },
  { key: "classroom_ratio_grades_4_6", label: "Pupil/Student Classroom Ratio (Grades 4 to 6)" },
  { key: "classroom_ratio_grades_7_10", label: "Pupil/Student Classroom Ratio (Grades 7 to 10)" },
  { key: "classroom_ratio_grades_11_12", label: "Pupil/Student Classroom Ratio (Grades 11 to 12)" },
  { key: "water_sanitation_ratio", label: "Water and Sanitation facility to pupil ratio" },
  { key: "comfort_rooms", label: "Number of Comfort rooms" },
  { key: "comfort_rooms_toilet_bowl", label: "a. Toilet bowl" },
  { key: "comfort_rooms_urinal", label: "b. Urinal" },
  { key: "handwashing_facilities", label: "Handwashing Facilities" },
  { key: "learning_material_ratio", label: "Ideal learning materials to learner ratio" },
  { key: "seat_ratio_overall", label: "Pupil/student seat ratio (Overall)" },
  { key: "seat_ratio_kindergarten", label: "a. Kindergarten" },
  { key: "seat_ratio_grades_1_6", label: "b. Grades 1 - 6" },
  { key: "seat_ratio_grades_7_10", label: "c. Grades 7 - 10" },
  { key: "seat_ratio_grades_11_12", label: "d. Grades 11 - 12" },
  { key: "ict_package_ratio", label: "ICT Package/E-classroom package to sections ratio" },
  { key: "ict_laboratory", label: "a. ICT Laboratory" },
  { key: "science_laboratory", label: "Science Laboratory" },
  { key: "internet_access", label: "Do you have internet access? (Y/N)" },
  { key: "electricity_access", label: "Do you have electricity (Y/N)" },
  { key: "complete_fence_gate", label: "Do you have a complete fence/gate? (Evident/Partially/Not Evident)" },
  { key: "teachers_total", label: "No. of Teachers" },
  { key: "teachers_male", label: "a. Male" },
  { key: "teachers_female", label: "b. Female" },
  { key: "teachers_with_disability", label: "Teachers with Physical Disability" },
  { key: "teachers_with_disability_male", label: "a. Male" },
  { key: "teachers_with_disability_female", label: "b. Female" },
  { key: "functional_sgc", label: "Functional SGC" },
  { key: "feeding_program_beneficiaries", label: "School-Based Feeding Program Beneficiaries" },
  { key: "canteen_income", label: "School-Managed Canteen (Annual income)" },
  { key: "teachers_coop_canteen_income", label: "Teachers Cooperative Managed Canteen - if there is (Annual income)" },
  { key: "security_safety_plan", label: "Security and Safety (Contingency Plan)" },
  { key: "security_safety_earthquake", label: "a. Earthquake" },
  { key: "security_safety_typhoon", label: "b. Typhoon" },
  { key: "security_safety_covid", label: "c. COVID-19" },
  { key: "security_safety_power_interruption", label: "d. Power interruption" },
  { key: "security_safety_in_person", label: "e. In-person classes" },
  { key: "teachers_trained_pfa", label: "No. of Teachers trained on Psychological First Aid (PFA)" },
  { key: "teachers_trained_occ_first_aid", label: "No. of Teachers trained on Occupational First Aid" },
] as const;

const KPI_ROWS = [
  { key: "net_enrollment_rate", label: "Net Enrollment Rate (NER)" },
  { key: "retention_rate", label: "Retention Rate (RR)" },
  { key: "dropout_rate", label: "Drop-out Rate (DR)" },
  { key: "transition_rate", label: "Transition Rate (TR)" },
  { key: "net_intake_rate", label: "Net Intake Rate (NIR)" },
  { key: "participation_rate", label: "Participation Rate (PR)" },
  { key: "als_completion_rate", label: "ALS Completion Rate" },
  { key: "gender_parity_index", label: "Gender Parity Index (GPI)" },
  { key: "interquartile_ratio", label: "Interquartile Ratio (IQR)" },
  { key: "completion_rate", label: "Completion Rate (CR)" },
  { key: "cohort_survival_rate", label: "Cohort Survival Rate (CSR)" },
  { key: "learning_mastery_nearly_proficient", label: "Learning Mastery: Nearly Proficient" },
  { key: "learning_mastery_proficient", label: "Learning Mastery: Proficient" },
  { key: "learning_mastery_highly_proficient", label: "Learning Mastery: Highly Proficient" },
  { key: "ae_test_pass_rate", label: "A&E Test Pass Rate" },
  { key: "learners_reporting_school_violence", label: "Learners Reporting School Violence" },
  { key: "learner_satisfaction", label: "Learner Satisfaction" },
  { key: "learners_aware_of_education_rights", label: "Learners Aware of Education Rights" },
  { key: "schools_manifesting_rbe_indicators", label: "Schools/LCs Manifesting RBE Indicators" },
] as const;

const GROUP_A_METRIC_KEYS = {
  schoolAchievement: {
    school_head_name: ["name of school head"],
    total_enrolment: ["total number of enrolment", "total number of enrollment"],
    sbm_level_of_practice: ["sbm level of practice", "sbm level"],
    classroom_ratio_kindergarten: ["pupil student classroom ratio kindergarten"],
    classroom_ratio_grades_1_3: ["pupil student classroom ratio grades 1 to 3"],
    classroom_ratio_grades_4_6: ["pupil student classroom ratio grades 4 to 6"],
    classroom_ratio_grades_7_10: ["pupil student classroom ratio grades 7 to 10"],
    classroom_ratio_grades_11_12: ["pupil student classroom ratio grades 11 to 12"],
    water_sanitation_ratio: ["water and sanitation facility to pupil ratio"],
    comfort_rooms: ["number of comfort rooms"],
    comfort_rooms_toilet_bowl: ["a toilet bowl", "number of comfort rooms toilet bowl", "comfort rooms toilet bowl"],
    comfort_rooms_urinal: ["b urinal", "number of comfort rooms urinal", "comfort rooms urinal"],
    handwashing_facilities: ["handwashing facilities"],
    learning_material_ratio: ["ideal learning materials to learner ratio"],
    seat_ratio_overall: ["pupil student seat ratio overall"],
    seat_ratio_kindergarten: ["a kindergarten", "pupil student seat ratio kindergarten", "seat ratio kindergarten"],
    seat_ratio_grades_1_6: ["b grades 1 6", "pupil student seat ratio grades 1 6", "seat ratio grades 1 6"],
    seat_ratio_grades_7_10: ["c grades 7 10", "pupil student seat ratio grades 7 10", "seat ratio grades 7 10"],
    seat_ratio_grades_11_12: ["d grades 11 12", "pupil student seat ratio grades 11 12", "seat ratio grades 11 12"],
    ict_package_ratio: ["ict package e classroom package to sections ratio", "ict package classroom package to sections ratio"],
    ict_laboratory: ["a ict laboratory", "ict package e classroom package ict laboratory", "ict laboratory"],
    science_laboratory: ["science laboratory"],
    internet_access: ["do you have internet access y n", "do you have internet access"],
    electricity_access: ["do you have electricity y n", "do you have electricity"],
    complete_fence_gate: ["do you have a complete fence gate evident partially not evident", "complete fence gate"],
    teachers_total: ["no of teachers", "number of teachers"],
    teachers_male: ["no of teachers male", "number of teachers male", "teachers male", "a male"],
    teachers_female: ["no of teachers female", "number of teachers female", "teachers female", "b female"],
    teachers_with_disability: ["teachers with physical disability"],
    teachers_with_disability_male: ["teachers with physical disability male", "teachers pwd male", "physical disability male", "a male"],
    teachers_with_disability_female: ["teachers with physical disability female", "teachers pwd female", "physical disability female", "b female"],
    functional_sgc: ["functional sgc"],
    feeding_program_beneficiaries: ["school based feeding program beneficiaries"],
    canteen_income: ["school managed canteen annual income", "school managed canteen"],
    teachers_coop_canteen_income: ["teachers cooperative managed canteen if there is annual income", "teachers cooperative managed canteen annual income"],
    security_safety_plan: ["security and safety contingency plan"],
    security_safety_earthquake: ["security and safety contingency plan earthquake", "a earthquake", "earthquake"],
    security_safety_typhoon: ["security and safety contingency plan typhoon", "b typhoon", "typhoon"],
    security_safety_covid: ["security and safety contingency plan covid 19", "c covid 19", "covid 19"],
    security_safety_power_interruption: ["security and safety contingency plan power interruption", "d power interruption", "power interruption"],
    security_safety_in_person: ["security and safety contingency plan in person classes", "e in person classes", "in person classes"],
    teachers_trained_pfa: ["no of teachers trained on psychological first aid pfa", "teachers trained on psychological first aid pfa"],
    teachers_trained_occ_first_aid: ["no of teachers trained on occupational first aid", "teachers trained on occupational first aid"],
  },
  kpi: {
    net_enrollment_rate: ["net enrollment rate ner", "net enrollment rate"],
    retention_rate: ["retention rate rr", "retention rate"],
    dropout_rate: ["drop out rate dr", "dropout rate dr", "drop out rate", "dropout rate"],
    transition_rate: ["transition rate tr", "transition rate"],
    net_intake_rate: ["net intake rate nir", "net intake rate"],
    participation_rate: ["participation rate pr", "participation rate"],
    als_completion_rate: ["als completion rate"],
    gender_parity_index: ["gender parity index gpi", "gender parity index"],
    interquartile_ratio: ["interquartile ratio iqr", "interquartile ratio"],
    completion_rate: ["completion rate cr", "completion rate"],
    cohort_survival_rate: ["cohort survival rate csr", "cohort survival rate"],
    learning_mastery_nearly_proficient: ["learning mastery nearly proficient"],
    learning_mastery_proficient: ["learning mastery proficient"],
    learning_mastery_highly_proficient: ["learning mastery highly proficient"],
    ae_test_pass_rate: ["a e test pass rate", "ae test pass rate"],
    learners_reporting_school_violence: ["learners reporting school violence"],
    learner_satisfaction: ["learner satisfaction"],
    learners_aware_of_education_rights: ["learners aware of education rights"],
    schools_manifesting_rbe_indicators: ["schools lcs manifesting rbe indicators", "schools manifesting rbe indicators"],
  },
} as const;

const GROUP_A_METRIC_CODES = {
  schoolAchievement: {
    school_head_name: "IMETA_HEAD_NAME",
    total_enrolment: "IMETA_ENROLL_TOTAL",
    sbm_level_of_practice: "IMETA_SBM_LEVEL",
    classroom_ratio_kindergarten: "PCR_K",
    classroom_ratio_grades_1_3: "PCR_G1_3",
    classroom_ratio_grades_4_6: "PCR_G4_6",
    classroom_ratio_grades_7_10: "PCR_G7_10",
    classroom_ratio_grades_11_12: "PCR_G11_12",
    water_sanitation_ratio: "WASH_RATIO",
    comfort_rooms: "COMFORT_ROOMS",
    comfort_rooms_toilet_bowl: "TOILET_BOWLS",
    comfort_rooms_urinal: "URINALS",
    handwashing_facilities: "HANDWASH_FAC",
    learning_material_ratio: "LEARNING_MAT_RATIO",
    seat_ratio_overall: "PSR_OVERALL",
    seat_ratio_kindergarten: "PSR_K",
    seat_ratio_grades_1_6: "PSR_G1_6",
    seat_ratio_grades_7_10: "PSR_G7_10",
    seat_ratio_grades_11_12: "PSR_G11_12",
    ict_package_ratio: "ICT_RATIO",
    ict_laboratory: "ICT_LAB",
    science_laboratory: "SCIENCE_LAB",
    internet_access: "INTERNET_ACCESS",
    electricity_access: "ELECTRICITY",
    complete_fence_gate: "FENCE_STATUS",
    teachers_total: "TEACHERS_TOTAL",
    teachers_male: "TEACHERS_MALE",
    teachers_female: "TEACHERS_FEMALE",
    teachers_with_disability: "TEACHERS_PWD_TOTAL",
    teachers_with_disability_male: "TEACHERS_PWD_MALE",
    teachers_with_disability_female: "TEACHERS_PWD_FEMALE",
    functional_sgc: "FUNCTIONAL_SGC",
    feeding_program_beneficiaries: "FEEDING_BENEFICIARIES",
    canteen_income: "CANTEEN_INCOME",
    teachers_coop_canteen_income: "TEACHER_COOP_INCOME",
    security_safety_plan: "SAFETY_PLAN",
    security_safety_earthquake: "SAFETY_EARTHQUAKE",
    security_safety_typhoon: "SAFETY_TYPHOON",
    security_safety_covid: "SAFETY_COVID",
    security_safety_power_interruption: "SAFETY_POWER",
    security_safety_in_person: "SAFETY_IN_PERSON",
    teachers_trained_pfa: "TEACHERS_PFA",
    teachers_trained_occ_first_aid: "TEACHERS_OCC_FIRST_AID",
  },
  kpi: {
    net_enrollment_rate: "NER",
    retention_rate: "RR",
    dropout_rate: "DR",
    transition_rate: "TR",
    net_intake_rate: "NIR",
    participation_rate: "PR",
    als_completion_rate: "ALS_COMPLETER_PCT",
    gender_parity_index: "GPI",
    interquartile_ratio: "IQR",
    completion_rate: "CR",
    cohort_survival_rate: "CSR",
    learning_mastery_nearly_proficient: "PLM_NEARLY_PROF",
    learning_mastery_proficient: "PLM_PROF",
    learning_mastery_highly_proficient: "PLM_HIGH_PROF",
    ae_test_pass_rate: "AE_PASS_RATE",
    learners_reporting_school_violence: "VIOLENCE_REPORT_RATE",
    learner_satisfaction: "LEARNER_SATISFACTION",
    learners_aware_of_education_rights: "RIGHTS_AWARENESS",
    schools_manifesting_rbe_indicators: "RBE_MANIFEST",
  },
} as const;

const GROUP_A_NORMALIZED_METRIC_CODES = {
  schoolAchievement: Object.fromEntries(
    Object.entries(GROUP_A_METRIC_CODES.schoolAchievement).map(([key, code]) => [
      key,
      normalizeMetricLookupKey(code),
    ]),
  ) as Record<keyof typeof GROUP_A_METRIC_CODES.schoolAchievement, string>,
  kpi: Object.fromEntries(
    Object.entries(GROUP_A_METRIC_CODES.kpi).map(([key, code]) => [
      key,
      normalizeMetricLookupKey(code),
    ]),
  ) as Record<keyof typeof GROUP_A_METRIC_CODES.kpi, string>,
};

const GROUP_A_NORMALIZED_METRIC_ALIASES = {
  schoolAchievement: Object.fromEntries(
    Object.entries(GROUP_A_METRIC_KEYS.schoolAchievement).map(([key, aliases]) => [
      key,
      aliases.map((alias) => normalizeMetricLookupKey(alias)),
    ]),
  ) as Record<keyof typeof GROUP_A_METRIC_KEYS.schoolAchievement, string[]>,
  kpi: Object.fromEntries(
    Object.entries(GROUP_A_METRIC_KEYS.kpi).map(([key, aliases]) => [
      key,
      aliases.map((alias) => normalizeMetricLookupKey(alias)),
    ]),
  ) as Record<keyof typeof GROUP_A_METRIC_KEYS.kpi, string[]>,
};

function isSubItemMetric(label: string): boolean {
  return /^[a-e]\.\s/i.test(label);
}

/* ── Component ── */
export function SchoolAdminDashboard() {
  const { user, apiToken } = useAuth();
  const { records, error, lastSyncedAt, syncScope, syncStatus, refreshRecords } = useData();
  const {
    submissions: submissionSnapshot,
    allSubmissions,
    academicYears,
    downloadSubmissionFile,
    fetchSubmission,
    loadSubmissionsForYear,
    refreshSubmissions,
  } = useIndicatorData();

  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [dashboardViewAcademicYearId, setDashboardViewAcademicYearId] = useState("");
  const [dashboardViewSubmissions, setDashboardViewSubmissions] = useState<IndicatorSubmission[]>([]);
  const [isDashboardYearSwitching, setIsDashboardYearSwitching] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [activeReportModalType, setActiveReportModalType] = useState<IndicatorSubmissionFileType | null>(null);
  const [reportZoomLevel, setReportZoomLevel] = useState(1);
  const [hydratedSubmittedReportSubmission, setHydratedSubmittedReportSubmission] = useState<IndicatorSubmission | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < MOBILE_BREAKPOINT,
  );
  const initialLoadStartedRef = useRef(false);
  const initialAcademicYearAppliedRef = useRef(false);
  const finalizedSubmissionRefreshRef = useRef("");
  const lastLoadedYearKeyRef = useRef("");

  /* ── Derived data ── */
  const orderedAcademicYears = useMemo(
    () => [...academicYears].sort(compareAcademicYearsAscending),
    [academicYears],
  );

  const assignedRecord = records[0] ?? null;
  const schoolName = assignedRecord?.schoolName || user?.schoolName || "Unassigned School";
  const schoolCode = assignedRecord?.schoolCode || user?.schoolCode || "N/A";
  const schoolRegion = assignedRecord?.region || "N/A";
  const selectedSchoolId = String(user?.schoolId ?? "").trim();

  const currentAcademicYearOption = useMemo(
    () => orderedAcademicYears.find((y) => y.isCurrent) ?? orderedAcademicYears[0] ?? null,
    [orderedAcademicYears],
  );
  const effectiveAcademicYearId = dashboardViewAcademicYearId;
  const indicatorSubmissions = useMemo(
    () => (allSubmissions.length > 0 || submissionSnapshot.length === 0 ? allSubmissions : submissionSnapshot),
    [allSubmissions, submissionSnapshot],
  );
  const preferredSubmittedReportAcademicYearId = useMemo(
    () => resolvePreferredSubmittedReportAcademicYearId(indicatorSubmissions, selectedSchoolId),
    [indicatorSubmissions, selectedSchoolId],
  );
  const submissionsForSelectedContext = useMemo(() => {
    if (effectiveAcademicYearId && effectiveAcademicYearId !== "all") {
      return dashboardViewSubmissions;
    }

    return indicatorSubmissions;
  }, [dashboardViewSubmissions, effectiveAcademicYearId, indicatorSubmissions]);
  const groupASubmittedSubmission = useMemo(
    () => resolveSelectedYearReportSubmission(submissionsForSelectedContext),
    [submissionsForSelectedContext],
  );
  const isYearScopedLoading = isDashboardYearSwitching;

  useEffect(() => {
    if (!groupASubmittedSubmission?.id) {
      finalizedSubmissionRefreshRef.current = "";
      setHydratedSubmittedReportSubmission(null);
      return;
    }

    setHydratedSubmittedReportSubmission((current) => (
      current?.id === groupASubmittedSubmission.id
        ? { ...current, ...groupASubmittedSubmission, indicators: current.indicators, items: current.items }
        : groupASubmittedSubmission
    ));

    const refreshFingerprint = buildSubmissionRefreshFingerprint(groupASubmittedSubmission);
    let cancelled = false;
    const submissionId = groupASubmittedSubmission.id;

    if (finalizedSubmissionRefreshRef.current === refreshFingerprint) {
      return () => {
        cancelled = true;
      };
    }

    finalizedSubmissionRefreshRef.current = refreshFingerprint;
    void fetchSubmission(submissionId)
      .then((submission) => {
        if (!cancelled && submission.id === submissionId) {
          setHydratedSubmittedReportSubmission(submission);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [fetchSubmission, groupASubmittedSubmission]);
  const groupAReportView = useMemo(() => {
    const submission = (
      hydratedSubmittedReportSubmission?.id === groupASubmittedSubmission?.id
        ? hydratedSubmittedReportSubmission
        : groupASubmittedSubmission
    ) ?? null;
    const indicators = submissionRows(submission);
    const missingMappings: Array<{
      group: keyof typeof GROUP_A_METRIC_KEYS;
      key: string;
      metricCode: string | null;
      aliases: readonly string[];
      fallbackAttempted: boolean;
    }> = [];
    const aliasFallbackMatches: Array<{
      group: keyof typeof GROUP_A_METRIC_KEYS;
      key: string;
      metricCode: string | null;
      matchedAlias: string;
      matchedMetricName: string | null;
      matchedMetricCode: string | null;
      usedFallback: true;
    }> = [];
    let resolvedByMetricCodeCount = 0;
    const duplicateMetricCodes = new Set<string>();
    const duplicateMetricNames = new Set<string>();
    const indicatorByMetricCode = new Map<string, IndicatorSubmissionItem>();
    const indicatorByNormalizedName = new Map<string, IndicatorSubmissionItem>();

    for (const item of indicators) {
      const normalizedMetricCode = normalizeMetricLookupKey(item.metric?.code);
      if (normalizedMetricCode) {
        if (indicatorByMetricCode.has(normalizedMetricCode)) {
          duplicateMetricCodes.add(normalizedMetricCode);
        } else {
          indicatorByMetricCode.set(normalizedMetricCode, item);
        }
      }

      const normalizedMetricName = normalizeMetricLookupKey(item.metric?.name);
      if (normalizedMetricName) {
        if (indicatorByNormalizedName.has(normalizedMetricName)) {
          duplicateMetricNames.add(normalizedMetricName);
        } else {
          indicatorByNormalizedName.set(normalizedMetricName, item);
        }
      }
    }

    const availableMetricCodes = Array.from(indicatorByMetricCode.keys()).sort();
    const availableMetricNames = Array.from(indicatorByNormalizedName.keys()).sort();
    const getIndicatorByGroupAKey = (
      group: keyof typeof GROUP_A_METRIC_KEYS,
      key: string,
    ): IndicatorSubmissionItem | null => {
      const groupCodeMappings: Record<string, string> =
        group === "schoolAchievement"
          ? GROUP_A_NORMALIZED_METRIC_CODES.schoolAchievement
          : GROUP_A_NORMALIZED_METRIC_CODES.kpi;
      const groupAliasMappings: Record<string, readonly string[]> =
        group === "schoolAchievement"
          ? GROUP_A_NORMALIZED_METRIC_ALIASES.schoolAchievement
          : GROUP_A_NORMALIZED_METRIC_ALIASES.kpi;
      const metricCode = groupCodeMappings[key];
      const aliases = groupAliasMappings[key];
      if (metricCode) {
        const codeMatch = indicatorByMetricCode.get(metricCode);
        if (codeMatch) {
          resolvedByMetricCodeCount += 1;
          return codeMatch;
        }
      }

      if (!aliases) {
        missingMappings.push({
          group,
          key,
          metricCode: metricCode ?? null,
          aliases: [],
          fallbackAttempted: false,
        });
        return null;
      }

      for (const alias of aliases) {
        const match = indicatorByNormalizedName.get(alias);
        if (match) {
          aliasFallbackMatches.push({
            group,
            key,
            metricCode: metricCode ?? null,
            matchedAlias: alias,
            matchedMetricName: match.metric?.name ?? null,
            matchedMetricCode: match.metric?.code ?? null,
            usedFallback: true,
          });
          return match;
        }
      }

      missingMappings.push({
        group,
        key,
        metricCode: metricCode ?? null,
        aliases,
        fallbackAttempted: true,
      });
      return null;
    };
    const schoolAchievementRows = SCHOOL_ACHIEVEMENT_ROWS.map((row) => {
      const indicator = getIndicatorByGroupAKey("schoolAchievement", row.key);
      return {
        key: row.key,
        label: row.label,
        indicator,
        value: resolveIndicatorValue(indicator, "actual"),
      };
    });
    const kpiRows = KPI_ROWS.map((row) => {
      const indicator = getIndicatorByGroupAKey("kpi", row.key);
      return {
        key: row.key,
        label: row.label,
        indicator,
        target: resolveIndicatorValue(indicator, "target"),
        actual: resolveIndicatorValue(indicator, "actual"),
        status: formatDisplayValue(indicator?.complianceStatus),
      };
    });

    if (
      import.meta.env.DEV &&
      (missingMappings.length > 0 || aliasFallbackMatches.length > 0 || duplicateMetricCodes.size > 0 || duplicateMetricNames.size > 0)
    ) {
      console.warn("Group A mapping diagnostics", {
        submissionId: submission?.id ?? null,
        academicYearId: submission?.academicYear?.id ?? null,
        resolutionSummary: {
          totalIndicators: indicators.length,
          resolvedByMetricCodeCount,
          resolvedByAliasFallbackCount: aliasFallbackMatches.length,
          missingMappingCount: missingMappings.length,
        },
        missingMappings,
        aliasFallbackMatches,
        duplicateMetricCodes: Array.from(duplicateMetricCodes).sort(),
        duplicateMetricNames: Array.from(duplicateMetricNames).sort(),
        availableMetricCodes,
        availableMetricNames,
      });
    }

    return {
      submission,
      reportFiles: {
        bmef: submission?.files?.bmef ?? null,
        smea: submission?.files?.smea ?? null,
      },
      hasSubmittedPackage: Boolean(submission),
      getIndicatorByGroupAKey,
      completedIndicators: submission?.summary?.metIndicators ?? 0,
      totalIndicators: submission?.summary?.totalIndicators ?? 0,
      indicators,
      schoolAchievementRows,
      kpiRows,
    };
  }, [groupASubmittedSubmission, hydratedSubmittedReportSubmission]);
  const activeReportFileEntry: IndicatorSubmissionFileEntry | null = useMemo(() => {
    if (!activeReportModalType || !groupAReportView.submission?.files) return null;
    return groupAReportView.submission.files[activeReportModalType] ?? null;
  }, [activeReportModalType, groupAReportView]);
  const activeReportFileName = activeReportFileEntry?.originalFilename ?? null;
  const activeReportExtension = normalizeFileExtension(activeReportFileName);
  const activeSchoolYearLabel = selectedYearLabel(
    effectiveAcademicYearId,
    orderedAcademicYears.map((year) => ({ id: year.id, name: year.name })),
    currentAcademicYearOption?.name ?? "N/A",
  );
  const selectedReportYearLabel = selectedYearLabel(
    effectiveAcademicYearId,
    orderedAcademicYears.map((year) => ({ id: year.id, name: year.name })),
    currentAcademicYearOption?.name ?? "N/A",
  );
  const submittedIndicatorRows = useMemo(
    () => groupAReportView.indicators,
    [groupAReportView],
  );

  /* ── Refresh ── */
  const runDashboardRefresh = useCallback(
    async () => runRefreshBatches([[refreshRecords], [refreshSubmissions]]),
    [refreshRecords, refreshSubmissions],
  );

  const handleRefreshAll = useCallback(async () => {
    if (isRefreshingAll) return;
    setIsRefreshingAll(true);
    try {
      await runDashboardRefresh();
    } finally {
      setIsRefreshingAll(false);
    }
  }, [isRefreshingAll, runDashboardRefresh]);

  useEffect(() => {
    if (initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
    let active = true;
    setIsRefreshingAll(true);
    void runDashboardRefresh().finally(() => {
      if (active) setIsRefreshingAll(false);
    });
    return () => {
      active = false;
    };
  }, [runDashboardRefresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsMobileViewport(window.innerWidth < MOBILE_BREAKPOINT);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (initialAcademicYearAppliedRef.current) return;
    const initialAcademicYearId = preferredSubmittedReportAcademicYearId ?? currentAcademicYearOption?.id ?? "";
    if (!initialAcademicYearId) return;
    setDashboardViewAcademicYearId(initialAcademicYearId);
    initialAcademicYearAppliedRef.current = true;
  }, [currentAcademicYearOption, preferredSubmittedReportAcademicYearId]);

  const handleDashboardViewAcademicYearChange = useCallback(async (nextYearId: string) => {
    if (nextYearId === dashboardViewAcademicYearId) {
      return;
    }

    setDashboardViewAcademicYearId(nextYearId);

    if (!selectedSchoolId || !nextYearId || nextYearId === "all") {
      lastLoadedYearKeyRef.current = "";
      setDashboardViewSubmissions([]);
      setIsDashboardYearSwitching(false);
    }
  }, [dashboardViewAcademicYearId, selectedSchoolId]);

  useEffect(() => {
    if (!selectedSchoolId || !dashboardViewAcademicYearId || dashboardViewAcademicYearId === "all") {
      if (dashboardViewAcademicYearId === "all") {
        setDashboardViewSubmissions([]);
      }
      return;
    }

    const key = buildSelectedYearLoadKey(selectedSchoolId, dashboardViewAcademicYearId);
    if (lastLoadedYearKeyRef.current === key) {
      return;
    }

    lastLoadedYearKeyRef.current = key;
    setIsDashboardYearSwitching(true);

    void loadSubmissionsForYear(selectedSchoolId, dashboardViewAcademicYearId)
      .then((rows) => {
        if (lastLoadedYearKeyRef.current === key) {
          setDashboardViewSubmissions(rows);
        }
      })
      .catch(() => {
        if (lastLoadedYearKeyRef.current === key) {
          setDashboardViewSubmissions([]);
        }
      })
      .finally(() => {
        if (lastLoadedYearKeyRef.current === key) {
          setIsDashboardYearSwitching(false);
        }
      });
  }, [dashboardViewAcademicYearId, loadSubmissionsForYear, selectedSchoolId]);

  useEffect(() => {
    if (!selectedSchoolId || !dashboardViewAcademicYearId || dashboardViewAcademicYearId === "all" || isDashboardYearSwitching) {
      return;
    }

    const matchingRows = indicatorSubmissions
      .filter((submission) => (
        String(submission.academicYear?.id ?? "") === String(dashboardViewAcademicYearId)
        && String(submission.school?.id ?? selectedSchoolId) === String(selectedSchoolId)
      ))
      .sort((a, b) => (
        new Date(b.updatedAt ?? b.createdAt ?? 0).getTime()
        - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime()
      ));

    if (matchingRows.length === 0 && dashboardViewSubmissions.length === 0) {
      return;
    }

    setDashboardViewSubmissions((current) => {
      const currentIds = current.map((submission) => submission.id).join("|");
      const nextIds = matchingRows.map((submission) => submission.id).join("|");
      const currentFingerprint = current.map((submission) => buildSubmissionRefreshFingerprint(submission)).join("|");
      const nextFingerprint = matchingRows.map((submission) => buildSubmissionRefreshFingerprint(submission)).join("|");

      if (currentIds === nextIds && currentFingerprint === nextFingerprint) {
        return current;
      }

      return matchingRows;
    });
  }, [dashboardViewAcademicYearId, dashboardViewSubmissions.length, indicatorSubmissions, isDashboardYearSwitching, selectedSchoolId]);

  useEffect(() => {
    setActiveReportModalType(null);
  }, [effectiveAcademicYearId, groupASubmittedSubmission?.id]);


  /* ── Quick-jump scroll ── */
  const scrollToSection = (sectionId: string) => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setFocusedSectionId(sectionId);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        setFocusedSectionId((cur) => (cur === sectionId ? null : cur));
      }, 3000);
    }
  };

  const focusCls = (id: string) => (focusedSectionId === id ? "dashboard-focus-glow" : "");

  const openReportModal = useCallback(
    async (type: IndicatorSubmissionFileType) => {
      const submission = groupAReportView.submission;
      const fileEntry = submission?.files?.[type] ?? null;
      if (!submission || !fileEntry?.uploaded) return;

      const previewWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!previewWindow) return;

      try {
        const relativeUrl = fileEntry.viewUrl ?? fileEntry.downloadUrl;
        if (!relativeUrl) {
          throw new Error("Preview URL is unavailable for this report.");
        }

        const endpoint = new URL(relativeUrl, getApiBaseUrl()).toString();
        const headers = new Headers({ Accept: "*/*" });
        if (apiToken !== COOKIE_SESSION_TOKEN) {
          headers.set("Authorization", `Bearer ${apiToken}`);
        }

        const response = await fetch(endpoint, {
          method: "GET",
          credentials: apiToken === COOKIE_SESSION_TOKEN ? "include" : "omit",
          headers,
        });

        if (!response.ok) {
          throw new Error(`Unable to open report preview (status ${response.status}).`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        previewWindow.location.href = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } catch {
        previewWindow.close();
        await downloadSubmissionFile(submission.id, type);
      }
    },
    [apiToken, downloadSubmissionFile, groupAReportView],
  );

  const closeReportModal = useCallback(() => {
    setActiveReportModalType(null);
    setReportZoomLevel(1);
  }, []);

  const handleDownloadActiveReport = useCallback(async () => {
    if (!activeReportModalType || !groupAReportView.submission) return;
    const activeFile = groupAReportView.submission.files?.[activeReportModalType] ?? null;

    if (activeFile?.downloadUrl) {
      const anchor = document.createElement("a");
      anchor.href = activeFile.downloadUrl;
      if (activeFile.originalFilename) {
        anchor.download = activeFile.originalFilename;
      }
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }

    await downloadSubmissionFile(groupAReportView.submission.id, activeReportModalType);
  }, [activeReportModalType, downloadSubmissionFile, groupAReportView]);

  useEffect(() => {
    if (!activeReportModalType || typeof window === "undefined") return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeReportModal();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activeReportModalType, closeReportModal]);


  /* ── Render ── */
  return (
    <Shell
      title="School Head Dashboard"
      subtitle=""
      actions={
        <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-sm border border-white/20 bg-white/10 p-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => void handleRefreshAll()}
            disabled={isRefreshingAll}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-white text-primary-700 shadow-sm transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
            aria-label="Refresh dashboard data"
            title="Refresh all data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingAll ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowHelpDialog(true)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-white text-primary-700 shadow-sm transition hover:bg-white/90"
            aria-label="Open quick guide"
            title="Help"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
          <span className="hidden max-w-[17rem] items-center truncate text-[11px] font-medium text-primary-100 sm:inline-flex lg:max-w-[21rem]">
            {syncStatus === "up_to_date" ? "Up to date" : "Updated"}
            {" | "}
            {lastSyncedAt
              ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Not synced"}
            {syncScope ? ` | ${syncScope}` : ""}
          </span>
        </div>
      }
    >
      <div className="school-head-dashboard mx-auto w-full max-w-[1180px] text-[14px]">
      {error && (
        <section className="mb-5 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </section>
      )}

      <DashboardHelpDialog open={showHelpDialog} variant="school_head" onClose={() => setShowHelpDialog(false)} />


      {/* ── School Info ── */}
      <section id="school-info" className={`mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4 ${focusCls("school-info")}`}>
        <article className="rounded-sm border border-slate-200 bg-white px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-slate-500">Assigned School</p>
          <p className="mt-2 text-base font-semibold leading-snug text-slate-900">{schoolName}</p>
        </article>
        <article className="rounded-sm border border-slate-200 bg-white px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-slate-500">School Code</p>
          <p className="mt-2 text-base font-semibold leading-snug text-slate-900">{schoolCode}</p>
        </article>
        <article className="rounded-sm border border-slate-200 bg-white px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-slate-500">Region</p>
          <p className="mt-2 text-base font-semibold leading-snug text-slate-900">{schoolRegion}</p>
        </article>
        <article className="rounded-sm border border-slate-200 bg-white px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.5px] text-slate-500">Academic Year</p>
          <div className="relative mt-2">
            <select
              value={effectiveAcademicYearId}
              onChange={(event) => {
                void handleDashboardViewAcademicYearChange(event.target.value);
              }}
              className="w-full appearance-none rounded-sm border border-slate-300 bg-white px-3 py-2.5 pr-8 text-sm font-semibold text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              aria-label="Academic year filter"
            >
              {orderedAcademicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">v</span>
          </div>
        </article>
      </section>

      {/* ── File Reports ── */}
      <section id="file-reports" className={`mb-8 ${focusCls("file-reports")}`}>
        <div className="rounded-sm border-2 border-primary-200 bg-primary-50/20 p-3 md:p-4">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-primary-200 pb-2">
            <div>
              <h2 className="text-[18px] font-semibold text-slate-900">Submitted Report View</h2>
            </div>
          </div>

          {isYearScopedLoading && (
            <p className="mb-3 text-xs font-medium text-slate-500">Loading selected academic year data...</p>
          )}
          {!isYearScopedLoading && !groupASubmittedSubmission && (
            <div className="mb-3 space-y-1">
              <p className="text-xs font-medium text-slate-500">No submitted report package yet.</p>
              <p className="text-xs text-slate-500">
                Save Draft keeps your editable package in the workspace below. This report package updates only after you click Submit.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4 md:flex-row">
            {([
              {
                type: "bmef" as const,
                title: "BMEF Report",
                file: groupAReportView.reportFiles.bmef,
              },
              {
                type: "smea" as const,
                title: "SMEA Report",
                file: groupAReportView.reportFiles.smea,
              },
            ]).map((report) => {
              const hasFile = Boolean(report.file?.uploaded && report.file?.originalFilename);
              const buttonLabel = `View ${report.type.toUpperCase()} Report`;

              return (
                <article key={report.type} className="flex-1 rounded-sm border border-slate-200 bg-white px-6 py-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{report.title}</h3>
                  </div>

                  <dl className="mt-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <dt className="w-24 shrink-0 text-xs font-medium text-slate-500">File</dt>
                      <dd className="truncate text-sm font-normal text-slate-900">{report.file?.originalFilename ?? "- (none)"}</dd>
                    </div>
                    <div className="flex items-start gap-2">
                      <dt className="w-24 shrink-0 text-xs font-medium text-slate-500">Date</dt>
                      <dd className="text-sm font-normal text-slate-900">
                        {report.file?.uploadedAt ? new Date(report.file.uploadedAt).toLocaleDateString() : "-"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={hasFile ? () => openReportModal(report.type) : undefined}
                      disabled={!hasFile}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-primary-300 bg-primary-50 px-3 py-2.5 text-[13px] font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-primary-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {buttonLabel}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-6 overflow-hidden rounded-sm border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-base font-semibold text-slate-900">
              <div className="flex flex-col gap-1">
                <span className="inline-block border-l-[3px] border-primary-600 pl-3">Submitted Report Package</span>
                {groupAReportView.totalIndicators > 0 && (
                  <span className="pl-3 text-xs font-medium text-slate-500">
                    Submitted package completion: {groupAReportView.completedIndicators}/{groupAReportView.totalIndicators} complete
                  </span>
                )}
              </div>
            </h2>
            <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
            {/* School's Achievement Table */}
            <div className="border border-slate-200 rounded-sm bg-white overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800">School&apos;s Achievement (SY {selectedReportYearLabel})</h3>
              </div>
              <table className="w-full text-[13px] text-slate-900">
                <thead>
                  <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Metric</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {groupAReportView.schoolAchievementRows.map((row) => (
                    <tr key={row.key}>
                      <td className={`px-4 py-2.5 text-slate-900 ${isSubItemMetric(row.label) ? "pl-9 text-[12px] italic font-medium text-slate-600" : ""}`}>
                        {row.label}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-900">
                        <span className="font-semibold text-slate-900">
                          {row.value}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Key Performance Indicators Table */}
            <div className="border border-slate-200 rounded-sm bg-white overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800">Key Performance Indicators (SY {selectedReportYearLabel})</h3>
              </div>
              <table className="w-full text-[13px] text-slate-900">
                <thead>
                  <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Indicator</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Target</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Actual</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.6px] text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {groupAReportView.kpiRows.map((row) => (
                    <tr key={row.key}>
                      <td className="px-4 py-2.5 text-slate-900">{row.label}</td>
                      <td className="px-4 py-2.5 text-center text-slate-900">
                        <span className="font-semibold text-slate-900">
                          {row.target}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-900">
                        <span className="font-semibold text-slate-900">
                          {row.actual}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-900">
                        {row.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </div>
      </section>

      {activeReportModalType && activeReportFileEntry && (
        <>
          <button
            type="button"
            onClick={closeReportModal}
            className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm"
            aria-label="Close report preview"
          />
          <section className="fixed inset-3 z-[81] flex flex-col overflow-hidden rounded-sm border border-slate-300 bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                {activeReportModalType.toUpperCase()} Report - SY {activeSchoolYearLabel}
              </h3>
              <div className="flex items-center gap-2">
                {activeReportExtension === "png" || activeReportExtension === "jpg" || activeReportExtension === "jpeg" || activeReportExtension === "webp" || activeReportExtension === "gif" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setReportZoomLevel((prev) => Math.max(0.5, Number((prev - 0.1).toFixed(2))))}
                      className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1.5 text-slate-700 transition hover:bg-slate-100"
                      aria-label="Zoom out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportZoomLevel((prev) => Math.min(3, Number((prev + 0.1).toFixed(2))))}
                      className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1.5 text-slate-700 transition hover:bg-slate-100"
                      aria-label="Zoom in"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleDownloadActiveReport()}
                  className="inline-flex items-center gap-1 rounded-sm border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={closeReportModal}
                  className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1.5 text-slate-700 transition hover:bg-slate-100"
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3">
              {activeReportExtension === "pdf" && activeReportFileEntry.downloadUrl ? (
                <iframe
                  title={`${activeReportModalType.toUpperCase()} PDF preview`}
                  src={activeReportFileEntry.downloadUrl}
                  className="h-full w-full rounded-sm border border-slate-300 bg-white"
                />
              ) : activeReportExtension === "png" || activeReportExtension === "jpg" || activeReportExtension === "jpeg" || activeReportExtension === "webp" || activeReportExtension === "gif" ? (
                <div className="h-full overflow-auto rounded-sm border border-slate-300 bg-white p-4">
                  <img
                    src={activeReportFileEntry.downloadUrl ?? ""}
                    alt={`${activeReportModalType.toUpperCase()} report`}
                    className="max-w-none origin-top-left"
                    style={{ transform: `scale(${reportZoomLevel})` }}
                  />
                </div>
              ) : activeReportExtension === "xlsx" || activeReportExtension === "xls" || activeReportExtension === "csv" ? (
                <div className="h-full overflow-auto rounded-sm border border-slate-300 bg-white">
                  <table className="min-w-full">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-3 py-2 text-left">Indicator</th>
                        <th className="px-3 py-2 text-right">Target</th>
                        <th className="px-3 py-2 text-right">Actual</th>
                        <th className="px-3 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submittedIndicatorRows.map((item) => (
                        <tr key={`modal-${item.id}`} className="border-b border-slate-100 text-sm text-slate-800">
                          <td className="px-3 py-2">{item.metric?.name ?? "Untitled indicator"}</td>
                          <td className="px-3 py-2 text-right">{resolveIndicatorValue(item, "target")}</td>
                          <td className="px-3 py-2 text-right">{resolveIndicatorValue(item, "actual")}</td>
                          <td className="px-3 py-2 text-center">{formatDisplayValue(item.complianceStatus)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : activeReportFileEntry.downloadUrl ? (
                <iframe
                  title={`${activeReportModalType.toUpperCase()} report preview`}
                  src={activeReportFileEntry.downloadUrl}
                  className="h-full w-full rounded-sm border border-slate-300 bg-white"
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-sm border border-slate-300 bg-white text-sm font-semibold text-slate-600">
                  Preview unavailable for this file.
                </div>
              )}
            </div>
          </section>
        </>
      )}
      <section id="imeta-compliance" className={focusCls("imeta-compliance")}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
              Submission Workspace
            </h2>
          </div>
        </div>
        <SchoolIndicatorPanel
          initialAcademicYearId={currentAcademicYearOption?.id ?? ""}
        />
      </section>
      </div>
    </Shell>
  );
}





