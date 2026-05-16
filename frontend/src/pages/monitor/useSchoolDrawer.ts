import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { IndicatorDataContextType } from "@/context/IndicatorData";
import type { StudentDataContextType } from "@/context/StudentData";
import type { TeacherDataContextType } from "@/context/TeacherData";
import type { IndicatorSubmission } from "@/types";
import type { MonitorUiRealtimeBatch } from "./useMonitorUiRefresh";

const SCHOOL_DETAIL_COUNTS_CACHE_TTL_MS = 45_000;

export type SchoolDrawerTab = "snapshot" | "submissions" | "history";

interface UseSchoolDrawerOptions {
  authSessionKey: string;
  isAuthenticated: boolean;
  latestRealtimeBatch: MonitorUiRealtimeBatch | null;
  resolveRecordId: (schoolKey: string | null) => string;
  resolveSchoolCode: (schoolKey: string | null) => string;
  listSubmissionsForSchool: IndicatorDataContextType["listSubmissionsForSchool"];
  queryStudents: StudentDataContextType["queryStudents"];
  listTeachers: TeacherDataContextType["listTeachers"];
}

export interface UseSchoolDrawerResult {
  schoolDrawerKey: string | null;
  schoolDrawerRecordId: string;
  schoolDrawerSchoolCode: string;
  activeSchoolDrawerTab: SchoolDrawerTab;
  expandedDrawerIndicatorRows: Record<string, boolean>;
  highlightedDrawerIndicatorKey: string | null;
  schoolDrawerSubmissions: IndicatorSubmission[];
  isSchoolDrawerSubmissionsLoading: boolean;
  schoolDrawerSubmissionsError: string;
  accurateSyncedCountsBySchoolKey: Record<string, { students: number; teachers: number }>;
  syncedCountsLoadingSchoolKey: string | null;
  syncedCountsError: string;
  openSchoolDrawer: (schoolKey: string) => void;
  closeSchoolDrawer: () => void;
  refreshSchoolDrawer: () => void;
  setActiveSchoolDrawerTab: Dispatch<SetStateAction<SchoolDrawerTab>>;
  setHighlightedDrawerIndicatorKey: Dispatch<SetStateAction<string | null>>;
  toggleDrawerIndicatorLabel: (key: string) => void;
}

function matchesDrawerSchool(
  schoolId: string,
  schoolCode: string,
  recordId: string,
  normalizedSchoolCode: string,
): boolean {
  const normalizedRecordId = recordId.trim();

  return (
    (Boolean(normalizedSchoolCode) && schoolCode === normalizedSchoolCode) ||
    (Boolean(normalizedRecordId) && schoolId === normalizedRecordId)
  );
}

function isMissingSchoolRecordError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.trim() : "";
  return message === "School record not found. It may have been archived or permanently deleted.";
}

function buildSyncedCountsUnavailableMessage(hasStudentFailure: boolean, hasTeacherFailure: boolean): string {
  if (hasStudentFailure && hasTeacherFailure) {
    return "Unable to refresh synced student and teacher totals right now. Showing last available counts.";
  }

  if (hasStudentFailure) {
    return "Unable to refresh synced student totals right now. Showing last available counts.";
  }

  return "Unable to refresh synced teacher totals right now. Showing last available counts.";
}

