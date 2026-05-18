import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchoolAdminDashboard } from "@/pages/SchoolAdminDashboard";
import type { IndicatorSubmission } from "@/types";

const useAuthMock = vi.fn();
const useDataMock = vi.fn();
const useIndicatorDataMock = vi.fn();

vi.mock("@/context/Auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/context/Data", () => ({
  useData: () => useDataMock(),
}));

vi.mock("@/context/IndicatorData", () => ({
  useIndicatorData: () => useIndicatorDataMock(),
}));

vi.mock("@/components/Shell", () => ({
  Shell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/DashboardHelpDialog", () => ({
  DashboardHelpDialog: () => null,
}));

vi.mock("@/components/indicators/SchoolIndicatorPanel", () => ({
  SchoolIndicatorPanel: () => <div data-testid="workspace-panel" />,
}));

function buildSubmission(overrides: Partial<IndicatorSubmission>): IndicatorSubmission {
  return {
    id: "submission-1",
    formType: "indicator",
    academicYear: { id: "year-1", name: "2025-2026" },
    reportingPeriod: "ANNUAL",
    status: "submitted",
    statusLabel: "Submitted",
    version: 1,
    notes: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    submittedAt: "2026-05-01T00:00:00.000Z",
    reviewedAt: null,
    reviewNotes: null,
    indicators: [],
    items: [],
    summary: {
      totalIndicators: 1,
      metIndicators: 1,
      belowTargetIndicators: 0,
      complianceRatePercent: 100,
    },
    completion: {
      hasImetaFormData: true,
      hasBmefFile: false,
      hasSmeaFile: false,
      isComplete: false,
      requiredFileTypes: [],
      uploadedFileTypes: [],
      missingFileTypes: [],
    },
    schoolId: "school-1",
    schoolType: "private",
    presentation: {
      activeFileTypes: [],
      activeReportFileTypes: [],
      activeWorkspaceFileTypes: [],
      secondaryHistoricalFileTypes: [],
    },
    school: {
      id: "school-1",
      schoolCode: "401777",
      name: "AMA CC - Santiago City",
      type: "private",
    },
    ...overrides,
  };
}

function buildEnrollmentIndicator(value: number) {
  return {
    id: `indicator-${value}`,
    metric: {
      id: "IMETA_ENROLL_TOTAL",
      code: "IMETA_ENROLL_TOTAL",
      name: "TOTAL NUMBER OF ENROLMENT",
      category: "school_achievements_learning_outcomes",
      framework: "imeta",
      dataType: "yearly_matrix",
      inputSchema: {
        valueType: "integer",
        years: ["2025-2026", "2026-2027"],
      },
    },
    targetValue: null,
    actualValue: value,
    varianceValue: null,
    actualTypedValue: {
      values: {
        "2025-2026": value,
        "2026-2027": 9999,
      },
    },
    actualDisplay: `2025-2026: ${value}.00 | 2026-2027: 9999.00`,
    complianceStatus: "met",
    remarks: null,
  };
}

function buildKpiIndicator(overrides?: Partial<Record<"targetValue" | "actualValue" | "complianceStatus", number | string | null>>) {
  return {
    id: "kpi-ner",
    metric: {
      id: "NER",
      code: "NER",
      name: "Net Enrollment Rate (NER)",
      category: "learner",
      framework: "targets_met",
      dataType: "yearly_matrix",
    },
    targetValue: typeof overrides?.targetValue === "number" ? overrides.targetValue : 96,
    actualValue: typeof overrides?.actualValue === "number" ? overrides.actualValue : 94,
    varianceValue: -2,
    complianceStatus: typeof overrides?.complianceStatus === "string" ? overrides.complianceStatus : "below_target",
    remarks: null,
  };
}

