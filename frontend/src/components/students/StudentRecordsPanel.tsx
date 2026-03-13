import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertCircle, CalendarDays, Edit2, Filter, History, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { useIndicatorData } from "@/context/IndicatorData";
import { useStudentData } from "@/context/StudentData";
import { useTeacherData } from "@/context/TeacherData";
import { isApiError } from "@/lib/api";
import type { StudentEnrollmentStatus, StudentRecord, StudentRecordPayload, StudentStatusHistoryEntry } from "@/types";

interface StudentRecordsPanelProps {
  editable: boolean;
  title?: string;
  description?: string;
  showSchoolColumn?: boolean;
  schoolFilterKeys?: Set<string> | null;
  externalSearchTerm?: string | null;
  defaultAcademicYearFilter?: "current" | "all";
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

interface TeacherSelectOption {
  value: string;
  label: string;
  isLegacy: boolean;
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

const STUDENT_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 280;
const HISTORY_PAGE_SIZE = 12;

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

function statusTone(status: string): string {
  if (status === "enrolled" || status === "returning" || status === "completer" || status === "graduated") {
    return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  }
  if (status === "dropped_out") {
    return "bg-rose-100 text-rose-700 ring-1 ring-rose-300";
  }
  if (status === "transferee") {
    return "bg-primary-100 text-primary-700 ring-1 ring-primary-300";
  }
  return "bg-slate-200 text-slate-700 ring-1 ring-slate-300";
}

function normalizeSchoolKey(schoolCode: string | null | undefined, schoolName: string | null | undefined): string {
  const code = schoolCode?.trim().toLowerCase();
  if (code) return `code:${code}`;

  const name = schoolName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return "unknown";
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

export function StudentRecordsPanel({
  editable,
  title = "Student Records",
  description = "Manage learner personal information and school status records.",
  showSchoolColumn = false,
  schoolFilterKeys = null,
  externalSearchTerm = null,
  defaultAcademicYearFilter = "current",
}: StudentRecordsPanelProps) {
  const {
    isLoading,
    isSaving,
    error,
    lastSyncedAt,
    dataVersion,
    listStudents,
    listStudentHistory,
    addStudent,
    updateStudent,
    deleteStudent,
    deleteStudents,
  } = useStudentData();
  const { academicYears } = useIndicatorData();
  const { teachers } = useTeacherData();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [statusFilter, setStatusFilter] = useState<StudentEnrollmentStatus | "all">("all");
  const [academicYearFilter, setAcademicYearFilter] = useState<string>(defaultAcademicYearFilter);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StudentFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [batchDeleteEnabled, setBatchDeleteEnabled] = useState(false);
  const [page, setPage] = useState(1);
  const [pagedStudents, setPagedStudents] = useState<StudentRecord[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const scopedSchoolCodes = useMemo(() => extractSchoolCodes(schoolFilterKeys), [schoolFilterKeys]);
  const studentDataVersionRef = useRef(0);
  const pageRequestIdRef = useRef(0);
  const historyRequestIdRef = useRef(0);
  const historyRefreshedVersionRef = useRef(0);
  const pageAbortRef = useRef<AbortController | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const [historyStudent, setHistoryStudent] = useState<StudentRecord | null>(null);
  const [historyEntries, setHistoryEntries] = useState<StudentStatusHistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historySyncedAt, setHistorySyncedAt] = useState<string | null>(null);
  const academicYearOptions = useMemo(
    () =>
      academicYears.map((year) => ({
        value: String(year.id),
        label: year.isCurrent ? `${year.name} (Current)` : year.name,
      })),
    [academicYears],
  );

  useEffect(() => {
    if (externalSearchTerm === null) return;
    setSearch(externalSearchTerm);
  }, [externalSearchTerm]);

  useEffect(() => {
    setAcademicYearFilter(defaultAcademicYearFilter);
  }, [defaultAcademicYearFilter]);

  const loadStudentsPage = useCallback(
    async (nextPage: number, silent = false) => {
      if (schoolFilterKeys && schoolFilterKeys.size > 0 && scopedSchoolCodes.length === 0) {
        pageRequestIdRef.current += 1;
        setPagedStudents([]);
        setTotalStudents(0);
        setTotalPages(1);
        setPageError("");
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
        const result = await listStudents({
          page: nextPage,
          perPage: STUDENT_PAGE_SIZE,
          search: debouncedSearch.trim() || null,
          status: statusFilter === "all" ? null : statusFilter,
          schoolCodes: schoolFilterKeys ? scopedSchoolCodes : null,
          academicYear: academicYearFilter,
          signal: controller.signal,
        });

        if (controller.signal.aborted || requestId !== pageRequestIdRef.current) {
          return;
        }

        setPagedStudents(result.data);
        setTotalStudents(result.meta.total);
        setTotalPages(Math.max(1, result.meta.lastPage));

        if (result.meta.currentPage !== nextPage) {
          setPage(result.meta.currentPage);
        }
      } catch (err) {
        if (controller.signal.aborted || requestId !== pageRequestIdRef.current) {
          return;
        }

        setPagedStudents([]);
        setTotalStudents(0);
        setTotalPages(1);
        setPageError(err instanceof Error ? err.message : "Unable to load student records.");
      } finally {
        if (pageAbortRef.current === controller) {
          pageAbortRef.current = null;
        }
        if (!silent && requestId === pageRequestIdRef.current) {
          setIsPageLoading(false);
        }
      }
    },
    [listStudents, schoolFilterKeys, scopedSchoolCodes, debouncedSearch, statusFilter, academicYearFilter],
  );

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

  const teacherOptions = useMemo(() => {
    const byName = new Map<string, { name: string; sex: "male" | "female" | null }>();

    for (const teacher of scopedTeachers) {
      const normalizedName = teacher.name.trim();
      if (!normalizedName) continue;

      const key = normalizedName.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, {
          name: normalizedName,
          sex: teacher.sex ?? null,
        });
      }
    }

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [scopedTeachers]);

  const teacherSelectOptions = useMemo<TeacherSelectOption[]>(() => {
    const options: TeacherSelectOption[] = teacherOptions.map((teacher) => ({
      value: teacher.name,
      label: teacher.sex ? `${teacher.name} (${teacher.sex === "male" ? "M" : "F"})` : teacher.name,
      isLegacy: false,
    }));

    const selectedTeacher = form.teacher.trim();
    if (!selectedTeacher) {
      return options;
    }

    const exists = options.some((option) => option.value.toLowerCase() === selectedTeacher.toLowerCase());
    if (exists) {
      return options;
    }

    return [
      {
        value: selectedTeacher,
        label: `${selectedTeacher} (existing assignment)`,
        isLegacy: true,
      },
      ...options,
    ];
  }, [teacherOptions, form.teacher]);

  const safePage = Math.max(1, Math.min(page, totalPages));
  const paginatedStudents = pagedStudents;
  const showAcademicYearColumn = academicYearFilter === "all";
  const selectedCount = batchDeleteEnabled ? selectedStudentIds.size : 0;
  const allVisibleSelected =
    batchDeleteEnabled
    && paginatedStudents.length > 0
    && paginatedStudents.every((student) => selectedStudentIds.has(student.id));
  const hasVisibleSelection =
    batchDeleteEnabled
    && paginatedStudents.some((student) => selectedStudentIds.has(student.id));
  const isDeletingAny = deletingIds.size > 0;
  const showActionColumn = true;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, schoolFilterKeys, scopedSchoolCodes, academicYearFilter]);

