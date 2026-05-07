import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonitorSchoolRecordsList } from "@/pages/monitor/MonitorSchoolRecordsList";

describe("MonitorSchoolRecordsList", () => {
  it("explains how to restore in-scope schools when filters narrow visible rows to zero", () => {
    const onResetQueueFilters = vi.fn();
    const onClearAllFilters = vi.fn();

    render(
      <MonitorSchoolRecordsList
        showLoadingSkeleton={false}
        scopeSchoolsCount={46}
        hasDashboardFilters
        compactSchoolRowsCount={0}
        paginatedRows={[]}
        statusFilter="all"
        requirementFilter="all"
        schoolQuickPreset="missing"
        safeRecordsPage={1}
        totalRecordPages={1}
        canGoPrevious={false}
        canGoNext={false}
        onResetQueueFilters={onResetQueueFilters}
        onClearAllFilters={onClearAllFilters}
        onToggleStatusFilter={vi.fn()}
        onToggleRequirementFilter={vi.fn()}
        onToggleSchoolQuickPreset={vi.fn()}
        onOpenSchool={vi.fn()}
        onReviewSchool={vi.fn()}
        onPreviousPage={vi.fn()}
        onNextPage={vi.fn()}
        formatDateTime={(value) => value}
        statusTone={() => "bg-white text-slate-900"}
        statusLabel={() => "Active"}
        isUrgentRequirement={() => false}
        urgencyRowTone={() => "bg-white"}
      />,
    );

    expect(screen.getByText("No visible school records")).toBeTruthy();
    expect(
      screen.getByText(
        "No schools match the current Submission Incomplete preset. Use Reset queue filters or Clear all to show schools in scope again.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Reset queue filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(onResetQueueFilters).toHaveBeenCalledTimes(1);
    expect(onClearAllFilters).toHaveBeenCalledTimes(1);
  });
});
