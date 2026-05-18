import { describe, expect, it } from "vitest";
import { formatSubmittedReportValue, resolveSubmissionItemDisplayValue } from "@/pages/monitor/monitorDrawerViewModelUtils";
import type { IndicatorSubmissionItem } from "@/types";

function item(overrides: Partial<IndicatorSubmissionItem>): IndicatorSubmissionItem {
  return {
    id: "item-1",
    targetValue: null,
    actualValue: null,
    varianceValue: null,
    targetTypedValue: null,
    actualTypedValue: null,
    targetDisplay: null,
    actualDisplay: null,
    complianceStatus: "",
    remarks: null,
    ...overrides,
  };
}

describe("resolveSubmissionItemDisplayValue", () => {
  it("prefers display values over typed or numeric fallbacks", () => {
    const indicator = item({
      actualDisplay: "Ready for validation",
      actualTypedValue: { value: "Draft value" },
      actualValue: 9,
    });

    expect(resolveSubmissionItemDisplayValue(indicator, "actual")).toBe("Ready for validation");
  });

  it("uses typed scalar values when display is blank", () => {
    const indicator = item({
      targetDisplay: "   ",
      targetTypedValue: { value: false },
      targetValue: 1,
    });

    expect(resolveSubmissionItemDisplayValue(indicator, "target")).toBe("No");
  });

  it("uses typed yearly payload values before falling back to numeric values", () => {
    const indicator = item({
      actualTypedValue: {
        values: {
          "2025-2026": 0,
        },
      },
      actualValue: 17,
    });

    expect(resolveSubmissionItemDisplayValue(indicator, "actual")).toBe("0");
  });

  it("prefers the selected-year typed value over a generic joined display string", () => {
    const indicator = item({
      metric: {
        id: "metric-1",
        code: "IMETA_ENROLL_TOTAL",
        name: "Total Number of Enrolment",
        category: "learner",
        framework: "imeta",
        dataType: "yearly_matrix",
        inputSchema: { valueType: "integer", years: ["2025-2026", "2026-2027"] },
      },
      actualDisplay: "2025-2026: 1515 | 2026-2027: 9999",
      actualTypedValue: {
        values: {
          "2025-2026": 1515,
          "2026-2027": 9999,
        },
      },
    });

    expect(resolveSubmissionItemDisplayValue(indicator, "actual", { selectedYear: "2025-2026" })).toBe("1,515");
    expect(resolveSubmissionItemDisplayValue(indicator, "actual", { selectedYear: "2026-2027" })).toBe("9,999");
  });

  it("formats selected-year currency values with PHP and decimals", () => {
    const indicator = item({
      metric: {
        id: "metric-2",
        code: "CANTEEN_INCOME",
        name: "Canteen Income",
        category: "compliance",
        framework: "imeta",
        dataType: "yearly_matrix",
        inputSchema: { valueType: "currency", currency: "PHP", years: ["2025-2026"] },
      },
      actualTypedValue: {
        values: {
          "2025-2026": 12500,
        },
      },
    });

    expect(resolveSubmissionItemDisplayValue(indicator, "actual", { selectedYear: "2025-2026" })).toBe("PHP 12,500.00");
  });

  it("formats selected-year percentage values with percent decimals", () => {
    const indicator = item({
      metric: {
        id: "metric-3",
        code: "NER",
        name: "Net Enrollment Rate",
        category: "learner",
        framework: "targets_met",
        dataType: "yearly_matrix",
        inputSchema: { valueType: "percentage", years: ["2025-2026"] },
      },
      actualTypedValue: {
        values: {
          "2025-2026": 96,
        },
      },
    });

    expect(resolveSubmissionItemDisplayValue(indicator, "actual", { selectedYear: "2025-2026" })).toBe("96.00%");
  });

  it("renders numeric zero instead of a dash", () => {
    const indicator = item({
      actualValue: 0,
    });

    expect(resolveSubmissionItemDisplayValue(indicator, "actual")).toBe("0");
  });

  it("returns a dash only when every backend-backed value is empty", () => {
    const indicator = item({
      targetDisplay: "",
      targetTypedValue: { values: {} },
      targetValue: null,
    });

    expect(resolveSubmissionItemDisplayValue(indicator, "target")).toBe("-");
  });
});

describe("formatSubmittedReportValue", () => {
  it("strips leading academic year prefixes from submitted report cells", () => {
    expect(formatSubmittedReportValue("2025-2026 64.29")).toBe("64.29");
    expect(formatSubmittedReportValue("2025-2026: 64.29")).toBe("64.29");
  });

  it("preserves legitimate zero and yes/no values", () => {
    expect(formatSubmittedReportValue(0)).toBe("0");
    expect(formatSubmittedReportValue("0.00")).toBe("0.00");
    expect(formatSubmittedReportValue(false)).toBe("No");
    expect(formatSubmittedReportValue("no")).toBe("no");
  });
});