describe("SchoolAdminDashboard submitted report view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("keeps selected-year report truth stable even when broader cached submissions contain another finalized year", async () => {
    const yearOneSubmission = buildSubmission({
      id: "101",
      academicYear: { id: "year-1", name: "2025-2026" },
      indicators: [buildEnrollmentIndicator(1515)],
      items: [],
      submittedAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    });
    const yearTwoSubmission = buildSubmission({
      id: "202",
      academicYear: { id: "year-2", name: "2026-2027" },
      indicators: [buildEnrollmentIndicator(9999)],
      items: [],
      submittedAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    });

    useAuthMock.mockReturnValue({
      user: {
        id: 7,
        role: "school_head",
        schoolId: "school-1",
        schoolType: "private",
        schoolName: "AMA CC - Santiago City",
        schoolCode: "401777",
        schoolAddress: "Herritage Bldg.",
      },
      apiToken: "token",
    });

    useDataMock.mockReturnValue({
      records: [
        {
          schoolId: "school-1",
          schoolName: "AMA CC - Santiago City",
          schoolCode: "401777",
          address: "Herritage Bldg.",
        },
      ],
      error: "",
      lastSyncedAt: "2026-05-17T00:00:00.000Z",
      syncScope: "records",
      syncStatus: "up_to_date",
      refreshRecords: vi.fn().mockResolvedValue(undefined),
    });

    const loadSubmissionsForYear = vi.fn(async (_schoolId: string, yearId: string) => {
      if (yearId === "year-1") {
        return [yearOneSubmission];
      }
      if (yearId === "year-2") {
        return [yearTwoSubmission];
      }
      return [];
    });

    const fetchSubmission = vi.fn(async (id: string) => (id === "101" ? yearOneSubmission : yearTwoSubmission));

    useIndicatorDataMock.mockReturnValue({
      submissions: [],
      allSubmissions: [yearTwoSubmission],
      academicYears: [
        { id: "year-1", name: "2025-2026", isCurrent: true },
        { id: "year-2", name: "2026-2027", isCurrent: false },
      ],
      downloadSubmissionFile: vi.fn(),
      fetchSubmission,
      loadSubmissionsForYear,
      refreshAllSubmissions: vi.fn().mockResolvedValue(undefined),
      refreshSubmissions: vi.fn().mockResolvedValue(undefined),
    });

    render(<SchoolAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Source package: #101 (Submitted).")).not.toBeNull();
    });
    expect(screen.getByText("1,515")).not.toBeNull();
    expect(screen.queryByText("Source package: #202 (Submitted).")).toBeNull();

    fireEvent.change(screen.getByLabelText("Academic year filter"), {
      target: { value: "year-2" },
    });

    await waitFor(() => {
      expect(screen.getByText("Source package: #202 (Submitted).")).not.toBeNull();
    });
    expect(screen.getByText("9,999")).not.toBeNull();
  });

  it("renders selected-year integer report values without joined year text or forced decimals", async () => {
    const submitted = buildSubmission({
      id: "integer-101",
      indicators: [buildEnrollmentIndicator(1515)],
      items: [],
      summary: {
        totalIndicators: 1,
        metIndicators: 0,
        belowTargetIndicators: 0,
        complianceRatePercent: 0,
      },
    });

    useAuthMock.mockReturnValue({
      user: {
        id: 7,
        role: "school_head",
        schoolId: "school-1",
        schoolType: "private",
        schoolName: "AMA CC - Santiago City",
        schoolCode: "401777",
        schoolAddress: "Herritage Bldg.",
      },
      apiToken: "token",
    });

    useDataMock.mockReturnValue({
      records: [
        {
          schoolId: "school-1",
          schoolName: "AMA CC - Santiago City",
          schoolCode: "401777",
          address: "Herritage Bldg.",
        },
      ],
      error: "",
      lastSyncedAt: "2026-05-17T00:00:00.000Z",
      syncScope: "records",
      syncStatus: "up_to_date",
      refreshRecords: vi.fn().mockResolvedValue(undefined),
    });

    useIndicatorDataMock.mockReturnValue({
      submissions: [],
      allSubmissions: [submitted],
      academicYears: [
        { id: "year-1", name: "2025-2026", isCurrent: true },
      ],
      downloadSubmissionFile: vi.fn(),
      fetchSubmission: vi.fn(async () => submitted),
      loadSubmissionsForYear: vi.fn(async () => [submitted]),
      refreshAllSubmissions: vi.fn().mockResolvedValue(undefined),
      refreshSubmissions: vi.fn().mockResolvedValue(undefined),
    });

    render(<SchoolAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("1,515")).not.toBeNull();
    });
    expect(screen.queryByText(/2026-2027:/)).toBeNull();
    expect(screen.queryByText("1515.00")).toBeNull();
  });

  it("renders production KPI compliance labels instead of raw backend enums", async () => {
    const submitted = buildSubmission({
      id: "kpi-101",
      indicators: [buildKpiIndicator()],
      items: [],
      summary: {
        totalIndicators: 1,
        metIndicators: 0,
        belowTargetIndicators: 1,
        complianceRatePercent: 0,
      },
    });

    useAuthMock.mockReturnValue({
      user: {
        id: 7,
        role: "school_head",
        schoolId: "school-1",
        schoolType: "private",
        schoolName: "AMA CC - Santiago City",
        schoolCode: "401777",
        schoolAddress: "Herritage Bldg.",
      },
      apiToken: "token",
    });

    useDataMock.mockReturnValue({
      records: [
        {
          schoolId: "school-1",
          schoolName: "AMA CC - Santiago City",
          schoolCode: "401777",
          address: "Herritage Bldg.",
        },
      ],
      error: "",
      lastSyncedAt: "2026-05-17T00:00:00.000Z",
      syncScope: "records",
      syncStatus: "up_to_date",
      refreshRecords: vi.fn().mockResolvedValue(undefined),
    });

    useIndicatorDataMock.mockReturnValue({
      submissions: [],
      allSubmissions: [submitted],
      academicYears: [
        { id: "year-1", name: "2025-2026", isCurrent: true },
      ],
      downloadSubmissionFile: vi.fn(),
      fetchSubmission: vi.fn(async () => submitted),
      loadSubmissionsForYear: vi.fn(async () => [submitted]),
      refreshAllSubmissions: vi.fn().mockResolvedValue(undefined),
      refreshSubmissions: vi.fn().mockResolvedValue(undefined),
    });

    render(<SchoolAdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Not met")).not.toBeNull();
    });
    expect(screen.queryByText("below_target")).toBeNull();
  });
});
