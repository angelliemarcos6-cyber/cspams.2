import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ALL_SCHOOL_SCOPE, MONITOR_SEARCH_DEBOUNCE_MS } from "@/pages/monitor/monitorFilters";
import type { SchoolRecord, StudentRecord, TeacherRecord } from "@/types";

export type ScopeDropdownId =
  | "schools_filters"
  | "schools_radar"
  | "students_filters"
  | "students_radar"
  | "teachers_filters"
  | "teachers_radar";

export interface SchoolScopeOption {
  key: string;
  code: string;
  name: string;
  headName: string;
  headEmail: string;
  searchText: string;
}

export interface StudentLookupOption {
  id: string;
  lrn: string;
  fullName: string;
  teacherName: string;
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
}

export interface TeacherLookupOption {
  id: string;
  name: string;
  schoolKey: string;
  schoolCode: string;
  schoolName: string;
}

interface QueryStudentsArgs {
  page: number;
  perPage: number;
  search: string | null;
  teacherName?: string | null;
  schoolCodes?: string[] | null;
  academicYear: "all";
  signal?: AbortSignal;
}

interface QueryStudentsResult {
  data: StudentRecord[];
}

interface ListTeachersArgs {
  page: number;
  perPage: number;
  search: string | null;
  schoolCodes?: string[] | null;
  signal?: AbortSignal;
}

interface ListTeachersResult {
  data: TeacherRecord[];
}

interface UseMonitorLookupsArgs {
  authSessionKey: string;
  records: SchoolRecord[];
  recordCount: number;
  students: StudentRecord[];
  isStudentDataLoading: boolean;
  queryStudents: (args: QueryStudentsArgs) => Promise<QueryStudentsResult>;
  listTeachers: (args: ListTeachersArgs) => Promise<ListTeachersResult>;
  selectedSchoolScopeKey: string;
  setSelectedSchoolScopeKey: Dispatch<SetStateAction<string>>;
  selectedStudentLookupId: string | null;
  setSelectedStudentLookupId: Dispatch<SetStateAction<string | null>>;
  selectedTeacherLookupId: string | null;
  setSelectedTeacherLookupId: Dispatch<SetStateAction<string | null>>;
  studentLookupTick: number;
  teacherLookupTick: number;
  showMoreFilters: boolean;
  showAdvancedFilters: boolean;
  setShowSchoolLearnerRecords: Dispatch<SetStateAction<boolean>>;
}

