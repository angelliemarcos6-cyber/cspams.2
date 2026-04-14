import { useCallback, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { isApiError } from "@/lib/api";
import type {
  MonitorSchoolRecordFormField,
  MonitorSchoolRecordFormProps,
  MonitorSchoolRecordFormState,
} from "@/pages/monitor/MonitorSchoolRecordForm";
import type { SchoolHeadAccountProvisioningReceipt, SchoolRecordPayload } from "@/types";

const EMPTY_MONITOR_RECORD_FORM: MonitorSchoolRecordFormState = {
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
};

function extractApiValidationErrors(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object" || !("errors" in payload)) {
    return {};
  }

  const rawErrors = (payload as { errors?: unknown }).errors;
  if (!rawErrors || typeof rawErrors !== "object") {
    return {};
  }

  const fieldErrors: Record<string, string> = {};
  for (const [field, value] of Object.entries(rawErrors as Record<string, unknown>)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
      fieldErrors[field] = value[0];
      continue;
    }

    if (typeof value === "string") {
      fieldErrors[field] = value;
    }
  }

  return fieldErrors;
}

interface UseMonitorSchoolRecordFormOptions {
  isSaving: boolean;
  setActiveTopNavigator: Dispatch<SetStateAction<"overview" | "schools" | "reviews">>;
  addRecord: (record: SchoolRecordPayload) => Promise<SchoolHeadAccountProvisioningReceipt | null>;
  updateRecord: (id: string, updates: SchoolRecordPayload) => Promise<void>;
  clearDeleteError: () => void;
  clearBulkImportError: () => void;
  clearBulkImportFeedback: () => void;
}

export interface UseMonitorSchoolRecordFormResult {
  showRecordForm: boolean;
  editingRecordId: string | null;
  openCreateRecordForm: () => void;
  closeRecordForm: () => void;
  schoolRecordFormProps: MonitorSchoolRecordFormProps;
}