  useEffect(() => {
    if (academicYearFilter === "current" || academicYearFilter === "all") {
      return;
    }

    const yearExists = academicYearOptions.some((option) => option.value === academicYearFilter);
    if (!yearExists) {
      setAcademicYearFilter("current");
    }
  }, [academicYearFilter, academicYearOptions]);

  useEffect(() => {
    setSelectedStudentIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const visibleIds = new Set(paginatedStudents.map((student) => student.id));
      const next = new Set<string>();

      for (const id of current) {
        if (visibleIds.has(id)) {
          next.add(id);
        }
      }

      return next.size === current.size ? current : next;
    });
  }, [paginatedStudents]);

  useEffect(() => {
    if (batchDeleteEnabled) {
      return;
    }

    setSelectedStudentIds((current) => (current.size === 0 ? current : new Set()));
  }, [batchDeleteEnabled]);

  useEffect(() => {
    void loadStudentsPage(page, false);
  }, [page, loadStudentsPage]);

  useEffect(() => {
    if (dataVersion <= 0) {
      return;
    }

    if (studentDataVersionRef.current === dataVersion) {
      return;
    }

    studentDataVersionRef.current = dataVersion;
    void loadStudentsPage(page, true);
  }, [dataVersion, loadStudentsPage, page]);

  useEffect(() => () => {
    pageAbortRef.current?.abort();
    historyAbortRef.current?.abort();
  }, []);

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

  const toggleStudentSelection = (studentId: string) => {
    if (!batchDeleteEnabled) {
      return;
    }

    setSelectedStudentIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }

      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (!batchDeleteEnabled) {
      return;
    }

    setSelectedStudentIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        for (const student of paginatedStudents) {
          next.delete(student.id);
        }
      } else {
        for (const student of paginatedStudents) {
          next.add(student.id);
        }
      }

      return next;
    });
  };

  const clearSelection = () => {
    setSelectedStudentIds(new Set());
  };

  const toggleBatchDeleteMode = () => {
    if (isDeletingAny) {
      return;
    }

    setBatchDeleteEnabled((current) => !current);
  };

  const closeHistory = useCallback(() => {
    historyAbortRef.current?.abort();
    historyAbortRef.current = null;
    setHistoryStudent(null);
    setHistoryEntries([]);
    setHistoryPage(1);
    setHistoryTotalPages(1);
    setHistoryLoading(false);
    setHistoryError("");
    setHistorySyncedAt(null);
  }, []);

  const loadStudentHistoryPage = useCallback(
    async (student: StudentRecord, nextPage: number, silent = false) => {
      if (historyAbortRef.current) {
        historyAbortRef.current.abort();
      }

      const controller = new AbortController();
      historyAbortRef.current = controller;
      const requestId = ++historyRequestIdRef.current;
      if (!silent) {
        setHistoryLoading(true);
      }
      setHistoryError("");

      try {
        const result = await listStudentHistory(student.id, {
          page: nextPage,
          perPage: HISTORY_PAGE_SIZE,
          signal: controller.signal,
        });

        if (controller.signal.aborted || requestId !== historyRequestIdRef.current) {
          return;
        }

        setHistoryEntries(result.data);
        setHistoryPage(result.meta.currentPage);
        setHistoryTotalPages(Math.max(1, result.meta.lastPage));
        setHistorySyncedAt(result.meta.syncedAt);
      } catch (err) {
        if (controller.signal.aborted || requestId !== historyRequestIdRef.current) {
          return;
        }

        setHistoryEntries([]);
        setHistoryPage(Math.max(1, nextPage));
        setHistoryTotalPages(1);
        setHistoryError(err instanceof Error ? err.message : "Unable to load student history.");
      } finally {
        if (historyAbortRef.current === controller) {
          historyAbortRef.current = null;
        }

        if (!silent && requestId === historyRequestIdRef.current) {
          setHistoryLoading(false);
        }
      }
    },
    [listStudentHistory],
  );

  const openHistory = (student: StudentRecord) => {
    historyRefreshedVersionRef.current = dataVersion;
    setHistoryStudent(student);
    setHistoryEntries([]);
    setHistoryPage(1);
    setHistoryTotalPages(1);
    setHistoryError("");
    setHistorySyncedAt(null);
    void loadStudentHistoryPage(student, 1, false);
  };

  useEffect(() => {
    if (!historyStudent || dataVersion <= 0) {
      return;
    }

    if (historyRefreshedVersionRef.current === dataVersion) {
      return;
    }

    historyRefreshedVersionRef.current = dataVersion;
    void loadStudentHistoryPage(historyStudent, historyPage, true);
  }, [dataVersion, historyStudent, historyPage, loadStudentHistoryPage]);

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
        await updateStudent(editingId, payload, { revalidate: false });
        void loadStudentsPage(page, true);
        setFormMessage("Student record updated.");
      } else {
        await addStudent(payload, { revalidate: false });
        setPage(1);
        void loadStudentsPage(1, true);
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
    if (deletingIds.has(student.id)) {
      return;
    }

    const confirmed = window.confirm(`Delete ${student.fullName}?`);
    if (!confirmed) return;

    const previousPage = page;
    const previousRows = pagedStudents;
    const previousTotal = totalStudents;
    const previousTotalPages = totalPages;
    const previousSelection = new Set(selectedStudentIds);
    const optimisticRows = previousRows.filter((item) => item.id !== student.id);
    const optimisticTotal = Math.max(0, previousTotal - 1);
    const optimisticTotalPages = Math.max(1, Math.ceil(Math.max(optimisticTotal, 1) / STUDENT_PAGE_SIZE));
    const fallbackPage = optimisticRows.length === 0 && previousPage > 1
      ? Math.max(1, Math.min(previousPage - 1, optimisticTotalPages))
      : previousPage;

    setPagedStudents(optimisticRows);
    setTotalStudents(optimisticTotal);
    setTotalPages(optimisticTotalPages);
    if (fallbackPage !== previousPage) {
      setPage(fallbackPage);
    }

    setDeletingIds((current) => {
      const next = new Set(current);
      next.add(student.id);
      return next;
    });
    setSelectedStudentIds((current) => {
      if (!current.has(student.id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(student.id);
      return next;
    });
    setFormError("");
    setFormMessage("");
    try {
      await deleteStudent(student.id, { revalidate: false });
      setFormMessage("Student record deleted.");
      if (historyStudent?.id === student.id) {
        closeHistory();
      }
      void loadStudentsPage(fallbackPage, true);
    } catch (err) {
      if (isApiError(err) && err.status === 404) {
        setFormMessage("Student record was already removed.");
        if (historyStudent?.id === student.id) {
          closeHistory();
        }
        void loadStudentsPage(fallbackPage, true);
        return;
      }

      setPagedStudents(previousRows);
      setTotalStudents(previousTotal);
      setTotalPages(previousTotalPages);
      setPage(previousPage);
      setSelectedStudentIds(previousSelection);
      setFormError(err instanceof Error ? err.message : "Unable to delete student record.");
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(student.id);
        return next;
      });
    }
  };

  const handleBatchDelete = async () => {
    if (!batchDeleteEnabled || selectedStudentIds.size === 0) {
      return;
    }

    const selectedRows = paginatedStudents.filter((student) => selectedStudentIds.has(student.id));
    if (selectedRows.length === 0) {
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedRows.length} selected student record(s)?`);
    if (!confirmed) {
      return;
    }

    const idsToDelete = selectedRows.map((student) => student.id);
    const previousPage = page;
    const previousRows = paginatedStudents;
    const previousTotal = totalStudents;
    const previousTotalPages = totalPages;
    const previousSelection = new Set(selectedStudentIds);
    const optimisticRows = previousRows.filter((student) => !selectedStudentIds.has(student.id));
    const optimisticTotal = Math.max(0, previousTotal - idsToDelete.length);
    const optimisticTotalPages = Math.max(1, Math.ceil(Math.max(optimisticTotal, 1) / STUDENT_PAGE_SIZE));
    const fallbackPage = optimisticRows.length === 0 && previousPage > 1
      ? Math.max(1, Math.min(previousPage - 1, optimisticTotalPages))
      : previousPage;

    setPagedStudents(optimisticRows);
    setTotalStudents(optimisticTotal);
    setTotalPages(optimisticTotalPages);
    if (fallbackPage !== previousPage) {
      setPage(fallbackPage);
    }

    setDeletingIds(new Set(idsToDelete));
    setSelectedStudentIds(new Set());
    setFormError("");
    setFormMessage("");

    try {
      const result = await deleteStudents(idsToDelete, { revalidate: false });
      const deletedIds = result.deletedIds;
      const missingIds = result.missingIds;
      const deletedCount = deletedIds.length;
      const failedCount = Math.max(0, idsToDelete.length - deletedCount);

      if (historyStudent && (deletedIds.includes(historyStudent.id) || missingIds.includes(historyStudent.id))) {
        closeHistory();
      }

      if (failedCount === 0) {
        setFormMessage(
          `${idsToDelete.length} student record${idsToDelete.length === 1 ? "" : "s"} deleted.`,
        );
        void loadStudentsPage(fallbackPage, true);
      } else if (missingIds.length === idsToDelete.length) {
        setFormMessage("Selected student records were already removed.");
        void loadStudentsPage(fallbackPage, true);
      } else if (deletedCount > 0) {
        const missingCount = missingIds.length;
        const unresolvedCount = Math.max(0, failedCount - missingCount);
        if (missingCount > 0 && unresolvedCount === 0) {
          setFormMessage(
            `${deletedCount} deleted. ${missingCount} already removed.`,
          );
        } else {
          setFormError(`${failedCount} of ${idsToDelete.length} selected records could not be deleted.`);
        }
        void loadStudentsPage(fallbackPage, true);
      } else {
        setPagedStudents(previousRows);
        setTotalStudents(previousTotal);
        setTotalPages(previousTotalPages);
        setPage(previousPage);
        setSelectedStudentIds(previousSelection);
        setFormError("Unable to delete selected student records.");
      }
    } catch (err) {
      setPagedStudents(previousRows);
      setTotalStudents(previousTotal);
      setTotalPages(previousTotalPages);
      setPage(previousPage);
      setSelectedStudentIds(previousSelection);
      setFormError(err instanceof Error ? err.message : "Unable to delete selected student records.");
    } finally {
      setDeletingIds(new Set());
    }
  };

  const handleRefresh = async () => {
    setFormError("");
    setFormMessage("");
    await loadStudentsPage(page, true);
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
                onClick={toggleBatchDeleteMode}
                disabled={isDeletingAny}
                className={`inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                  batchDeleteEnabled
                    ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {batchDeleteEnabled ? "Batch Delete: Enabled" : "Batch Delete: Disabled"}
              </button>
            )}
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

      <div className="grid gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-[1fr_auto_auto_auto]">
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
        <label className="inline-flex items-center gap-2 rounded-sm border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <select
            value={academicYearFilter}
            onChange={(event) => setAcademicYearFilter(event.target.value)}
            className="border-none bg-transparent text-sm font-medium text-slate-700 outline-none"
          >
            <option value="current">Current year</option>
            <option value="all">All records</option>
            {academicYearOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
          Showing {paginatedStudents.length} of {totalStudents}
        </div>
        {editable && batchDeleteEnabled && paginatedStudents.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 md:col-span-3">
            <button
              type="button"
              onClick={toggleSelectAllVisible}
              disabled={isDeletingAny}
              className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {allVisibleSelected ? "Unselect page" : "Select page"}
            </button>
            <button
              type="button"
              onClick={() => void handleBatchDelete()}
              disabled={!hasVisibleSelection || isDeletingAny}
              className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isDeletingAny ? "Deleting..." : `Delete Selected (${selectedCount})`}
            </button>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                disabled={isDeletingAny}
                className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear
              </button>
            )}
          </div>
        )}
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
            <select
              className="w-full rounded-sm border border-slate-200 px-3 py-2 text-sm"
              value={form.teacher}
              onChange={(event) => setForm((current) => ({ ...current, teacher: event.target.value }))}
            >
              <option value="">Teacher</option>
              {teacherSelectOptions.map((option) => (
                <option
                  key={`${option.value.toLowerCase()}-${option.isLegacy ? "legacy" : "record"}`}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
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

      {(isLoading || isPageLoading) && paginatedStudents.length === 0 ? (
        <div className="space-y-3 px-5 py-5">
          <div className="skeleton-line h-4 w-48" />
          <div className="grid gap-2">
            <div className="skeleton-line h-12 w-full" />
            <div className="skeleton-line h-12 w-full" />
            <div className="skeleton-line h-12 w-full" />
          </div>
        </div>
      ) : paginatedStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-slate-500">
          <AlertCircle className="h-9 w-9 text-slate-400" />
          <p className="text-sm font-semibold">
            {schoolFilterKeys ? "No student records for this school scope" : "No student records found"}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 px-4 py-4 md:hidden">
            {paginatedStudents.map((student) => (
              <article key={student.id} className="rounded-sm border border-slate-200 bg-white p-3">
                {editable && batchDeleteEnabled && (
                  <label className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.has(student.id)}
                      onChange={() => toggleStudentSelection(student.id)}
                      disabled={isDeletingAny || deletingIds.has(student.id)}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    Select
                  </label>
                )}
                {showSchoolColumn && (
                  <p className="text-xs text-slate-500">
                    {student.school?.schoolCode ?? "N/A"} - {student.school?.name ?? "N/A"}
                  </p>
                )}
                <p className="text-sm font-semibold text-slate-900">{student.fullName}</p>
                <p className="text-xs text-slate-600">LRN: {student.lrn}</p>
                {showAcademicYearColumn && (
                  <p className="text-xs text-slate-500">School year: {student.academicYear?.name ?? "N/A"}</p>
                )}
                <p className="mt-1 text-xs text-slate-600">
                  Section: {student.section ?? student.currentLevel ?? "N/A"} | Teacher: {student.teacher ?? "N/A"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusTone(student.status)}`}>
                    {student.statusLabel}
                  </span>
                  <span className="text-xs text-slate-500">Updated {formatDateTime(student.updatedAt)}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openHistory(student)}
                    className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary hover:bg-primary-50 hover:text-primary"
                  >
                    <History className="h-3.5 w-3.5" />
                    History
                  </button>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => openEdit(student)}
                      className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary hover:bg-primary-50 hover:text-primary"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )}
                  {editable && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(student)}
                      disabled={isDeletingAny || deletingIds.has(student.id)}
                      className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingIds.has(student.id) ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto px-5 py-4 md:block">
            <table className="min-w-full">
              <thead className="table-head-sticky">
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {editable && batchDeleteEnabled && (
                    <th className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        disabled={paginatedStudents.length === 0 || isDeletingAny}
                        aria-label={allVisibleSelected ? "Unselect all students on page" : "Select all students on page"}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </th>
                  )}
                  {showSchoolColumn && <th className="px-2 py-2 text-left">School</th>}
                  {showAcademicYearColumn && <th className="px-2 py-2 text-left">School Year</th>}
                  <th className="px-2 py-2 text-left">LRN</th>
                  <th className="px-2 py-2 text-left">Name</th>
                  <th className="px-2 py-2 text-center">Age</th>
                  <th className="px-2 py-2 text-left">Sex</th>
                  <th className="px-2 py-2 text-left">Section</th>
                  <th className="px-2 py-2 text-left">Teacher</th>
                  <th className="px-2 py-2 text-center">Status</th>
                  <th className="px-2 py-2 text-left">Last Updated</th>
                  {showActionColumn && <th className="px-2 py-2 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedStudents.map((student) => (
                  <tr key={student.id}>
                    {editable && batchDeleteEnabled && (
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.has(student.id)}
                          onChange={() => toggleStudentSelection(student.id)}
                          disabled={isDeletingAny || deletingIds.has(student.id)}
                          aria-label={`Select ${student.fullName}`}
                          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </td>
                    )}
                    {showSchoolColumn && (
                      <td className="px-2 py-2">
                        <p className="text-sm font-semibold text-slate-900">{student.school?.name ?? "N/A"}</p>
                        <p className="text-xs text-slate-500">{student.school?.schoolCode ?? ""}</p>
                      </td>
                    )}
                    {showAcademicYearColumn && (
                      <td className="px-2 py-2 text-sm text-slate-700">{student.academicYear?.name ?? "N/A"}</td>
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
                    {showActionColumn && (
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openHistory(student)}
                            className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary hover:bg-primary-50 hover:text-primary"
                          >
                            <History className="h-3.5 w-3.5" />
                            History
                          </button>
                          {editable && (
                            <button
                              type="button"
                              onClick={() => openEdit(student)}
                              className="inline-flex items-center gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-primary hover:bg-primary-50 hover:text-primary"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          )}
                          {editable && (
                            <button
                              type="button"
                              onClick={() => void handleDelete(student)}
                              disabled={isDeletingAny || deletingIds.has(student.id)}
                              className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deletingIds.has(student.id) ? "Deleting..." : "Delete"}
                            </button>
                          )}
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

      {historyStudent && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3">
          <button
            type="button"
            aria-label="Close student history"
            onClick={closeHistory}
            className="absolute inset-0 bg-slate-900/40"
          />
          <section className="relative z-[91] w-full max-w-3xl overflow-hidden rounded-sm border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Student Record History</h3>
                <p className="text-xs text-slate-600">
                  {historyStudent.fullName} | LRN {historyStudent.lrn}
                </p>
                <p className="text-[11px] text-slate-500">
                  {historySyncedAt ? `Synced ${new Date(historySyncedAt).toLocaleTimeString()}` : "Not synced yet"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadStudentHistoryPage(historyStudent, historyPage, false)}
                  disabled={historyLoading}
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={closeHistory}
                  className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <X className="h-3.5 w-3.5" />
                  Close
                </button>
              </div>
            </header>

            {historyError && (
              <div className="mx-4 mt-3 rounded-sm border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {historyError}
              </div>
            )}

            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              {historyLoading && historyEntries.length === 0 ? (
                <div className="space-y-2">
                  <div className="skeleton-line h-10 w-full" />
                  <div className="skeleton-line h-10 w-full" />
                  <div className="skeleton-line h-10 w-full" />
                </div>
              ) : historyEntries.length === 0 ? (
                <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  No status history entries found for this student.
                </div>
              ) : (
                <ul className="space-y-2">
                  {historyEntries.map((entry) => (
                    <li key={entry.id} className="rounded-sm border border-slate-200 bg-white px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                          {entry.toStatusLabel ?? entry.toStatus ?? "Unknown"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {entry.changedAt ? formatDateTime(entry.changedAt) : "N/A"}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        From: <span className="font-semibold text-slate-800">{entry.fromStatusLabel ?? entry.fromStatus ?? "N/A"}</span>
                        {" -> "}
                        To: <span className="font-semibold text-slate-800">{entry.toStatusLabel ?? entry.toStatus ?? "N/A"}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        By: <span className="font-semibold text-slate-800">{entry.actor?.name ?? "System"}</span>
                        {entry.actor?.email ? ` (${entry.actor.email})` : ""}
                      </p>
                      {entry.notes && (
                        <p className="mt-1 text-xs text-slate-600">Notes: {entry.notes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-600">
                Page <span className="font-semibold text-slate-900">{historyPage}</span> of{" "}
                <span className="font-semibold text-slate-900">{historyTotalPages}</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadStudentHistoryPage(historyStudent, Math.max(1, historyPage - 1), false)}
                  disabled={historyPage <= 1 || historyLoading}
                  className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => void loadStudentHistoryPage(historyStudent, Math.min(historyTotalPages, historyPage + 1), false)}
                  disabled={historyPage >= historyTotalPages || historyLoading}
                  className="rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
