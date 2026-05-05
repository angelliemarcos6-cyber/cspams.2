import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ALL_SCHOOL_SCOPE, MONITOR_SEARCH_DEBOUNCE_MS } from "@/pages/monitor/monitorFilters";
import type { SchoolRecord } from "@/types";

export type ScopeDropdownId = "schools_filters";

export interface SchoolScopeOption {
  key: string;
  code: string;
  name: string;
  headName: string;
  headEmail: string;
  searchText: string;
}

interface UseMonitorLookupsArgs {
  records: SchoolRecord[];
  recordCount: number;
  selectedSchoolScopeKey: string;
  setSelectedSchoolScopeKey: Dispatch<SetStateAction<string>>;
  showMoreFilters: boolean;
  showAdvancedFilters: boolean;
}

export interface UseMonitorLookupsResult {
  schoolScopeQuery: string;
  setSchoolScopeQuery: Dispatch<SetStateAction<string>>;
  openScopeDropdownId: ScopeDropdownId | null;
  setOpenScopeDropdownId: Dispatch<SetStateAction<ScopeDropdownId | null>>;
  toggleScopeDropdown: (dropdownId: ScopeDropdownId) => void;
  schoolScopeOptions: SchoolScopeOption[];
  filteredSchoolScopeOptions: SchoolScopeOption[];
  selectedSchoolScope: SchoolScopeOption | null;
  scopedSchoolKeys: Set<string> | null;
  scopedSchoolCodes: string[] | null;
  totalSchoolsInScope: number;
  handleSelectAllSchools: () => void;
  handleSelectSchoolScope: (option: SchoolScopeOption) => void;
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

export function useMonitorLookups({
  records,
  recordCount,
  selectedSchoolScopeKey,
  setSelectedSchoolScopeKey,
  showMoreFilters,
  showAdvancedFilters,
}: UseMonitorLookupsArgs): UseMonitorLookupsResult {
  const [schoolScopeQuery, setSchoolScopeQuery] = useState("");
  const debouncedSchoolScopeQuery = useDebouncedValue(schoolScopeQuery, MONITOR_SEARCH_DEBOUNCE_MS);
  const [openScopeDropdownId, setOpenScopeDropdownId] = useState<ScopeDropdownId | null>(null);

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

    if (openScopeDropdownId === "schools_filters") {
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

  const toggleScopeDropdown = useCallback((dropdownId: ScopeDropdownId) => {
    setOpenScopeDropdownId((current) => (current === dropdownId ? null : dropdownId));
  }, []);

  const handleSelectAllSchools = useCallback(() => {
    setSelectedSchoolScopeKey(ALL_SCHOOL_SCOPE);
    setSchoolScopeQuery("");
    setOpenScopeDropdownId(null);
  }, [setSelectedSchoolScopeKey]);

  const handleSelectSchoolScope = useCallback(
    (option: SchoolScopeOption) => {
      setSelectedSchoolScopeKey(option.key);
      setSchoolScopeQuery("");
      setOpenScopeDropdownId(null);
    },
    [setSelectedSchoolScopeKey],
  );

  return {
    schoolScopeQuery,
    setSchoolScopeQuery,
    openScopeDropdownId,
    setOpenScopeDropdownId,
    toggleScopeDropdown,
    schoolScopeOptions,
    filteredSchoolScopeOptions,
    selectedSchoolScope,
    scopedSchoolKeys,
    scopedSchoolCodes,
    totalSchoolsInScope,
    handleSelectAllSchools,
    handleSelectSchoolScope,
  };
}
