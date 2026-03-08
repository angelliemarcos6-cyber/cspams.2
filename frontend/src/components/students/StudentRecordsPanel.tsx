import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, Edit2, Filter, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { useStudentData } from "@/context/StudentData";
import type { StudentEnrollmentStatus, StudentRecord, StudentRecordPayload } from "@/types";

interface StudentRecordsPanelProps {
  editable: boolean;
  title?: string;
  description?: string;
  showSchoolColumn?: boolean;
}

interface StudentFormState {
  lrn: string;
  firstName: string;
  middleName: string;
  lastName: string;
  sex: "" | "male" | "female";
  birthDate: string;
  section: string;
  teacher: string;
  currentLevel: string;
  trackedFromLevel: string;
  status: StudentEnrollmentStatus;
  riskLevel: "none" | "low" | "medium" | "high";
}

const STATUS_OPTIONS: Array<{ value: StudentEnrollmentStatus; label: string }> = [
  { value: "enrolled", label: "Enrolled" },
  { value: "returning", label: "Returning" },
  { value: "at_risk", label: "At-Risk" },
  { value: "dropped_out", label: "Dropped" },
  { value: "transferee", label: "Transferred" },
  { value: "on_hold", label: "On Hold" },
  { value: "completer", label: "Completed" },
  { value: "graduated", label: "Graduated" },
];

const EMPTY_FORM: StudentFormState = {
  lrn: "",
  firstName: "",
  middleName: "",
  lastName: "",
  sex: "",
  birthDate: "",
  section: "",
  teacher: "",
  currentLevel: "",
  trackedFromLevel: "Kindergarten",
  status: "enrolled",
  riskLevel: "low",
};

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function statusTone(status: string): string {
  if (status === "enrolled" || status === "returning" || status === "completer" || status === "graduated") {
    return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300";
  }
  if (status === "dropped_out") {
    return "bg-rose-100 text-rose-700 ring-1 ring-rose-300";
  }
  if (status === "transferee") {
    return "bg-cyan-100 text-cyan-700 ring-1 ring-cyan-300";
  }
  return "bg-amber-100 text-amber-700 ring-1 ring-amber-300";
}

