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