export interface UseMonitorLookupsResult {
  schoolScopeQuery: string;
  setSchoolScopeQuery: Dispatch<SetStateAction<string>>;
  studentLookupQuery: string;
  setStudentLookupQuery: Dispatch<SetStateAction<string>>;
  teacherLookupQuery: string;
  setTeacherLookupQuery: Dispatch<SetStateAction<string>>;
  openScopeDropdownId: ScopeDropdownId | null;
  setOpenScopeDropdownId: Dispatch<SetStateAction<ScopeDropdownId | null>>;
  toggleScopeDropdown: (dropdownId: ScopeDropdownId) => void;
  schoolScopeOptions: SchoolScopeOption[];
  filteredSchoolScopeOptions: SchoolScopeOption[];
  selectedSchoolScope: SchoolScopeOption | null;
  scopedSchoolKeys: Set<string> | null;
  scopedSchoolCodes: string[] | null;
  totalSchoolsInScope: number;
  studentLookupOptions: StudentLookupOption[];
  teacherLookupOptions: TeacherLookupOption[];
  teacherScopedStudentLookupOptions: StudentLookupOption[];
  filteredStudentLookupOptions: StudentLookupOption[];
  filteredTeacherLookupOptions: TeacherLookupOption[];
  selectedStudentLookup: StudentLookupOption | null;
  selectedTeacherLookup: TeacherLookupOption | null;
  selectedTeacherSchoolKeys: Set<string> | null;
  selectedStudentLabel: string;
  selectedTeacherLabel: string;
  studentRecordsLookupTerm: string;
  isStudentLookupSyncing: boolean;
  isTeacherLookupSyncing: boolean;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function normalizeSchoolKey(schoolCode: string | null | undefined, schoolName: string | null | undefined): string {
  const code = schoolCode?.trim().toLowerCase();
  if (code) return `code:${code}`;

  const name = schoolName?.trim().toLowerCase();
  if (name) return `name:${name}`;

  return "unknown";
}

function normalizeSchoolCodeLabel(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : "N/A";
}

function normalizeSchoolNameLabel(value: string | null | undefined): string {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : "Unknown School";
}

function resolveStudentSchoolKey(student: StudentRecord): string {
  const fromCodeOrName = normalizeSchoolKey(student.school?.schoolCode ?? null, student.school?.name ?? null);
  if (fromCodeOrName !== "unknown") {
    return fromCodeOrName;
  }

  const schoolId = student.school?.id?.trim() ?? "";
  if (schoolId.length > 0) {
    return `id:${schoolId}`;
  }

  return "unknown";
}

function toStudentLookupOption(student: StudentRecord): StudentLookupOption {
  return {
    id: student.id,
    lrn: student.lrn,
    fullName: student.fullName,
    teacherName: student.teacher?.trim() ?? "",
    schoolKey: resolveStudentSchoolKey(student),
    schoolCode: normalizeSchoolCodeLabel(student.school?.schoolCode ?? null),
    schoolName: normalizeSchoolNameLabel(student.school?.name ?? null),
  };
}

function resolveTeacherSchoolKey(teacher: TeacherRecord): string {
  const fromCodeOrName = normalizeSchoolKey(teacher.school?.schoolCode ?? null, teacher.school?.name ?? null);
  if (fromCodeOrName !== "unknown") {
    return fromCodeOrName;
  }

  const schoolId = teacher.school?.id?.trim() ?? "";
  if (schoolId.length > 0) {
    return `id:${schoolId}`;
  }

  return "unknown";
}

function toTeacherLookupOption(teacher: TeacherRecord): TeacherLookupOption {
  return {
    id: teacher.id,
    name: teacher.name.trim(),
    schoolKey: resolveTeacherSchoolKey(teacher),
    schoolCode: normalizeSchoolCodeLabel(teacher.school?.schoolCode ?? null),
    schoolName: normalizeSchoolNameLabel(teacher.school?.name ?? null),
  };
}

export function useMonitorLookups({
  authSessionKey,
  records,
  recordCount,
  students,
  isStudentDataLoading,
  queryStudents,
  listTeachers,
  selectedSchoolScopeKey,
  setSelectedSchoolScopeKey,
  selectedStudentLookupId,
  setSelectedStudentLookupId,
  selectedTeacherLookupId,
  setSelectedTeacherLookupId,
  studentLookupTick,
  teacherLookupTick,
  showMoreFilters,
  showAdvancedFilters,
  setShowSchoolLearnerRecords,
}: UseMonitorLookupsArgs): UseMonitorLookupsResult {
  const [schoolScopeQuery, setSchoolScopeQuery] = useState("");
  const debouncedSchoolScopeQuery = useDebouncedValue(schoolScopeQuery, MONITOR_SEARCH_DEBOUNCE_MS);
  const [openScopeDropdownId, setOpenScopeDropdownId] = useState<ScopeDropdownId | null>(null);
  const [studentLookupQuery, setStudentLookupQuery] = useState("");
  const [teacherLookupQuery, setTeacherLookupQuery] = useState("");
  const debouncedStudentLookupQuery = useDebouncedValue(studentLookupQuery, MONITOR_SEARCH_DEBOUNCE_MS);
  const debouncedTeacherLookupQuery = useDebouncedValue(teacherLookupQuery, MONITOR_SEARCH_DEBOUNCE_MS);
  const [dbStudentLookupOptions, setDbStudentLookupOptions] = useState<StudentLookupOption[]>([]);
  const [dbTeacherLookupOptions, setDbTeacherLookupOptions] = useState<TeacherLookupOption[]>([]);
  const [isStudentLookupSyncing, setIsStudentLookupSyncing] = useState(false);
  const [isTeacherLookupSyncing, setIsTeacherLookupSyncing] = useState(false);
  const studentLookupAbortRef = useRef<AbortController | null>(null);
  const teacherLookupAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    studentLookupAbortRef.current?.abort();
    studentLookupAbortRef.current = null;
    teacherLookupAbortRef.current?.abort();
    teacherLookupAbortRef.current = null;
  }, [authSessionKey]);

  useEffect(() => {
    if (!openScopeDropdownId || typeof window === "undefined") return;

    const onPointerDown = (event: MouseEvent) => {
      const root = document.querySelector(`[data-scope-dropdown-id="${openScopeDropdownId}"]`);
      if (!root) {
        setOpenScopeDropdownId(null);
        return;
      }
      if (root.contains(event.target as Node)) return;
      setOpenScopeDropdownId(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenScopeDropdownId(null);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openScopeDropdownId]);

  useEffect(() => {
    if (!openScopeDropdownId || typeof window === "undefined") return;

    window.setTimeout(() => {
      const root = document.querySelector(`[data-scope-dropdown-id="${openScopeDropdownId}"]`);
      const input = root?.querySelector("input");
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    }, 0);
  }, [openScopeDropdownId]);

  useEffect(() => {
    if (showMoreFilters) return;

    if (
      openScopeDropdownId === "schools_filters" ||
      openScopeDropdownId === "students_filters" ||
      openScopeDropdownId === "teachers_filters"
    ) {
      setOpenScopeDropdownId(null);
    }
  }, [openScopeDropdownId, showMoreFilters]);

  useEffect(() => {
    if (showAdvancedFilters) return;

    if (openScopeDropdownId && openScopeDropdownId.endsWith("_filters")) {
      setOpenScopeDropdownId(null);
    }
  }, [openScopeDropdownId, showAdvancedFilters]);

  const schoolScopeOptions = useMemo<SchoolScopeOption[]>(() => {
    const optionsByKey = new Map<string, SchoolScopeOption>();

    for (const record of records) {
      const normalizedKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
      const key = normalizedKey === "unknown" ? `id:${record.id}` : normalizedKey;

      if (optionsByKey.has(key)) continue;

      const schoolCode = (record.schoolId ?? record.schoolCode ?? "").trim();
      const schoolName = record.schoolName?.trim() || "Unknown School";
      const headName = record.schoolHeadAccount?.name?.trim() ?? "";
      const headEmail = record.schoolHeadAccount?.email?.trim() ?? "";
      const searchText = `${schoolCode} ${schoolName} ${headName} ${headEmail}`.trim().toLowerCase();
      optionsByKey.set(key, {
        key,
        code: schoolCode || "N/A",
        name: schoolName,
        headName,
        headEmail,
        searchText,
      });
    }

    return [...optionsByKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const selectedSchoolScope = useMemo(
    () => schoolScopeOptions.find((option) => option.key === selectedSchoolScopeKey) ?? null,
    [selectedSchoolScopeKey, schoolScopeOptions],
  );

  useEffect(() => {
    if (selectedSchoolScopeKey === ALL_SCHOOL_SCOPE) return;
    if (schoolScopeOptions.length === 0) return;
    if (selectedSchoolScope) return;

    setSelectedSchoolScopeKey(ALL_SCHOOL_SCOPE);
  }, [selectedSchoolScope, selectedSchoolScopeKey, schoolScopeOptions.length, setSelectedSchoolScopeKey]);

  const filteredSchoolScopeOptions = useMemo(() => {
    const query = debouncedSchoolScopeQuery.trim().toLowerCase();
    if (!query) return schoolScopeOptions;

    const tokens = query.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return schoolScopeOptions;

    return schoolScopeOptions.filter((option) => tokens.every((token) => option.searchText.includes(token)));
  }, [debouncedSchoolScopeQuery, schoolScopeOptions]);

  const scopedSchoolKeys = useMemo(() => {
    if (!selectedSchoolScope) return null;
    return new Set([selectedSchoolScope.key]);
  }, [selectedSchoolScope]);

  const scopedSchoolCodes = useMemo<string[] | null>(() => {
    if (!selectedSchoolScope) {
      return null;
    }

    const normalizedCode = selectedSchoolScope.code.trim().toUpperCase();
    if (!normalizedCode || normalizedCode === "N/A") {
      return null;
    }

    return [normalizedCode];
  }, [selectedSchoolScope]);

  const totalSchoolsInScope = selectedSchoolScope ? 1 : Math.max(recordCount, schoolScopeOptions.length);

  const scopedStudentPool = useMemo(() => {
    if (!scopedSchoolKeys) {
      return students;
    }

    return students.filter((student) =>
      scopedSchoolKeys.has(normalizeSchoolKey(student.school?.schoolCode ?? null, student.school?.name ?? null)),
    );
  }, [students, scopedSchoolKeys]);

  const localStudentLookupOptions = useMemo<StudentLookupOption[]>(
    () =>
      scopedStudentPool
        .map((student) => toStudentLookupOption(student))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [scopedStudentPool],
  );

  const localTeacherLookupOptions = useMemo<TeacherLookupOption[]>(() => {
    const optionsById = new Map<string, TeacherLookupOption>();

    for (const student of scopedStudentPool) {
      const teacherName = student.teacher?.trim() ?? "";
      if (!teacherName) continue;

      const schoolKey = resolveStudentSchoolKey(student);
      const optionId = `local:${teacherName.toLowerCase()}|${schoolKey}`;
      if (optionsById.has(optionId)) continue;

      optionsById.set(optionId, {
        id: optionId,
        name: teacherName,
        schoolKey,
        schoolCode: normalizeSchoolCodeLabel(student.school?.schoolCode ?? null),
        schoolName: normalizeSchoolNameLabel(student.school?.name ?? null),
      });
    }

    return [...optionsById.values()].sort((a, b) =>
      a.name.localeCompare(b.name) || a.schoolName.localeCompare(b.schoolName),
    );
  }, [scopedStudentPool]);

  const teacherLookupOptions = useMemo<TeacherLookupOption[]>(() => {
    const merged = new Map<string, TeacherLookupOption>();

    for (const option of localTeacherLookupOptions) {
      merged.set(option.id, option);
    }

    for (const option of dbTeacherLookupOptions) {
      merged.set(option.id, option);
    }

    return [...merged.values()].sort((a, b) =>
      a.name.localeCompare(b.name) || a.schoolName.localeCompare(b.schoolName),
    );
  }, [dbTeacherLookupOptions, localTeacherLookupOptions]);

  const selectedTeacherLookup = useMemo(
    () => teacherLookupOptions.find((option) => option.id === selectedTeacherLookupId) ?? null,
    [selectedTeacherLookupId, teacherLookupOptions],
  );

  const shouldSyncStudentLookup = useMemo(() => {
    if (openScopeDropdownId === "students_filters" || openScopeDropdownId === "students_radar") {
      return true;
    }

    if (selectedStudentLookupId) {
      return true;
    }

    if (debouncedStudentLookupQuery.trim()) {
      return true;
    }

    if (selectedTeacherLookup) {
      return true;
    }

    return false;
  }, [debouncedStudentLookupQuery, openScopeDropdownId, selectedStudentLookupId, selectedTeacherLookup]);

  useEffect(() => {
    if (!shouldSyncStudentLookup) {
      studentLookupAbortRef.current?.abort();
      studentLookupAbortRef.current = null;
      setIsStudentLookupSyncing(false);
      return;
    }

    let active = true;
    studentLookupAbortRef.current?.abort();
    const controller = new AbortController();
    studentLookupAbortRef.current = controller;
    setIsStudentLookupSyncing(true);

    const hydrateStudentLookup = async () => {
      try {
        const normalizedTeacherName = selectedTeacherLookup?.name.trim() ?? "";
        const normalizedTeacherSchoolCode = (selectedTeacherLookup?.schoolCode ?? "").trim().toUpperCase();
        const teacherSchoolCodes =
          normalizedTeacherSchoolCode && normalizedTeacherSchoolCode !== "N/A" ? [normalizedTeacherSchoolCode] : null;

        const result = await queryStudents({
          page: 1,
          perPage: 200,
          search: debouncedStudentLookupQuery.trim() || null,
          teacherName: normalizedTeacherName.length > 0 ? normalizedTeacherName : null,
          schoolCodes: teacherSchoolCodes ?? scopedSchoolCodes,
          academicYear: "all",
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;

        const options = result.data
          .map((student) => toStudentLookupOption(student))
          .sort((a, b) => a.fullName.localeCompare(b.fullName));

        setDbStudentLookupOptions(options);
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setDbStudentLookupOptions([]);
      } finally {
        if (active && studentLookupAbortRef.current === controller) {
          studentLookupAbortRef.current = null;
          setIsStudentLookupSyncing(false);
        }
      }
    };

    void hydrateStudentLookup();

    return () => {
      active = false;
      controller.abort();
      if (studentLookupAbortRef.current === controller) {
        studentLookupAbortRef.current = null;
      }
    };
  }, [
    debouncedStudentLookupQuery,
    queryStudents,
    scopedSchoolCodes,
    selectedTeacherLookup?.name,
    selectedTeacherLookup?.schoolCode,
    shouldSyncStudentLookup,
    studentLookupTick,
  ]);

  const studentLookupOptions = useMemo<StudentLookupOption[]>(() => {
    const merged = new Map<string, StudentLookupOption>();

    for (const option of localStudentLookupOptions) {
      merged.set(option.id, option);
    }

    for (const option of dbStudentLookupOptions) {
      merged.set(option.id, option);
    }

    return [...merged.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [dbStudentLookupOptions, localStudentLookupOptions]);

  const selectedStudentLookup = useMemo(
    () => studentLookupOptions.find((option) => option.id === selectedStudentLookupId) ?? null,
    [selectedStudentLookupId, studentLookupOptions],
  );

  const teacherScopedStudentLookupOptions = useMemo(() => {
    if (!selectedTeacherLookup) {
      return studentLookupOptions;
    }

    const normalizedTeacher = selectedTeacherLookup.name.trim().toLowerCase();
    const normalizedTeacherSchoolKey = selectedTeacherLookup.schoolKey;
    const normalizedTeacherSchoolCode = selectedTeacherLookup.schoolCode.trim().toUpperCase();

    return studentLookupOptions.filter((option) => {
      if (option.teacherName.trim().toLowerCase() !== normalizedTeacher) {
        return false;
      }

      if (normalizedTeacherSchoolKey !== "unknown") {
        return option.schoolKey === normalizedTeacherSchoolKey;
      }

      if (normalizedTeacherSchoolCode && normalizedTeacherSchoolCode !== "N/A") {
        return option.schoolCode.trim().toUpperCase() === normalizedTeacherSchoolCode;
      }

      return true;
    });
  }, [selectedTeacherLookup, studentLookupOptions]);

  const filteredStudentLookupOptions = useMemo(() => {
    const query = studentLookupQuery.trim().toLowerCase();
    if (!query) return teacherScopedStudentLookupOptions;

    return teacherScopedStudentLookupOptions.filter(
      (option) =>
        option.fullName.toLowerCase().includes(query) ||
        option.lrn.toLowerCase().includes(query) ||
        option.teacherName.toLowerCase().includes(query) ||
        option.schoolCode.toLowerCase().includes(query) ||
        option.schoolName.toLowerCase().includes(query),
    );
  }, [studentLookupQuery, teacherScopedStudentLookupOptions]);

  const shouldSyncTeacherLookup = useMemo(() => {
    if (openScopeDropdownId === "teachers_filters" || openScopeDropdownId === "teachers_radar") {
      return true;
    }

    if (selectedTeacherLookupId) {
      return true;
    }

    if (debouncedTeacherLookupQuery.trim()) {
      return true;
    }

    return false;
  }, [debouncedTeacherLookupQuery, openScopeDropdownId, selectedTeacherLookupId]);

  useEffect(() => {
    if (!shouldSyncTeacherLookup) {
      teacherLookupAbortRef.current?.abort();
      teacherLookupAbortRef.current = null;
      setIsTeacherLookupSyncing(false);
      return;
    }

    let active = true;
    teacherLookupAbortRef.current?.abort();
    const controller = new AbortController();
    teacherLookupAbortRef.current = controller;
    setIsTeacherLookupSyncing(true);

    const hydrateTeacherLookup = async () => {
      try {
        const result = await listTeachers({
          page: 1,
          perPage: 200,
          search: debouncedTeacherLookupQuery.trim() || null,
          schoolCodes: scopedSchoolCodes,
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;

        const options = result.data
          .map((teacher) => toTeacherLookupOption(teacher))
          .filter((option) => option.name.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name) || a.schoolName.localeCompare(b.schoolName));

        setDbTeacherLookupOptions(options);
      } catch (err) {
        if (!active) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setDbTeacherLookupOptions([]);
      } finally {
        if (active && teacherLookupAbortRef.current === controller) {
          teacherLookupAbortRef.current = null;
          setIsTeacherLookupSyncing(false);
        }
      }
    };

    void hydrateTeacherLookup();

    return () => {
      active = false;
      controller.abort();
      if (teacherLookupAbortRef.current === controller) {
        teacherLookupAbortRef.current = null;
      }
    };
  }, [debouncedTeacherLookupQuery, listTeachers, scopedSchoolCodes, shouldSyncTeacherLookup, teacherLookupTick]);

  const filteredTeacherLookupOptions = useMemo(() => {
    const query = teacherLookupQuery.trim().toLowerCase();
    if (!query) return teacherLookupOptions;
    return teacherLookupOptions.filter(
      (option) =>
        option.name.toLowerCase().includes(query) ||
        option.schoolCode.toLowerCase().includes(query) ||
        option.schoolName.toLowerCase().includes(query),
    );
  }, [teacherLookupOptions, teacherLookupQuery]);

  const selectedTeacherSchoolKeys = useMemo(() => {
    if (!selectedTeacherLookup) return null;

    if (selectedTeacherLookup.schoolKey !== "unknown") {
      return new Set([selectedTeacherLookup.schoolKey]);
    }

    const normalizedTeacher = selectedTeacherLookup.name.trim().toLowerCase();
    const keys = new Set<string>();

    for (const student of scopedStudentPool) {
      if ((student.teacher ?? "").trim().toLowerCase() !== normalizedTeacher) continue;

      const key = resolveStudentSchoolKey(student);
      if (key !== "unknown") {
        keys.add(key);
      }
    }

    return keys;
  }, [scopedStudentPool, selectedTeacherLookup]);

  useEffect(() => {
    if (!selectedTeacherLookup || !selectedStudentLookup) return;

    const normalizedTeacher = selectedTeacherLookup.name.trim().toLowerCase();
    const normalizedStudentTeacher = selectedStudentLookup.teacherName.trim().toLowerCase();

    const matchesTeacher = normalizedTeacher.length > 0 && normalizedStudentTeacher === normalizedTeacher;
    const matchesSchool =
      selectedTeacherLookup.schoolKey === "unknown" || selectedStudentLookup.schoolKey === selectedTeacherLookup.schoolKey;

    if (!matchesTeacher || !matchesSchool) {
      setSelectedStudentLookupId(null);
    }
  }, [
    selectedStudentLookup?.id,
    selectedStudentLookup?.teacherName,
    selectedStudentLookup?.schoolKey,
    selectedTeacherLookup?.id,
    selectedTeacherLookup?.name,
    selectedTeacherLookup?.schoolKey,
    setSelectedStudentLookupId,
  ]);

  const selectedStudentLabel = selectedStudentLookup
    ? `${selectedStudentLookup.fullName} - ${selectedStudentLookup.lrn} (${selectedStudentLookup.schoolCode})`
    : "Student...";
  const selectedTeacherLabel = selectedTeacherLookup
    ? `${selectedTeacherLookup.name} (${selectedTeacherLookup.schoolCode})`
    : "Teacher...";
  const studentRecordsLookupTerm = selectedStudentLookup ? selectedStudentLookup.lrn : selectedTeacherLookup?.name ?? "";

  useEffect(() => {
    if (!selectedStudentLookupId) return;
    if (isStudentDataLoading) return;
    if (studentLookupOptions.some((option) => option.id === selectedStudentLookupId)) return;

    setSelectedStudentLookupId(null);
  }, [isStudentDataLoading, selectedStudentLookupId, setSelectedStudentLookupId, studentLookupOptions]);

  useEffect(() => {
    if (!selectedTeacherLookupId) return;
    if (isTeacherLookupSyncing) return;
    if (teacherLookupOptions.some((option) => option.id === selectedTeacherLookupId)) return;

    setSelectedTeacherLookupId(null);
  }, [isTeacherLookupSyncing, selectedTeacherLookupId, setSelectedTeacherLookupId, teacherLookupOptions]);

  useEffect(() => {
    if (!selectedStudentLookup) return;
    if (selectedStudentLookup.schoolKey === "unknown") return;
    if (selectedSchoolScopeKey === selectedStudentLookup.schoolKey) return;

    setSelectedSchoolScopeKey(selectedStudentLookup.schoolKey);
  }, [selectedSchoolScopeKey, selectedStudentLookup, setSelectedSchoolScopeKey]);

  useEffect(() => {
    if (!selectedTeacherLookup) return;
    if (selectedTeacherLookup.schoolKey === "unknown") return;
    if (selectedSchoolScopeKey === selectedTeacherLookup.schoolKey) return;

    setSelectedSchoolScopeKey(selectedTeacherLookup.schoolKey);
  }, [selectedSchoolScopeKey, selectedTeacherLookup, setSelectedSchoolScopeKey]);

  useEffect(() => {
    if (!selectedStudentLookup && !selectedTeacherLookup) return;
    setShowSchoolLearnerRecords(true);
  }, [selectedStudentLookup, selectedTeacherLookup, setShowSchoolLearnerRecords]);

  const toggleScopeDropdown = useCallback((dropdownId: ScopeDropdownId) => {
    setOpenScopeDropdownId((current) => (current === dropdownId ? null : dropdownId));
  }, []);

  return {
    schoolScopeQuery,
    setSchoolScopeQuery,
    studentLookupQuery,
    setStudentLookupQuery,
    teacherLookupQuery,
    setTeacherLookupQuery,
    openScopeDropdownId,
    setOpenScopeDropdownId,
    toggleScopeDropdown,
    schoolScopeOptions,
    filteredSchoolScopeOptions,
    selectedSchoolScope,
    scopedSchoolKeys,
    scopedSchoolCodes,
    totalSchoolsInScope,
    studentLookupOptions,
    teacherLookupOptions,
    teacherScopedStudentLookupOptions,
    filteredStudentLookupOptions,
    filteredTeacherLookupOptions,
    selectedStudentLookup,
    selectedTeacherLookup,
    selectedTeacherSchoolKeys,
    selectedStudentLabel,
    selectedTeacherLabel,
    studentRecordsLookupTerm,
    isStudentLookupSyncing,
    isTeacherLookupSyncing,
  };
}
