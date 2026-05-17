import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonitorSchoolDrawer } from "@/pages/monitor/MonitorSchoolDrawer";

describe("MonitorSchoolDrawer", () => {
  it("keeps submissions as the main page and history as secondary reference", () => {
    render(
      <MonitorSchoolDrawer
        viewState={{
          isOpen: true,
          showNavigatorManual: true,
          isMobileViewport: false,
          activeTopNavigator: "schools",
          activeSchoolDrawerTab: "submissions",
          selectedSchoolDrawerYear: "2025-2026",
          highlightedDrawerIndicatorKey: null,
          expandedDrawerIndicatorRows: {},
        }}
        loadingState={{
          syncedCountsLoadingSchoolKey: null,
          syncedCountsError: "",
          isSchoolDrawerSubmissionsLoading: false,
          schoolDrawerSubmissionsError: "",
        }}
        data={{
          schoolDetail: {
            schoolKey: "school-1",
            schoolCode: "401777",
            schoolName: "AMA CC - Santiago City",
            region: "II",
            level: "High School",
            type: "Private",
            schoolTypeRaw: "private",
            requirementModeLabel: "Active package requirements: FM-QAD uploads only.",
            activePackageLabel: "FM-QAD uploads only",
            address: "N/A",
            hasComplianceRecord: true,
            indicatorStatus: "submitted",
            hasActivePackageSubmission: true,
            missingCount: 0,
            awaitingReviewCount: 1,
            lastActivityAt: null,
            reportedStudents: 0,
            reportedTeachers: 0,
            synchronizedStudents: 0,
            synchronizedTeachers: 0,
          },
          availableSchoolDrawerYears: ["2025-2026"],
          schoolDrawerYearDetail: {
            selectedYearLabel: "2025-2026",
            availableYears: [{ id: "2025-2026", label: "2025-2026" }],
            currentIssueLabel: "Awaiting monitor review.",
            currentIssueTone: "info",
            checklistItems: [
              { id: "school_achievements", label: "School Achievements", statusLabel: "For Review", tone: "info", detail: "Section values are available for this year.", kind: "section" },
              { id: "fm_qad_001", label: "FM-QAD-001", statusLabel: "For Review", tone: "info", detail: "File is present for the selected year.", kind: "file" },
            ],
            checklistCompleteCount: 0,
            checklistMissingCount: 0,
            selectedYearLatestSubmissionId: "sub-1",
            selectedYearLatestStatus: "submitted",
            finalizedReportSubmission: null,
            reportSourceContext: ["Viewing finalized submitted report for SY 2025-2026.", "Source package: None yet.", "Status: Reference only."],
            reportBlankStateLines: [
              "No finalized submitted report package exists yet for the selected academic year.",
              "The report tables are shown for reference. Finalized values will appear here after you submit the package.",
            ],
            schoolAchievementRows: [{ key: "a1", label: "NAME OF SCHOOL HEAD", value: "-" }],
            kpiRows: [{ key: "k1", label: "Net Enrollment Rate", target: "-", actual: "-", status: "-" }],
          },
          schoolDrawerHistorySummary: null,
          schoolDrawerCriticalAlerts: [],
          schoolIndicatorPackageRows: [],
          latestSchoolPackage: null,
          schoolIndicatorMatrix: { years: [], rows: [], latestSubmission: null },
          latestSchoolIndicatorYear: "",
          schoolDrawerIndicatorSubmissions: [],
          schoolIndicatorRowsByCategory: [],
          missingDrawerIndicatorKeys: [],
          returnedDrawerIndicatorKeys: [],
          missingDrawerIndicatorKeySet: new Set(),
          returnedDrawerIndicatorKeySet: new Set(),
        }}
        actions={{
          setActiveSchoolDrawerTab: vi.fn(),
          setSelectedSchoolDrawerYear: vi.fn(),
          closeSchoolDrawer: vi.fn(),
          handleJumpToMissingIndicators: vi.fn(),
          handleJumpToReturnedIndicators: vi.fn(),
          toggleDrawerIndicatorLabel: vi.fn(),
        }}
        formatting={{
          workflowTone: () => "",
          workflowLabel: (status) => status ?? "N/A",
          formatDateTime: () => "N/A",
        }}
      />,
    );

    expect(screen.getByLabelText("Monitor school detail academic year")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submissions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "History (Reference)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Snapshot" })).toBeNull();
    expect(screen.getByText("Year Checklist")).toBeTruthy();
    expect(screen.getByText("Submitted Report View")).toBeTruthy();
    expect(screen.getByText("Data Sync")).toBeTruthy();
    expect(screen.getByText("Critical Alerts")).toBeTruthy();
    expect(screen.queryByText("Active Package Context")).toBeNull();
    expect(screen.queryByText("Monitor Package")).toBeNull();
    expect(screen.queryByText("Active package requirements: FM-QAD uploads only.")).toBeNull();
    expect(screen.queryByText(/Compliance is submitted\. Active private package/i)).toBeNull();
  });

  it("keeps the rendered checklist and report tied to the selected year context", () => {
    const baseProps: Parameters<typeof MonitorSchoolDrawer>[0] = {
      viewState: {
        isOpen: true,
        showNavigatorManual: true,
        isMobileViewport: false,
        activeTopNavigator: "schools" as const,
        activeSchoolDrawerTab: "submissions" as const,
        selectedSchoolDrawerYear: "2025-2026",
        highlightedDrawerIndicatorKey: null,
        expandedDrawerIndicatorRows: {},
      },
      loadingState: {
        syncedCountsLoadingSchoolKey: null,
        syncedCountsError: "",
        isSchoolDrawerSubmissionsLoading: false,
        schoolDrawerSubmissionsError: "",
      },
      data: {
        schoolDetail: {
          schoolKey: "school-1",
          schoolCode: "401777",
          schoolName: "AMA CC - Santiago City",
          region: "II",
          level: "High School",
          type: "Public",
          schoolTypeRaw: "public",
          requirementModeLabel: "",
          activePackageLabel: "",
          address: "N/A",
          hasComplianceRecord: true,
          indicatorStatus: "validated",
          hasActivePackageSubmission: true,
          missingCount: 0,
          awaitingReviewCount: 0,
          lastActivityAt: null,
          reportedStudents: 0,
          reportedTeachers: 0,
          synchronizedStudents: 0,
          synchronizedTeachers: 0,
        },
        availableSchoolDrawerYears: ["2026-2027", "2025-2026"],
        schoolDrawerYearDetail: {
          selectedYearLabel: "2025-2026",
          availableYears: [{ id: "2025-2026", label: "2025-2026" }],
          currentIssueLabel: "Submission validated.",
          currentIssueTone: "success",
          checklistItems: [
            { id: "school_achievements", label: "School Achievements", statusLabel: "Complete", tone: "success", detail: "Section values are available for this year.", kind: "section" },
            { id: "bmef", label: "BMEF", statusLabel: "Uploaded", tone: "success", detail: "File is present for the selected year.", kind: "file" },
          ],
          checklistCompleteCount: 2,
          checklistMissingCount: 0,
          selectedYearLatestSubmissionId: "sub-2025",
          selectedYearLatestStatus: "validated",
          finalizedReportSubmission: null,
          reportSourceContext: ["Viewing finalized submitted report for SY 2025-2026."],
          reportBlankStateLines: [
            "No finalized submitted report package exists yet for the selected academic year.",
            "The report tables are shown for reference. Finalized values will appear here after you submit the package.",
          ],
          schoolAchievementRows: [{ key: "a1", label: "NAME OF SCHOOL HEAD", value: "Jane Doe" }],
          kpiRows: [{ key: "k1", label: "Net Enrollment Rate", target: "100.00%", actual: "98.00%", status: "met" }],
        },
        schoolDrawerHistorySummary: null,
        schoolDrawerCriticalAlerts: [],
        schoolIndicatorPackageRows: [],
        latestSchoolPackage: null,
        schoolIndicatorMatrix: { years: [], rows: [], latestSubmission: null },
        latestSchoolIndicatorYear: "",
        schoolDrawerIndicatorSubmissions: [],
        schoolIndicatorRowsByCategory: [],
        missingDrawerIndicatorKeys: [],
        returnedDrawerIndicatorKeys: [],
        missingDrawerIndicatorKeySet: new Set(),
        returnedDrawerIndicatorKeySet: new Set(),
      },
      actions: {
        setActiveSchoolDrawerTab: vi.fn(),
        setSelectedSchoolDrawerYear: vi.fn(),
        closeSchoolDrawer: vi.fn(),
        handleJumpToMissingIndicators: vi.fn(),
        handleJumpToReturnedIndicators: vi.fn(),
        toggleDrawerIndicatorLabel: vi.fn(),
      },
      formatting: {
        workflowTone: () => "",
        workflowLabel: (status: string | null) => status ?? "N/A",
        formatDateTime: () => "N/A",
      },
    };

    const { rerender } = render(<MonitorSchoolDrawer {...baseProps} />);
    const nextYearDetail = {
      ...baseProps.data.schoolDrawerYearDetail!,
      selectedYearLabel: "2026-2027",
      selectedYearLatestSubmissionId: "sub-2026",
      reportSourceContext: ["Viewing finalized submitted report for SY 2026-2027."],
      schoolAchievementRows: [{ key: "a2", label: "NAME OF SCHOOL HEAD", value: "John Doe" }],
      kpiRows: [{ key: "k2", label: "Net Enrollment Rate", target: "100.00%", actual: "99.00%", status: "met" }],
    };

    expect(screen.getAllByText("Viewing SY 2025-2026.").length).toBeGreaterThan(0);
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText("98.00%")).toBeTruthy();

    rerender(
      <MonitorSchoolDrawer
        {...baseProps}
        viewState={{
          ...baseProps.viewState,
          selectedSchoolDrawerYear: "2026-2027",
        }}
        data={{
          ...baseProps.data,
          schoolDrawerYearDetail: nextYearDetail,
        }}
      />,
    );

    expect(screen.getAllByText("Viewing SY 2026-2027.").length).toBeGreaterThan(0);
    expect(screen.getByText("John Doe")).toBeTruthy();
    expect(screen.getByText("99.00%")).toBeTruthy();
    expect(screen.queryByText("Jane Doe")).toBeNull();
  });
});