export function StudentRecordsPanel({
  editable,
  title = "Student Records",
  description = "Manage learner personal information and school status records.",
  showSchoolColumn = false,
}: StudentRecordsPanelProps) {
  const { students, isLoading, isSaving, error, lastSyncedAt, refreshStudents, addStudent, updateStudent, deleteStudent } = useStudentData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentEnrollmentStatus | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StudentFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    return students
      .filter((student) => {
        const matchesSearch =
          query.length === 0 ||
          student.lrn.toLowerCase().includes(query) ||
          student.fullName.toLowerCase().includes(query) ||
          (student.section ?? "").toLowerCase().includes(query) ||
          (student.teacher ?? "").toLowerCase().includes(query) ||
          (student.school?.schoolCode ?? "").toLowerCase().includes(query) ||
          (student.school?.name ?? "").toLowerCase().includes(query);
        const matchesStatus = statusFilter === "all" || student.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime());
  }, [students, search, statusFilter]);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormMessage("");
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (student: StudentRecord) => {
    setEditingId(student.id);
    setForm({
      lrn: student.lrn,
      firstName: student.firstName,
      middleName: student.middleName ?? "",
      lastName: student.lastName,
      sex: student.sex ?? "",
      birthDate: student.birthDate ?? "",
      section: student.section ?? "",
      teacher: student.teacher ?? "",
      currentLevel: student.currentLevel ?? "",
      trackedFromLevel: student.trackedFromLevel ?? "Kindergarten",
      status: (student.status as StudentEnrollmentStatus) ?? "enrolled",
      riskLevel: (student.riskLevel as "none" | "low" | "medium" | "high") ?? "low",
    });
    setFormError("");
    setFormMessage("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const validateForm = (): boolean => {
    if (!form.lrn.trim() || !form.firstName.trim() || !form.lastName.trim()) {
      setFormError("LRN, first name, and last name are required.");
      return false;
    }

    if (form.birthDate) {
      const birth = new Date(form.birthDate);
      const now = new Date();
      if (Number.isNaN(birth.getTime()) || birth > now) {
        setFormError("Birth date must be a valid date not later than today.");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setFormMessage("");

    if (!validateForm()) return;

    const payload: StudentRecordPayload = {
      lrn: form.lrn.trim(),
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim() || null,
      lastName: form.lastName.trim(),
      sex: form.sex || null,
      birthDate: form.birthDate || null,
      status: form.status,
      riskLevel: form.riskLevel,
      section: form.section.trim() || null,
      teacher: form.teacher.trim() || null,
      currentLevel: form.currentLevel.trim() || null,
      trackedFromLevel: form.trackedFromLevel.trim() || null,
    };

    try {
      if (editingId) {
        await updateStudent(editingId, payload);
        setFormMessage("Student record updated.");
      } else {
        await addStudent(payload);
        setFormMessage("Student record added.");
      }

      setTimeout(() => {
        closeForm();
      }, 800);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save student record.");
    }
  };

  const handleDelete = async (student: StudentRecord) => {
    const confirmed = window.confirm(`Delete ${student.fullName}?`);
    if (!confirmed) return;

    setDeletingId(student.id);
    setFormMessage("");
    try {
      await deleteStudent(student.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to delete student record.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden rounded-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshStudents()}
              className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            {editable && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Student
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : "Not synced yet"}
        </p>
      </div>

      <div className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search LRN, name, section, teacher, school code"
            className="w-full rounded-sm border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StudentEnrollmentStatus | "all")}
            className="border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
          >
            <option value="all">All status</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
          Showing {filteredStudents.length} of {students.length}
        </div>
      </div>

      {(error || formError) && (
        <div className="mx-5 mt-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {formError || error}
        </div>
      )}
      {formMessage && (
        <div className="mx-5 mt-4 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          {formMessage}
        </div>
      )}

      {editable && showForm && (
        <section className="mx-5 mt-4 overflow-hidden rounded-sm border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">{editingId ? "Edit Student" : "Add Student"}</h3>
            <button
              type="button"
              onClick={closeForm}
              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
          </div>
          <form className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleSubmit}>
            <input className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" placeholder="LRN *" value={form.lrn} onChange={(event) => setForm((current) => ({ ...current, lrn: event.target.value }))} />
            <input className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" placeholder="First Name *" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} />
            <input className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" placeholder="Middle Name" value={form.middleName} onChange={(event) => setForm((current) => ({ ...current, middleName: event.target.value }))} />
            <input className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" placeholder="Last Name *" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} />
            <select className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" value={form.sex} onChange={(event) => setForm((current) => ({ ...current, sex: event.target.value as "" | "male" | "female" }))}>
              <option value="">Sex</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <input className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" type="date" value={form.birthDate} onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))} />
            <input className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" placeholder="Section" value={form.section} onChange={(event) => setForm((current) => ({ ...current, section: event.target.value }))} />
            <input className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" placeholder="Teacher" value={form.teacher} onChange={(event) => setForm((current) => ({ ...current, teacher: event.target.value }))} />
            <input className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" placeholder="Current Level / Grade" value={form.currentLevel} onChange={(event) => setForm((current) => ({ ...current, currentLevel: event.target.value }))} />
            <select className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as StudentEnrollmentStatus }))}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" value={form.riskLevel} onChange={(event) => setForm((current) => ({ ...current, riskLevel: event.target.value as "none" | "low" | "medium" | "high" }))}>
              <option value="none">Risk: None</option>
              <option value="low">Risk: Low</option>
              <option value="medium">Risk: Medium</option>
              <option value="high">Risk: High</option>
            </select>
            <input className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm" placeholder="Tracked From Level" value={form.trackedFromLevel} onChange={(event) => setForm((current) => ({ ...current, trackedFromLevel: event.target.value }))} />
            <div className="xl:col-span-4">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : editingId ? "Save Student" : "Create Student"}
              </button>
            </div>
          </form>
        </section>
      )}

      {isLoading && students.length === 0 ? (
        <div className="space-y-3 px-5 py-5">
          <div className="skeleton-line h-4 w-48" />
          <div className="grid gap-2">
            <div className="skeleton-line h-12 w-full" />
            <div className="skeleton-line h-12 w-full" />
            <div className="skeleton-line h-12 w-full" />
          </div>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-slate-500">
          <AlertCircle className="h-9 w-9 text-slate-400" />
          <p className="text-sm font-semibold">No student records found</p>
        </div>
      ) : (
        <div className="overflow-x-auto px-5 py-4">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {showSchoolColumn && <th className="px-2 py-2 text-left">School</th>}
                <th className="px-2 py-2 text-left">LRN</th>
                <th className="px-2 py-2 text-left">Name</th>
                <th className="px-2 py-2 text-center">Age</th>
                <th className="px-2 py-2 text-left">Sex</th>
                <th className="px-2 py-2 text-left">Section</th>
                <th className="px-2 py-2 text-left">Teacher</th>
                <th className="px-2 py-2 text-center">Status</th>
                <th className="px-2 py-2 text-left">Last Updated</th>
                {editable && <th className="px-2 py-2 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map((student) => (
                <tr key={student.id}>
                  {showSchoolColumn && (
                    <td className="px-2 py-2">
                      <p className="text-sm font-semibold text-slate-900">{student.school?.name ?? "N/A"}</p>
                      <p className="text-xs text-slate-500">{student.school?.schoolCode ?? ""}</p>
                    </td>
                  )}
                  <td className="px-2 py-2 text-sm font-semibold text-slate-900">{student.lrn}</td>
                  <td className="px-2 py-2 text-sm text-slate-700">{student.fullName}</td>
                  <td className="px-2 py-2 text-center text-sm text-slate-700">{student.age ?? "N/A"}</td>
                  <td className="px-2 py-2 text-sm text-slate-700">{student.sex ? `${student.sex.charAt(0).toUpperCase()}${student.sex.slice(1)}` : "N/A"}</td>
                  <td className="px-2 py-2 text-sm text-slate-700">{student.section ?? student.currentLevel ?? "N/A"}</td>
                  <td className="px-2 py-2 text-sm text-slate-700">{student.teacher ?? "N/A"}</td>
                  <td className="px-2 py-2 text-center">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${statusTone(student.status)}`}>
                      {student.statusLabel}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-sm text-slate-600">{formatDateTime(student.updatedAt)}</td>
                  {editable && (
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(student)}
                          className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary hover:bg-primary-50 hover:text-primary"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(student)}
                          disabled={deletingId === student.id}
                          className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {deletingId === student.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
