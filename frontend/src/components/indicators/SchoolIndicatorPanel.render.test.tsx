import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchoolIndicatorPanel } from "@/components/indicators/SchoolIndicatorPanel";

const useAuthMock = vi.fn();
const useIndicatorDataMock = vi.fn();

vi.mock("@/context/Auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/context/IndicatorData", () => ({
  useIndicatorData: () => useIndicatorDataMock(),
}));

describe("SchoolIndicatorPanel optional note removal", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthMock.mockReturnValue({
      apiToken: "token",
      user: {
        id: 25,
        role: "school_head",
        schoolId: 1,
        schoolCode: "401777",
        schoolName: "AMA CC - Santiago City",
        schoolType: "private",
      },
    });
    useIndicatorDataMock.mockReturnValue({
      submissions: [],
      allSubmissions: [],
      metrics: [],
      academicYears: [{ id: "year-1", name: "2025-2026", isCurrent: true }],
      isLoading: false,
      isAllSubmissionsLoading: false,
      isSaving: false,
      error: null,
      refreshSubmissions: vi.fn(),
      loadSubmissionsForYear: vi.fn().mockResolvedValue([]),
      bootstrapSubmission: vi.fn(),
      createSubmission: vi.fn(),
      updateSubmission: vi.fn(),
      fetchSubmission: vi.fn(),
      resetSubmissionWorkspace: vi.fn(),
      uploadSubmissionFile: vi.fn(),
      downloadSubmissionFile: vi.fn(),
      submitSubmission: vi.fn(),
      loadHistory: vi.fn(),
    });
  });

  it("does not render the removed optional note controls in the School Head workspace", async () => {
    render(<SchoolIndicatorPanel initialAcademicYearId="year-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText("Academic Year")).not.toBeNull();
    });

    expect(screen.queryByText("Optional note")).toBeNull();
    expect(screen.queryByPlaceholderText("Add optional note")).toBeNull();
    expect(screen.queryByText("+ Add optional note")).toBeNull();
  });
});
