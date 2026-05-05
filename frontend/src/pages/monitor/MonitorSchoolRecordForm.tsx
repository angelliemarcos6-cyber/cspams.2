import type { FormEvent } from "react";
import { Save, X } from "lucide-react";

const SCHOOL_LEVEL_OPTIONS = ["Elementary", "High School"] as const;

export interface MonitorSchoolRecordFormState {
  schoolId: string;
  schoolName: string;
  level: string;
  type: "public" | "private";
  district: string;
  region: string;
  address: string;
  createSchoolHeadAccount: boolean;
  schoolHeadAccountName: string;
  schoolHeadAccountEmail: string;
}

export type MonitorSchoolRecordFormField =
  | "schoolId"
  | "schoolName"
  | "level"
  | "type"
  | "district"
  | "region"
  | "address"
  | "schoolHeadAccountName"
  | "schoolHeadAccountEmail";

export interface MonitorSchoolRecordFormProps {
  show: boolean;
  editingRecordId: string | null;
  isSaving: boolean;
  recordForm: MonitorSchoolRecordFormState;
  recordFormErrors: Partial<Record<MonitorSchoolRecordFormField, string>>;
  recordFormError: string;
  recordFormMessage: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onFieldChange: (field: MonitorSchoolRecordFormField, value: string) => void;
  onCreateSchoolHeadAccountChange: (checked: boolean) => void;
}

export function MonitorSchoolRecordForm({
  show,
  editingRecordId,
  isSaving,
  recordForm,
  recordFormErrors,
  recordFormError,
  recordFormMessage,
  onClose,
  onSubmit,
  onFieldChange,
  onCreateSchoolHeadAccountChange,
}: MonitorSchoolRecordFormProps) {
  if (!show) {
    return null;
  }

  return (
    <section className="mx-5 mt-4 overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{editingRecordId ? "Edit School Record" : "Add School Record"}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            School Code must be 6 digits. School name, level, type, and address are required. Students, teachers, and
            status are managed by School Head.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          <X className="h-3.5 w-3.5" />
          Close
        </button>
      </div>
      <form className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={onSubmit}>
        <div>
          <label htmlFor="monitor-school-id" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            School Code
          </label>
          <input
            id="monitor-school-id"
            type="text"
            value={recordForm.schoolId}
            onChange={(event) => onFieldChange("schoolId", event.target.value)}
            placeholder="e.g. 103811"
            className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
              recordFormErrors.schoolId ? "border-primary-300" : "border-slate-200"
            }`}
          />
          {recordFormErrors.schoolId && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.schoolId}</p>}
        </div>
        <div>
          <label htmlFor="monitor-school-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            School Name
          </label>
          <input
            id="monitor-school-name"
            type="text"
            value={recordForm.schoolName}
            onChange={(event) => onFieldChange("schoolName", event.target.value)}
            className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
              recordFormErrors.schoolName ? "border-primary-300" : "border-slate-200"
            }`}
          />
          {recordFormErrors.schoolName && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.schoolName}</p>}
        </div>
        <div>
          <label htmlFor="monitor-level" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Level
          </label>
          <select
            id="monitor-level"
            value={recordForm.level}
            onChange={(event) => onFieldChange("level", event.target.value)}
            className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
              recordFormErrors.level ? "border-primary-300" : "border-slate-200"
            }`}
          >
            {SCHOOL_LEVEL_OPTIONS.map((levelOption) => (
              <option key={levelOption} value={levelOption}>
                {levelOption}
              </option>
            ))}
          </select>
          {recordFormErrors.level && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.level}</p>}
        </div>
        <div>
          <label htmlFor="monitor-type" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Type
          </label>
          <select
            id="monitor-type"
            value={recordForm.type}
            onChange={(event) => onFieldChange("type", event.target.value)}
            className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
              recordFormErrors.type ? "border-primary-300" : "border-slate-200"
            }`}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          {recordFormErrors.type && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.type}</p>}
        </div>
        <div>
          <label htmlFor="monitor-district" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            District
          </label>
          <input
            id="monitor-district"
            type="text"
            value={recordForm.district}
            onChange={(event) => onFieldChange("district", event.target.value)}
            className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
              recordFormErrors.district ? "border-primary-300" : "border-slate-200"
            }`}
          />
          {recordFormErrors.district && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.district}</p>}
        </div>
        <div>
          <label htmlFor="monitor-region" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Region
          </label>
          <input
            id="monitor-region"
            type="text"
            value={recordForm.region}
            onChange={(event) => onFieldChange("region", event.target.value)}
            placeholder="Leave blank to auto-derive from address"
            className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
              recordFormErrors.region ? "border-primary-300" : "border-slate-200"
            }`}
          />
          {recordFormErrors.region && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.region}</p>}
        </div>
        <div className="md:col-span-2 xl:col-span-2">
          <label htmlFor="monitor-address" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Address
          </label>
          <input
            id="monitor-address"
            type="text"
            value={recordForm.address}
            onChange={(event) => onFieldChange("address", event.target.value)}
            className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
              recordFormErrors.address ? "border-primary-300" : "border-slate-200"
            }`}
          />
          {recordFormErrors.address && <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.address}</p>}
        </div>
        {!editingRecordId && (
          <div className="md:col-span-2 xl:col-span-4 rounded-sm border border-slate-200 bg-slate-50 p-3">
            <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              <input
                type="checkbox"
                checked={recordForm.createSchoolHeadAccount}
                onChange={(event) => onCreateSchoolHeadAccountChange(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary-100"
              />
              Create School Head Account
            </label>
            {recordForm.createSchoolHeadAccount && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="monitor-account-name" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Account Name
                  </label>
                  <input
                    id="monitor-account-name"
                    type="text"
                    value={recordForm.schoolHeadAccountName}
                    onChange={(event) => onFieldChange("schoolHeadAccountName", event.target.value)}
                    className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
                      recordFormErrors.schoolHeadAccountName ? "border-primary-300" : "border-slate-200"
                    }`}
                  />
                  {recordFormErrors.schoolHeadAccountName && (
                    <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.schoolHeadAccountName}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="monitor-account-email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Account Email
                  </label>
                  <input
                    id="monitor-account-email"
                    type="email"
                    value={recordForm.schoolHeadAccountEmail}
                    onChange={(event) => onFieldChange("schoolHeadAccountEmail", event.target.value)}
                    className={`w-full rounded-sm border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100 ${
                      recordFormErrors.schoolHeadAccountEmail ? "border-primary-300" : "border-slate-200"
                    }`}
                  />
                  {recordFormErrors.schoolHeadAccountEmail && (
                    <p className="mt-1 text-[11px] font-medium text-primary-700">{recordFormErrors.schoolHeadAccountEmail}</p>
                  )}
                </div>
                <p className="md:col-span-2 rounded-sm border border-primary-100 bg-primary-50/70 px-3 py-2 text-xs font-semibold text-primary-800">
                  A one-time setup email/link (24h expiry) will be sent after save. The account becomes active + verified once
                  the School Head completes setup.
                </p>
              </div>
            )}
          </div>
        )}
        <div className="flex items-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : editingRecordId ? "Save Changes" : "Create Record"}
          </button>
        </div>
        {(recordFormError || recordFormMessage) && (
          <div className="md:col-span-2 xl:col-span-4">
            {recordFormError && (
              <p className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
                {recordFormError}
              </p>
            )}
            {recordFormMessage && (
              <p className="rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
                {recordFormMessage}
              </p>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
