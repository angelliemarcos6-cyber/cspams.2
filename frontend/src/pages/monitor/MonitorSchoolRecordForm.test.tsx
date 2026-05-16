import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonitorSchoolRecordForm, type MonitorSchoolRecordFormProps } from "@/pages/monitor/MonitorSchoolRecordForm";

function buildProps(overrides: Partial<MonitorSchoolRecordFormProps> = {}): MonitorSchoolRecordFormProps {
  return {
    show: true,
    editingRecordId: null,
    isSaving: false,
    recordForm: {
      schoolId: "",
      schoolName: "",
      level: "Elementary",
      type: "public",
      district: "",
      region: "",
      address: "",
      createSchoolHeadAccount: true,
      schoolHeadAccountName: "",
      schoolHeadAccountEmail: "",
    },
    recordFormErrors: {},
    recordFormError: "",
    recordFormMessage: "",
    recordFormProvisioning: null,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    onFieldChange: vi.fn(),
    onCreateSchoolHeadAccountChange: vi.fn(),
    onCopyTemporaryPassword: vi.fn(),
    ...overrides,
  };
}

describe("MonitorSchoolRecordForm", () => {
  it("shows the public submission requirement hint by default", () => {
    render(<MonitorSchoolRecordForm {...buildProps()} />);

    expect(
      screen.getByText("Public School Head workspace uses BMEF and SMEA as the active package requirements."),
    ).toBeTruthy();
  });

  it("renders the private submission requirement hint for private schools", () => {
    render(
      <MonitorSchoolRecordForm
        {...buildProps({
          recordForm: {
            schoolId: "",
            schoolName: "",
            level: "Elementary",
            type: "private",
            district: "",
            region: "",
            address: "",
            createSchoolHeadAccount: true,
            schoolHeadAccountName: "",
            schoolHeadAccountEmail: "",
          },
        })}
      />,
    );

    expect(
      screen.getByText("Private School Head workspace uses FM-QAD uploads only. BMEF and SMEA are not part of the active package."),
    ).toBeTruthy();
  });

  it("explains that temporary passwords remain visible to the monitor until the first password change", () => {
    render(<MonitorSchoolRecordForm {...buildProps()} />);

    expect(
      screen.getAllByText(
        "A temporary password will be generated after save. The School Head must change it on first login, and it remains visible in the monitor panel until then.",
      ).length,
    ).toBeGreaterThan(0);
  });
});
