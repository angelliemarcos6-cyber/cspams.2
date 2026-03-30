import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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

const TEACHER_PAGE_SIZE = 100;
const SEARCH_DEBOUNCE_MS = 280;
const TEACHER_TABLE_ROW_HEIGHT_PX = 54;
const TEACHER_TABLE_OVERSCAN_ROWS = 8;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return debouncedValue;
}

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function extractSchoolCodes(filterKeys: Set<string> | null | undefined): string[] {
  if (!filterKeys || filterKeys.size === 0) {
    return [];
  }

  const codes = new Set<string>();
  for (const key of filterKeys) {
    if (!key.startsWith("code:")) continue;

    const code = key.slice(5).trim().toUpperCase();
    if (code) {
      codes.add(code);
    }
  }

  return [...codes];
}

export function TeacherRecordsPanel({
  editable,
  title = "Teacher Records History",
  description = "Manage teacher records for student assignment dropdowns.",
  showSchoolColumn = false,
  schoolFilterKeys = null,
}: TeacherRecordsPanelProps) {
  const {
    isLoading,
    isSaving,
    error,
    lastSyncedAt,
    refreshTeachers,
    listTeachers,
    addTeacher,
    updateTeacher,
    deleteTeacher,
  } = useTeacherData();

  useEffect(() => {
    void refreshTeachers();
  }, [refreshTeachers]);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [sexFilter, setSexFilter] = useState<"all" | "male" | "female">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TeacherFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pagedTeachers, setPagedTeachers] = useState<TeacherRecord[]>([]);
  const [totalTeachers, setTotalTeachers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const scopedSchoolCodes = useMemo(() => extractSchoolCodes(schoolFilterKeys), [schoolFilterKeys]);
  const pageAbortRef = useRef<AbortController | null>(null);
  const pageRequestIdRef = useRef(0);
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [tableViewportHeight, setTableViewportHeight] = useState(0);
  const [tableScrollTop, setTableScrollTop] = useState(0);

  const loadTeachersPage = useCallback(
    async (nextPage: number, silent = false) => {
      if (schoolFilterKeys && schoolFilterKeys.size > 0 && scopedSchoolCodes.length === 0) {
        pageRequestIdRef.current += 1;
        pageAbortRef.current?.abort();
        pageAbortRef.current = null;
        setPagedTeachers([]);
        setTotalTeachers(0);
        setTotalPages(1);
        setPageError("This school scope is missing a supported school code.");
        if (nextPage !== 1) {
          setPage(1);
        }
        return;
      }

      if (!silent) {
        setIsPageLoading(true);
      }

      if (pageAbortRef.current) {
        pageAbortRef.current.abort();
      }
      const controller = new AbortController();
      pageAbortRef.current = controller;
      const requestId = ++pageRequestIdRef.current;
      setPageError("");

      try {
        const result = await listTeachers({
          page: nextPage,
          perPage: TEACHER_PAGE_SIZE,
          search: debouncedSearch.trim() || null,
          sex: sexFilter === "all" ? null : sexFilter,
          schoolCodes: schoolFilterKeys ? scopedSchoolCodes : null,
          signal: controller.signal,
        });

        if (controller.signal.aborted || requestId !== pageRequestIdRef.current) {
          return;
        }

        setPagedTeachers(result.data);
        setTotalTeachers(result.meta.total);
        setTotalPages(Math.max(1, result.meta.lastPage));

        if (result.meta.currentPage !== nextPage) {
          setPage(result.meta.currentPage);
        }
      } catch (err) {
        if (controller.signal.aborted || requestId !== pageRequestIdRef.current) {
          return;
        }
        setPagedTeachers([]);
        setTotalTeachers(0);
        setTotalPages(1);
        setPageError(err instanceof Error ? err.message : "Unable to load teacher records.");
      } finally {
        if (pageAbortRef.current === controller) {
          pageAbortRef.current = null;
        }
        if (!silent && requestId === pageRequestIdRef.current) {
          setIsPageLoading(false);
        }
      }
    },
    [listTeachers, schoolFilterKeys, scopedSchoolCodes, debouncedSearch, sexFilter],
  );

  const safePage = Math.max(1, Math.min(page, totalPages));
  const paginatedTeachers = pagedTeachers;
  const desktopTableColumnCount =
    (showSchoolColumn ? 1 : 0)
    + 3
    + (editable ? 1 : 0);
  const virtualTeacherWindow = useMemo(() => {
    if (paginatedTeachers.length === 0) {
      return {
        startIndex: 0,
        endIndexExclusive: 0,
        topPaddingPx: 0,
        bottomPaddingPx: 0,
      };
    }

    const visibleRows = tableViewportHeight > 0
      ? Math.ceil(tableViewportHeight / TEACHER_TABLE_ROW_HEIGHT_PX)
      : paginatedTeachers.length;
    const startIndex = Math.max(0, Math.floor(tableScrollTop / TEACHER_TABLE_ROW_HEIGHT_PX) - TEACHER_TABLE_OVERSCAN_ROWS);
    const endIndexExclusive = Math.min(
      paginatedTeachers.length,
      startIndex + visibleRows + TEACHER_TABLE_OVERSCAN_ROWS * 2,
    );
    const topPaddingPx = startIndex * TEACHER_TABLE_ROW_HEIGHT_PX;
    const bottomPaddingPx = Math.max(
      0,
      (paginatedTeachers.length - endIndexExclusive) * TEACHER_TABLE_ROW_HEIGHT_PX,
    );

    return {
      startIndex,
      endIndexExclusive,
      topPaddingPx,
      bottomPaddingPx,
    };
  }, [paginatedTeachers.length, tableScrollTop, tableViewportHeight]);
  const virtualizedTeachers = useMemo(
    () => paginatedTeachers.slice(virtualTeacherWindow.startIndex, virtualTeacherWindow.endIndexExclusive),
    [paginatedTeachers, virtualTeacherWindow.endIndexExclusive, virtualTeacherWindow.startIndex],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sexFilter, schoolFilterKeys, scopedSchoolCodes]);

  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) {
      return;
    }

    const updateSize = () => setTableViewportHeight(viewport.clientHeight);
    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(viewport);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    void loadTeachersPage(page, false);
  }, [page, loadTeachersPage]);

  useEffect(() => () => {
    pageAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    tableViewportRef.current?.scrollTo({ top: 0 });
    setTableScrollTop(0);
  }, [page, debouncedSearch, sexFilter, schoolFilterKeys, scopedSchoolCodes]);

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
        await loadTeachersPage(page, true);
        setFormMessage("Teacher record updated.");
      } else {
        await addTeacher(payload);
        await loadTeachersPage(1, true);
        setPage(1);
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
      await loadTeachersPage(page, true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to delete teacher record.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleRefresh = async () => {
    await refreshTeachers();
    await loadTeachersPage(page, true);
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
              onClick={() => void handleRefresh()}
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
          Showing {paginatedTeachers.length} of {totalTeachers}
        </div>
      </div>

      {(error || pageError || formError) && (
        <div className="mx-5 mt-4 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          {formError || pageError || error}
        </div>
      )}
      {formMessage && (
        <div className="mx-5 mt-4 rounded-sm border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700">
          {formMessage}
        </div>
      )}

      {editable && showForm && (
        <>
          <button
            type="button"
            aria-label="Close teacher form"
            onClick={closeForm}
            className="fixed inset-0 z-[88] bg-slate-900/40 md:hidden"
          />
          <section className="fixed inset-x-0 bottom-0 z-[89] max-h-[88dvh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl mobile-safe-bottom md:relative md:z-auto md:mx-5 md:mt-4 md:max-h-none md:overflow-hidden md:rounded-sm md:shadow-none">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 md:static">
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70 md:w-auto"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : editingId ? "Save Teacher" : "Create Teacher"}
              </button>
            </div>
          </form>
          </section>
        </>
      )}

      {(isLoading || isPageLoading) && paginatedTeachers.length === 0 ? (
        <div className="space-y-3 px-5 py-5">
          <div className="skeleton-line h-4 w-48" />
          <div className="grid gap-2">
            <div className="skeleton-line h-12 w-full" />
            <div className="skeleton-line h-12 w-full" />
            <div className="skeleton-line h-12 w-full" />
          </div>
        </div>
      ) : paginatedTeachers.length === 0 ? (
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

          <div className="hidden px-5 py-4 md:block">
            <div
              ref={tableViewportRef}
              onScroll={(event) => setTableScrollTop(event.currentTarget.scrollTop)}
              className="max-h-[64vh] overflow-auto"
            >
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
                  {virtualTeacherWindow.topPaddingPx > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={desktopTableColumnCount} className="border-0 p-0" style={{ height: `${virtualTeacherWindow.topPaddingPx}px` }} />
                    </tr>
                  )}
                  {virtualizedTeachers.map((teacher) => (
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
                  {virtualTeacherWindow.bottomPaddingPx > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={desktopTableColumnCount} className="border-0 p-0" style={{ height: `${virtualTeacherWindow.bottomPaddingPx}px` }} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
