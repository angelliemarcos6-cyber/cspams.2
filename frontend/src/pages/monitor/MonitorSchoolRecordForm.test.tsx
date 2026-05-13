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
      screen.getByText("School Head will submit fillable forms, BMEF, and SMEA."),
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
      screen.getByText("School Head will submit fillable forms and the required FM-QAD files."),
    ).toBeTruthy();
  });
});