export function useSchoolDrawer({
  authSessionKey,
  isAuthenticated,
  latestRealtimeBatch,
  resolveRecordId,
  resolveSchoolCode,
  listSubmissionsForSchool,
  queryStudents,
  listTeachers,
}: UseSchoolDrawerOptions): UseSchoolDrawerResult {
  const [schoolDrawerKey, setSchoolDrawerKey] = useState<string | null>(null);
  const [activeSchoolDrawerTab, setActiveSchoolDrawerTab] = useState<SchoolDrawerTab>("snapshot");
  const [expandedDrawerIndicatorRows, setExpandedDrawerIndicatorRows] = useState<Record<string, boolean>>({});
  const [highlightedDrawerIndicatorKey, setHighlightedDrawerIndicatorKey] = useState<string | null>(null);
  const [schoolDrawerSubmissions, setSchoolDrawerSubmissions] = useState<IndicatorSubmission[]>([]);
  const [isSchoolDrawerSubmissionsLoading, setIsSchoolDrawerSubmissionsLoading] = useState(false);
  const [schoolDrawerSubmissionsError, setSchoolDrawerSubmissionsError] = useState("");
  const [accurateSyncedCountsBySchoolKey, setAccurateSyncedCountsBySchoolKey] = useState<
    Record<string, { students: number; teachers: number }>
  >({});
  const [syncedCountsLoadingSchoolKey, setSyncedCountsLoadingSchoolKey] = useState<string | null>(null);
  const [syncedCountsError, setSyncedCountsError] = useState("");
  const [submissionRefreshTick, setSubmissionRefreshTick] = useState(0);
  const [countsRefreshTick, setCountsRefreshTick] = useState(0);
  const schoolDetailCountsCacheRef = useRef<Map<string, { students: number; teachers: number; fetchedAt: number }>>(
    new Map(),
  );
  const accurateSyncedCountsRef = useRef<Record<string, { students: number; teachers: number }>>({});
  const schoolDetailCountsAbortRef = useRef<AbortController | null>(null);

  const schoolDrawerRecordId = useMemo(
    () => resolveRecordId(schoolDrawerKey),
    [resolveRecordId, schoolDrawerKey],
  );
  const schoolDrawerSchoolCode = useMemo(
    () => resolveSchoolCode(schoolDrawerKey),
    [resolveSchoolCode, schoolDrawerKey],
  );

  const openSchoolDrawer = useCallback((schoolKey: string) => {
    setSchoolDrawerKey(schoolKey);
    setActiveSchoolDrawerTab("snapshot");
    setExpandedDrawerIndicatorRows({});
    setHighlightedDrawerIndicatorKey(null);
  }, []);

  const closeSchoolDrawer = useCallback(() => {
    setSchoolDrawerKey(null);
    setHighlightedDrawerIndicatorKey(null);
  }, []);

  const refreshSchoolDrawer = useCallback(() => {
    setSubmissionRefreshTick((current) => current + 1);
    setCountsRefreshTick((current) => current + 1);
  }, []);

  const toggleDrawerIndicatorLabel = useCallback((key: string) => {
    setExpandedDrawerIndicatorRows((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  useEffect(() => {
    schoolDetailCountsCacheRef.current.clear();
    schoolDetailCountsAbortRef.current?.abort();
    schoolDetailCountsAbortRef.current = null;
    setSchoolDrawerKey(null);
    setActiveSchoolDrawerTab("snapshot");
    setExpandedDrawerIndicatorRows({});
    setHighlightedDrawerIndicatorKey(null);
    setSchoolDrawerSubmissions([]);
    setIsSchoolDrawerSubmissionsLoading(false);
    setSchoolDrawerSubmissionsError("");
    setAccurateSyncedCountsBySchoolKey({});
    accurateSyncedCountsRef.current = {};
    setSyncedCountsLoadingSchoolKey(null);
    setSyncedCountsError("");
    setSubmissionRefreshTick(0);
    setCountsRefreshTick(0);
  }, [authSessionKey]);

  useEffect(() => {
    if (!schoolDrawerKey) {
      return;
    }

    if (schoolDrawerRecordId || schoolDrawerSchoolCode) {
      return;
    }

    closeSchoolDrawer();
    setSchoolDrawerSubmissions([]);
    setSchoolDrawerSubmissionsError("");
    setSyncedCountsLoadingSchoolKey(null);
    setSyncedCountsError("");
  }, [closeSchoolDrawer, schoolDrawerKey, schoolDrawerRecordId, schoolDrawerSchoolCode]);

  useEffect(() => {
    if (!schoolDrawerKey || !latestRealtimeBatch) {
      return;
    }

    const normalizedSchoolCode = schoolDrawerSchoolCode.trim().toUpperCase();
    const hasMatchingIndicatorUpdate = latestRealtimeBatch.updates.some(
      (update) =>
        update.entity === "indicators" &&
        matchesDrawerSchool(update.schoolId, update.schoolCode, schoolDrawerRecordId, normalizedSchoolCode),
    );
    if (hasMatchingIndicatorUpdate) {
      setSubmissionRefreshTick((current) => current + 1);
    }

    const hasMatchingCountUpdate = latestRealtimeBatch.updates.some(
      (update) =>
        (update.entity === "students" || update.entity === "teachers" || update.entity === "dashboard") &&
        matchesDrawerSchool(update.schoolId, update.schoolCode, schoolDrawerRecordId, normalizedSchoolCode),
    );
    if (hasMatchingCountUpdate) {
      setCountsRefreshTick((current) => current + 1);
    }
  }, [latestRealtimeBatch, schoolDrawerKey, schoolDrawerRecordId, schoolDrawerSchoolCode]);

  useEffect(() => {
    if (!schoolDrawerRecordId || !isAuthenticated) {
      setSchoolDrawerSubmissions([]);
      setIsSchoolDrawerSubmissionsLoading(false);
      setSchoolDrawerSubmissionsError("");
      return;
    }

    let active = true;
    const abortController = new AbortController();

    const loadSchoolSubmissions = async () => {
      setIsSchoolDrawerSubmissionsLoading(true);
      setSchoolDrawerSubmissionsError("");

      try {
        const allRows = await listSubmissionsForSchool(schoolDrawerRecordId, {
          signal: abortController.signal,
        });
        if (!active) {
          return;
        }
        setSchoolDrawerSubmissions(allRows);
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (isMissingSchoolRecordError(err)) {
          setSchoolDrawerSubmissions([]);
          setSchoolDrawerSubmissionsError("");
          closeSchoolDrawer();
          return;
        }
        setSchoolDrawerSubmissions([]);
        setSchoolDrawerSubmissionsError(err instanceof Error ? err.message : "Unable to load school submissions.");
      } finally {
        if (active) {
          setIsSchoolDrawerSubmissionsLoading(false);
        }
      }
    };

    void loadSchoolSubmissions();

    return () => {
      active = false;
      abortController.abort();
    };
  }, [closeSchoolDrawer, isAuthenticated, listSubmissionsForSchool, schoolDrawerRecordId, submissionRefreshTick]);

  useEffect(() => {
    if (!schoolDrawerKey) {
      schoolDetailCountsAbortRef.current?.abort();
      schoolDetailCountsAbortRef.current = null;
      setSyncedCountsLoadingSchoolKey(null);
      setSyncedCountsError("");
      return;
    }

    const normalizedSchoolCode = schoolDrawerSchoolCode.trim().toUpperCase();
    if (!normalizedSchoolCode) {
      schoolDetailCountsAbortRef.current?.abort();
      schoolDetailCountsAbortRef.current = null;
      setSyncedCountsLoadingSchoolKey(null);
      setSyncedCountsError("");
      return;
    }

    let active = true;
    const shouldForceRefresh = countsRefreshTick > 0;
    const readCachedCounts = () => {
      const cached = schoolDetailCountsCacheRef.current.get(schoolDrawerKey) ?? null;
      if (!cached) {
        return null;
      }
      if (Date.now() - cached.fetchedAt > SCHOOL_DETAIL_COUNTS_CACHE_TTL_MS) {
        return null;
      }
      return cached;
    };

    const hydrateAccurateSyncedCounts = async () => {
      const cached = shouldForceRefresh ? null : readCachedCounts();
      const currentKnownCounts = accurateSyncedCountsRef.current[schoolDrawerKey] ?? cached;
      if (cached) {
        accurateSyncedCountsRef.current = {
          ...accurateSyncedCountsRef.current,
          [schoolDrawerKey]: {
            students: cached.students,
            teachers: cached.teachers,
          },
        };
        setAccurateSyncedCountsBySchoolKey((current) => ({
          ...current,
          [schoolDrawerKey]: {
            students: cached.students,
            teachers: cached.teachers,
          },
        }));
        setSyncedCountsLoadingSchoolKey(null);
        setSyncedCountsError("");
        return;
      }

      schoolDetailCountsAbortRef.current?.abort();
      const controller = new AbortController();
      schoolDetailCountsAbortRef.current = controller;
      setSyncedCountsLoadingSchoolKey(schoolDrawerKey);
      setSyncedCountsError("");

      try {
        const [studentsResult, teachersResult] = await Promise.allSettled([
          queryStudents({ page: 1, perPage: 1, schoolCode: normalizedSchoolCode, signal: controller.signal }),
          listTeachers({ page: 1, perPage: 1, schoolCode: normalizedSchoolCode, signal: controller.signal }),
        ]);

        if (!active || controller.signal.aborted) {
          return;
        }

        const studentAborted =
          studentsResult.status === "rejected" &&
          studentsResult.reason instanceof DOMException &&
          studentsResult.reason.name === "AbortError";
        const teacherAborted =
          teachersResult.status === "rejected" &&
          teachersResult.reason instanceof DOMException &&
          teachersResult.reason.name === "AbortError";
        if (studentAborted || teacherAborted) {
          return;
        }

        const nextCounts = {
          students:
            studentsResult.status === "fulfilled"
              ? Number(
                  studentsResult.value.meta.total
                    ?? studentsResult.value.meta.recordCount
                    ?? studentsResult.value.data.length
                    ?? 0,
                )
              : Number(currentKnownCounts?.students ?? 0),
          teachers:
            teachersResult.status === "fulfilled"
              ? Number(
                  teachersResult.value.meta.total
                    ?? teachersResult.value.meta.recordCount
                    ?? teachersResult.value.data.length
                    ?? 0,
                )
              : Number(currentKnownCounts?.teachers ?? 0),
        };
        schoolDetailCountsCacheRef.current.set(schoolDrawerKey, {
          ...nextCounts,
          fetchedAt: Date.now(),
        });
        accurateSyncedCountsRef.current = {
          ...accurateSyncedCountsRef.current,
          [schoolDrawerKey]: nextCounts,
        };
        setAccurateSyncedCountsBySchoolKey((current) => ({
          ...current,
          [schoolDrawerKey]: nextCounts,
        }));

        const hasStudentFailure = studentsResult.status === "rejected";
        const hasTeacherFailure = teachersResult.status === "rejected";
        if (hasStudentFailure || hasTeacherFailure) {
          setSyncedCountsError(buildSyncedCountsUnavailableMessage(hasStudentFailure, hasTeacherFailure));
        }
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        setSyncedCountsError("Unable to refresh synced totals right now. Showing last available counts.");
      } finally {
        if (active && schoolDetailCountsAbortRef.current === controller) {
          schoolDetailCountsAbortRef.current = null;
          setSyncedCountsLoadingSchoolKey((current) => (current === schoolDrawerKey ? null : current));
        }
      }
    };

    void hydrateAccurateSyncedCounts();

    return () => {
      active = false;
      schoolDetailCountsAbortRef.current?.abort();
      schoolDetailCountsAbortRef.current = null;
    };
  }, [
    countsRefreshTick,
    listTeachers,
    queryStudents,
    schoolDrawerKey,
    schoolDrawerSchoolCode,
  ]);

  return {
    schoolDrawerKey,
    schoolDrawerRecordId,
    schoolDrawerSchoolCode,
    activeSchoolDrawerTab,
    expandedDrawerIndicatorRows,
    highlightedDrawerIndicatorKey,
    schoolDrawerSubmissions,
    isSchoolDrawerSubmissionsLoading,
    schoolDrawerSubmissionsError,
    accurateSyncedCountsBySchoolKey,
    syncedCountsLoadingSchoolKey,
    syncedCountsError,
    openSchoolDrawer,
    closeSchoolDrawer,
    refreshSchoolDrawer,
    setActiveSchoolDrawerTab,
    setHighlightedDrawerIndicatorKey,
    toggleDrawerIndicatorLabel,
  };
}