export function useMonitorSchoolRecordForm({
  isSaving,
  setActiveTopNavigator,
  addRecord,
  updateRecord,
  clearDeleteError,
  clearBulkImportError,
  clearBulkImportFeedback,
}: UseMonitorSchoolRecordFormOptions): UseMonitorSchoolRecordFormResult {
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [recordForm, setRecordForm] = useState<MonitorSchoolRecordFormState>(EMPTY_MONITOR_RECORD_FORM);
  const [recordFormErrors, setRecordFormErrors] = useState<Partial<Record<MonitorSchoolRecordFormField, string>>>({});
  const [recordFormError, setRecordFormError] = useState("");
  const [recordFormMessage, setRecordFormMessage] = useState("");

  const resetRecordForm = useCallback(() => {
    setEditingRecordId(null);
    setRecordForm(EMPTY_MONITOR_RECORD_FORM);
    setRecordFormErrors({});
    setRecordFormError("");
    setRecordFormMessage("");
  }, []);

  const openCreateRecordForm = useCallback(() => {
    resetRecordForm();
    clearDeleteError();
    clearBulkImportFeedback();
    setActiveTopNavigator("schools");
    setShowRecordForm(true);
  }, [clearBulkImportFeedback, clearDeleteError, resetRecordForm, setActiveTopNavigator]);

  const closeRecordForm = useCallback(() => {
    setShowRecordForm(false);
    resetRecordForm();
  }, [resetRecordForm]);

  const validateRecordForm = useCallback((): boolean => {
    const formErrors: Partial<Record<MonitorSchoolRecordFormField, string>> = {};
    const schoolId = recordForm.schoolId.trim().toUpperCase();
    const schoolName = recordForm.schoolName.trim();
    const level = recordForm.level.trim();
    const district = recordForm.district.trim();
    const region = recordForm.region.trim();
    const address = recordForm.address.trim();

    if (!/^\d{6}$/.test(schoolId)) {
      formErrors.schoolId = "School Code must be exactly 6 digits.";
    }

    if (!schoolName) formErrors.schoolName = "School name is required.";
    if (!level) formErrors.level = "Level is required.";
    if (!address) formErrors.address = "Address is required.";
    if (!recordForm.type) formErrors.type = "Type is required.";

    if (district.length > 255) formErrors.district = "District must be 255 characters or less.";
    if (region.length > 255) formErrors.region = "Region must be 255 characters or less.";

    if (!editingRecordId && recordForm.createSchoolHeadAccount) {
      if (!recordForm.schoolHeadAccountName.trim()) {
        formErrors.schoolHeadAccountName = "Account name is required.";
      }

      if (!recordForm.schoolHeadAccountEmail.trim()) {
        formErrors.schoolHeadAccountEmail = "Email is required.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recordForm.schoolHeadAccountEmail.trim())) {
        formErrors.schoolHeadAccountEmail = "Use a valid email address.";
      }
    }

    setRecordFormErrors(formErrors);
    if (Object.keys(formErrors).length > 0) {
      setRecordFormError("Please fix the highlighted fields.");
      return false;
    }

    setRecordFormError("");
    return true;
  }, [editingRecordId, recordForm]);

  const handleRecordSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setRecordFormErrors({});
      setRecordFormError("");
      setRecordFormMessage("");
      clearDeleteError();
      clearBulkImportError();

      if (!validateRecordForm()) {
        return;
      }

      const payload: SchoolRecordPayload = {
        schoolId: recordForm.schoolId.trim().toUpperCase(),
        schoolName: recordForm.schoolName.trim(),
        level: recordForm.level.trim(),
        type: recordForm.type,
        address: recordForm.address.trim(),
        district: recordForm.district.trim() || undefined,
        region: recordForm.region.trim() || undefined,
        schoolHeadAccount:
          !editingRecordId && recordForm.createSchoolHeadAccount
            ? {
                name: recordForm.schoolHeadAccountName.trim(),
                email: recordForm.schoolHeadAccountEmail.trim(),
              }
            : undefined,
      };

      try {
        if (editingRecordId) {
          await updateRecord(editingRecordId, payload);
          setRecordFormMessage("School record updated.");
        } else {
          const provisioning = await addRecord(payload);
          const deliveryFailed = String(provisioning?.setupLinkDelivery ?? "").toLowerCase() === "failed";
          setRecordFormMessage(
            provisioning
              ? deliveryFailed
                ? "School record created. The setup email could not be delivered to the School Head account."
                : "School record created. A setup email was sent to the School Head account."
              : "School record created.",
          );
        }

        window.setTimeout(() => {
          closeRecordForm();
        }, 800);
      } catch (err) {
        if (isApiError(err)) {
          const apiFieldErrors = extractApiValidationErrors(err.payload);
          if (Object.keys(apiFieldErrors).length > 0) {
            const mappedErrors: Partial<Record<MonitorSchoolRecordFormField, string>> = {};
            for (const [field, message] of Object.entries(apiFieldErrors)) {
              if (field === "schoolHeadAccount.name") mappedErrors.schoolHeadAccountName = message;
              else if (field === "schoolHeadAccount.email") mappedErrors.schoolHeadAccountEmail = message;
              else if (
                field === "schoolId" ||
                field === "schoolName" ||
                field === "level" ||
                field === "type" ||
                field === "district" ||
                field === "region" ||
                field === "address"
              ) {
                mappedErrors[field as MonitorSchoolRecordFormField] = message;
              }
            }

            if (Object.keys(mappedErrors).length > 0) {
              setRecordFormErrors(mappedErrors);
              setRecordFormError("Please fix the highlighted fields.");
              return;
            }
          }
        }

        setRecordFormError(err instanceof Error ? err.message : "Unable to save school record.");
      }
    },
    [addRecord, clearBulkImportError, clearDeleteError, closeRecordForm, editingRecordId, recordForm, updateRecord, validateRecordForm],
  );

  const handleRecordFormFieldChange = useCallback((field: MonitorSchoolRecordFormField, value: string) => {
    let normalizedValue = value;

    if (field === "schoolId") {
      normalizedValue = value.replace(/\D+/g, "").slice(0, 6);
    }

    if (field === "type") {
      normalizedValue = value === "private" ? "private" : "public";
    }

    setRecordForm((current) => ({ ...current, [field]: normalizedValue }));
    setRecordFormErrors((current) => ({ ...current, [field]: undefined }));
  }, []);

  const handleCreateSchoolHeadAccountChange = useCallback((checked: boolean) => {
    setRecordForm((current) => ({
      ...current,
      createSchoolHeadAccount: checked,
    }));
  }, []);

  return {
    showRecordForm,
    editingRecordId,
    openCreateRecordForm,
    closeRecordForm,
    schoolRecordFormProps: {
      show: showRecordForm,
      editingRecordId,
      isSaving,
      recordForm,
      recordFormErrors,
      recordFormError,
      recordFormMessage,
      onClose: closeRecordForm,
      onSubmit: handleRecordSubmit,
      onFieldChange: handleRecordFormFieldChange,
      onCreateSchoolHeadAccountChange: handleCreateSchoolHeadAccountChange,
    },
  };
}
