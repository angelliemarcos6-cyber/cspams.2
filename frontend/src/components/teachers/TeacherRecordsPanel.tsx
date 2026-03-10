import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, Edit2, Filter, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { useTeacherData } from "@/context/TeacherData";
import type { TeacherRecord, TeacherRecordPayload } from "@/types";

interface TeacherRecordsPanelProps {
  editable: boolean;
  title?: string;
  description?: string;
  showSchoolColumn?: boolean;
  schoolFilterKeys?: Set<string> | null;
}

interface TeacherFormState {
  name: string;
  sex: "" | "male" | "female";
}

const EMPTY_FORM: TeacherFormState = {
  name: "",
  sex: "",
};

const TEACHER_PAGE_SIZE = 10;

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function normalizeSchoolKey(schoolCode: string | null | undefined, schoolName: string | null | undefined): string {
  const code = schoolCode?.trim().toLowerCase();
  if (code) return `code:${code}`;

  const name = schoolName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return "unknown";
}

export function TeacherRecordsPanel({
  editable,
  title = "Teacher Records History",
  description = "Manage teacher records for student assignment dropdowns.",
  showSchoolColumn = false,
  schoolFilterKeys = null,
}: TeacherRecordsPanelProps) {
  const { teachers, isLoading, isSaving, error, lastSyncedAt, refreshTeachers, addTeacher, updateTeacher, deleteTeacher } = useTeacherData();

  const [search, setSearch] = useState("");
  const [sexFilter, setSexFilter] = useState<"all" | "male" | "female">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TeacherFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const scopedTeachers = useMemo(() => {
    if (!schoolFilterKeys) {
      return teachers;
    }

    if (schoolFilterKeys.size === 0) {
      return [];
    }

    return teachers.filter((teacher) =>
      schoolFilterKeys.has(
        normalizeSchoolKey(teacher.school?.schoolCode ?? null, teacher.school?.name ?? null),
      ),
    );
  }, [teachers, schoolFilterKeys]);

  const filteredTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return scopedTeachers
      .filter((teacher) => {
        const matchesSearch =
          query.length === 0 ||
          teacher.name.toLowerCase().includes(query) ||
          (teacher.school?.schoolCode ?? "").toLowerCase().includes(query) ||
          (teacher.school?.name ?? "").toLowerCase().includes(query);
        const matchesSex = sexFilter === "all" || teacher.sex === sexFilter;
        return matchesSearch && matchesSex;
      })
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime());
  }, [scopedTeachers, search, sexFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / TEACHER_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedTeachers = useMemo(() => {
    const start = (safePage - 1) * TEACHER_PAGE_SIZE;
    return filteredTeachers.slice(start, start + TEACHER_PAGE_SIZE);
  }, [filteredTeachers, safePage]);

  useEffect(() => {
    setPage(1);
  }, [search, sexFilter, schoolFilterKeys]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

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

  const openEdit = (teacher: TeacherRecord) => {
    setEditingId(teacher.id);
    setForm({
      name: teacher.name,
      sex: teacher.sex ?? "",
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
    if (!form.name.trim()) {
      setFormError("Teacher name is required.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setFormMessage("");

    if (!validateForm()) return;

    const payload: TeacherRecordPayload = {
      name: form.name.trim(),
      sex: form.sex || null,
    };

    try {
      if (editingId) {
        await updateTeacher(editingId, payload);
        setFormMessage("Teacher record updated.");
      } else {
        await addTeacher(payload);
        setFormMessage("Teacher record added.");
      }

      setTimeout(() => {
        closeForm();
      }, 800);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save teacher record.");
    }
  };

  const handleDelete = async (teacher: TeacherRecord) => {
    const confirmed = window.confirm(`Delete ${teacher.name}?`);
    if (!confirmed) return;

    setDeletingId(teacher.id);
    setFormMessage("");
    try {
      await deleteTeacher(teacher.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to delete teacher record.");
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
              onClick={() => void refreshTeachers()}
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
                Add Teacher
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
            placeholder="Search teacher, school code, school name"
            className="w-full rounded-sm border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
        </div>
        <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={sexFilter}
            onChange={(event) => setSexFilter(event.target.value as "all" | "male" | "female")}
            className="border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
          >
            <option value="all">All sex</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
          Showing {filteredTeachers.length} of {scopedTeachers.length}
        </div>
      </div>

      {(error || formError) && (
        <div className="mx-5 mt-4 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          {formError || error}
        </div>
      )}
      {formMessage && (
        <div className="mx-5 mt-4 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
          {formMessage}
        </div>
      )}

      {editable && showForm && (
        <section className="mx-5 mt-4 overflow-hidden rounded-sm border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">{editingId ? "Edit Teacher" : "Add Teacher"}</h3>
            <button
              type="button"
              onClick={closeForm}
              className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
              Close
            </button>
          </div>
          <form className="grid gap-3 p-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <input
              className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm"
              placeholder="Teacher Name *"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
            <select
              className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm"
              value={form.sex}
              onChange={(event) => setForm((current) => ({ ...current, sex: event.target.value as "" | "male" | "female" }))}
            >
              <option value="">Sex</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : editingId ? "Save Teacher" : "Create Teacher"}
              </button>
            </div>
          </form>
        </section>
      )}

      {isLoading && teachers.length === 0 ? (
        <div className="space-y-3 px-5 py-5">
          <div className="skeleton-line h-4 w-48" />
          <div className="grid gap-2">
            <div className="skeleton-line h-12 w-full" />
            <div className="skeleton-line h-12 w-full" />
            <div className="skeleton-line h-12 w-full" />
          </div>
        </div>
      ) : filteredTeachers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-slate-500">
          <AlertCircle className="h-9 w-9 text-slate-400" />
          <p className="text-sm font-semibold">
            {schoolFilterKeys ? "No teacher records for this school scope" : "No teacher records found"}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 px-4 py-4 md:hidden">
            {paginatedTeachers.map((teacher) => (
              <article key={teacher.id} className="rounded-sm border border-slate-200 bg-white p-3">
                {showSchoolColumn && (
                  <p className="text-xs text-slate-500">
                    {teacher.school?.schoolCode ?? "N/A"} - {teacher.school?.name ?? "N/A"}
                  </p>
                )}
                <p className="text-sm font-semibold text-slate-900">{teacher.name}</p>
                <p className="mt-1 text-xs text-slate-600">Sex: {teacher.sex ? teacher.sex.charAt(0).toUpperCase() + teacher.sex.slice(1) : "N/A"}</p>
                <p className="mt-1 text-xs text-slate-500">Updated {formatDateTime(teacher.updatedAt)}</p>
                {editable && (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(teacher)}
                      className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary hover:bg-primary-50 hover:text-primary"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(teacher)}
                      disabled={deletingId === teacher.id}
                      className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingId === teacher.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto px-5 py-4 md:block">
            <table className="min-w-full">
              <thead className="table-head-sticky">
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {showSchoolColumn && <th className="px-2 py-2 text-left">School</th>}
                  <th className="px-2 py-2 text-left">Name</th>
                  <th className="px-2 py-2 text-left">Sex</th>
                  <th className="px-2 py-2 text-left">Last Updated</th>
                  {editable && <th className="px-2 py-2 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTeachers.map((teacher) => (
                  <tr key={teacher.id}>
                    {showSchoolColumn && (
                      <td className="px-2 py-2">
                        <p className="text-sm font-semibold text-slate-900">{teacher.school?.name ?? "N/A"}</p>
                        <p className="text-xs text-slate-500">{teacher.school?.schoolCode ?? ""}</p>
                      </td>
                    )}
                    <td className="px-2 py-2 text-sm font-semibold text-slate-900">{teacher.name}</td>
                    <td className="px-2 py-2 text-sm text-slate-700">{teacher.sex ? teacher.sex.charAt(0).toUpperCase() + teacher.sex.slice(1) : "N/A"}</td>
                    <td className="px-2 py-2 text-sm text-slate-600">{formatDateTime(teacher.updatedAt)}</td>
                    {editable && (
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(teacher)}
                            className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary hover:bg-primary-50 hover:text-primary"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(teacher)}
                            disabled={deletingId === teacher.id}
                            className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingId === teacher.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-600">
              Page <span className="font-semibold text-slate-900">{safePage}</span> of{" "}
              <span className="font-semibold text-slate-900">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
                className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage >= totalPages}
                className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

