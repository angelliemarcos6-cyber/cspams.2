import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/Auth";
import { apiRequestRaw, isApiError } from "@/lib/api";
import type { StudentEnrollmentStatus, StudentRecord, StudentRecordPayload } from "@/types";

type StudentSyncScope = "division" | "school" | null;

interface StudentSyncMeta {
  syncedAt?: string;
  scope?: string;
  scopeKey?: string;
  academicYearFilter?: string;
  recordCount?: number;
  currentPage?: number;
  lastPage?: number;
  perPage?: number;
  total?: number;
  from?: number | null;
  to?: number | null;
  hasMorePages?: boolean;
}

interface StudentRecordsResponse {
  data: StudentRecord[];
  meta?: StudentSyncMeta;
}

interface StudentRecordMutationResponse {
  data: StudentRecord;
  meta?: StudentSyncMeta;
}

interface StudentRecordDeleteResponse {
  data: {
    id: string;
  };
  meta?: StudentSyncMeta;
}

interface StudentBatchDeleteResponse {
  data: {
    deletedIds?: string[];
    missingIds?: string[];
    requestedCount?: number;
  };
  meta?: StudentSyncMeta;
}

export interface StudentListParams {
  page?: number;
  perPage?: number;
  search?: string | null;
  status?: StudentEnrollmentStatus | "all" | string | null;
  schoolCode?: string | null;
  schoolCodes?: string[] | null;
  academicYear?: string | number | null;
}

export interface StudentListMeta {
  syncedAt: string | null;
  scope: StudentSyncScope;
  recordCount: number;
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  from: number | null;
  to: number | null;
  hasMorePages: boolean;
}

export interface StudentListResult {
  data: StudentRecord[];
  meta: StudentListMeta;
}

interface StudentDataContextType {
  students: StudentRecord[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  lastSyncedAt: string | null;
  syncScope: StudentSyncScope;
  totalCount: number;
  dataVersion: number;
  refreshStudents: () => Promise<void>;
  listStudents: (params?: StudentListParams) => Promise<StudentListResult>;
  addStudent: (payload: StudentRecordPayload, options?: { revalidate?: boolean }) => Promise<void>;
  updateStudent: (id: string, payload: StudentRecordPayload, options?: { revalidate?: boolean }) => Promise<void>;
  deleteStudent: (id: string, options?: { revalidate?: boolean }) => Promise<void>;
  deleteStudents: (ids: string[], options?: { revalidate?: boolean }) => Promise<string[]>;
}

interface NormalizedStudentListParams {
  page: number;
  perPage: number;
  search: string;
  status: string;
  schoolCode: string;
  schoolCodes: string[];
  academicYear: string;
}

const DataContext = createContext<StudentDataContextType | undefined>(undefined);
const AUTO_SYNC_INTERVAL_MS = 12_000;
const SNAPSHOT_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 200;

const EMPTY_META: StudentListMeta = {
  syncedAt: null,
  scope: null,
  recordCount: 0,
  currentPage: 1,
  lastPage: 1,
  perPage: DEFAULT_PER_PAGE,
  total: 0,
  from: null,
  to: null,
  hasMorePages: false,
};

function normalizeScope(value: string | undefined): StudentSyncScope {
  if (value === "division" || value === "school") return value;
  return null;
}

function normalizeScopeKey(value: string | undefined): string | null {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEtag(value: string | null): string {
  return (value || "").replace(/^W\//, "").replace(/"/g, "");
}

function toPositiveInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Math.trunc(numeric);
}

function sanitizeStatus(value: StudentListParams["status"]): string {
  const normalized = (value ?? "").toString().trim().toLowerCase();
  if (!normalized || normalized === "all") {
    return "";
  }

  return normalized;
}

function sanitizeSchoolCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function sanitizeSchoolCodes(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized = values
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);

  return [...new Set(normalized)];
}

function sanitizeAcademicYear(value: StudentListParams["academicYear"]): string {
  const normalized = (value ?? "").toString().trim().toLowerCase();
  if (!normalized || normalized === "current" || normalized === "latest") {
    return "";
  }

  if (normalized === "all" || normalized === "all_records" || normalized === "all-records") {
    return "all";
  }

  if (/^\d+$/.test(normalized) && Number(normalized) > 0) {
    return normalized;
  }

  return "";
}

function sanitizeParams(params?: StudentListParams): NormalizedStudentListParams {
  const page = toPositiveInt(params?.page, 1);
  const perPage = Math.min(toPositiveInt(params?.perPage, DEFAULT_PER_PAGE), MAX_PER_PAGE);
  const search = (params?.search ?? "").trim();
  const status = sanitizeStatus(params?.status);
  const schoolCode = sanitizeSchoolCode(params?.schoolCode);
  const schoolCodes = sanitizeSchoolCodes(params?.schoolCodes);
  const academicYear = sanitizeAcademicYear(params?.academicYear);

  return {
    page,
    perPage,
    search,
    status,
    schoolCode,
    schoolCodes,
    academicYear,
  };
}

function buildListPath(params: NormalizedStudentListParams): string {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("per_page", String(params.perPage));

  if (params.search) {
    query.set("search", params.search);
  }

  if (params.status) {
    query.set("status", params.status);
  }

  if (params.schoolCodes.length > 0) {
    query.set("schoolCodes", params.schoolCodes.join(","));
  } else if (params.schoolCode) {
    query.set("schoolCode", params.schoolCode);
  }

  if (params.academicYear) {
    query.set("academicYear", params.academicYear);
  }

  const serialized = query.toString();
  return serialized ? `/api/dashboard/students?${serialized}` : "/api/dashboard/students";
}

function normalizeMeta(meta: StudentSyncMeta | undefined, params: NormalizedStudentListParams, dataLength: number): StudentListMeta {
  const perPage = toPositiveInt(meta?.perPage, params.perPage);
  const total = toPositiveInt(meta?.total, dataLength);
  const lastPage = Math.max(1, toPositiveInt(meta?.lastPage, Math.ceil(Math.max(total, 1) / perPage)));
  const currentPage = Math.min(Math.max(1, toPositiveInt(meta?.currentPage, params.page)), lastPage);
  const recordCount = toPositiveInt(meta?.recordCount, total);
  const from = meta?.from ?? (dataLength > 0 ? (currentPage - 1) * perPage + 1 : null);
  const to = meta?.to ?? (dataLength > 0 ? (from ?? 1) + dataLength - 1 : null);

  return {
    syncedAt: meta?.syncedAt ?? new Date().toISOString(),
    scope: normalizeScope(meta?.scope),
    recordCount,
    currentPage,
    lastPage,
    perPage,
    total,
    from,
    to,
    hasMorePages: Boolean(meta?.hasMorePages ?? currentPage < lastPage),
  };
}

function applyDeleteMetaSnapshot(current: StudentListMeta, deletedCount: number, syncedAt: string | null): StudentListMeta {
  const safeDeletedCount = Math.max(0, Math.trunc(deletedCount));
  const perPage = Math.max(1, current.perPage || SNAPSHOT_PER_PAGE);
  const total = Math.max(0, current.total - safeDeletedCount);
  const lastPage = Math.max(1, Math.ceil(Math.max(total, 1) / perPage));
  const currentPage = Math.min(Math.max(1, current.currentPage), lastPage);
  const from = total > 0 ? Math.min(current.from ?? ((currentPage - 1) * perPage + 1), total) : null;
  const to = total > 0 ? Math.min(current.to ?? (currentPage * perPage), total) : null;

  return {
    ...current,
    total,
    recordCount: total,
    lastPage,
    currentPage,
    from,
    to,
    hasMorePages: currentPage < lastPage,
    syncedAt: syncedAt ?? current.syncedAt,
  };
}

export function StudentDataProvider({ children }: { children: ReactNode }) {
  const { token, logout } = useAuth();

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncScope, setSyncScope] = useState<StudentSyncScope>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);
  const [snapshotMeta, setSnapshotMeta] = useState<StudentListMeta>(EMPTY_META);

  const snapshotParamsRef = useRef<NormalizedStudentListParams>(
    sanitizeParams({ page: 1, perPage: SNAPSHOT_PER_PAGE }),
  );
  const syncInFlightRef = useRef(false);
  const etagRef = useRef<string>("");
  const syncScopeKeyRef = useRef<string>("");
  const previousTokenRef = useRef<string>("");
  const syncGenerationRef = useRef(0);

  useEffect(() => {
    if (previousTokenRef.current === token) {
      return;
    }

    previousTokenRef.current = token;
    syncGenerationRef.current += 1;
    syncInFlightRef.current = false;
    etagRef.current = "";
    syncScopeKeyRef.current = "";
    setStudents([]);
    setIsLoading(false);
    setIsSaving(false);
    setError("");
    setLastSyncedAt(null);
    setSyncScope(null);
    setTotalCount(0);
    setDataVersion(0);
    setSnapshotMeta(EMPTY_META);
  }, [token]);

  const handleApiError = useCallback(
    async (err: unknown) => {
      if (isApiError(err) && err.status === 401) {
        await logout();
        return;
      }

      setError(err instanceof Error ? err.message : "Unexpected server error.");
    },
    [logout],
  );

  const requestStudents = useCallback(
    async (tokenValue: string, params: NormalizedStudentListParams): Promise<StudentListResult> => {
      const response = await apiRequestRaw<StudentRecordsResponse>(buildListPath(params), { token: tokenValue });
      const data = Array.isArray(response.data?.data) ? response.data.data : [];
      const meta = normalizeMeta(response.data?.meta, params, data.length);

      return {
        data,
        meta,
      };
    },
    [],
  );

  const syncStudents = useCallback(
    async (silent = false) => {
      if (syncInFlightRef.current) {
        return;
      }

      if (!token) {
        setStudents([]);
        setIsLoading(false);
        setIsSaving(false);
        setError("");
        setLastSyncedAt(null);
        setSyncScope(null);
        setTotalCount(0);
        setSnapshotMeta(EMPTY_META);
        etagRef.current = "";
        syncScopeKeyRef.current = "";
        return;
      }

      syncInFlightRef.current = true;
      const requestGeneration = syncGenerationRef.current;

      if (!silent) {
        setIsLoading(true);
      }

      setError("");

      try {
        const response = await apiRequestRaw<StudentRecordsResponse>(buildListPath(snapshotParamsRef.current), {
          token,
          extraHeaders: etagRef.current ? { "If-None-Match": etagRef.current } : undefined,
        });

        const nextEtag = normalizeEtag(response.headers.get("X-Sync-Etag") || response.headers.get("ETag"));
        if (nextEtag) {
          etagRef.current = nextEtag;
        }

        if (requestGeneration !== syncGenerationRef.current) {
          return;
        }

        const scopeFromHeaders = normalizeScope(response.headers.get("X-Sync-Scope") || undefined);
        const scopeKeyFromHeaders = normalizeScopeKey(response.headers.get("X-Sync-Scope-Key") || undefined);
        if (scopeKeyFromHeaders) {
          if (syncScopeKeyRef.current && syncScopeKeyRef.current !== scopeKeyFromHeaders) {
            etagRef.current = "";
          }
          syncScopeKeyRef.current = scopeKeyFromHeaders;
        }

        if (response.status === 304) {
          setLastSyncedAt(response.headers.get("X-Synced-At") || new Date().toISOString());
          if (scopeFromHeaders) {
            setSyncScope(scopeFromHeaders);
          }
          return;
        }

        const result = {
          data: Array.isArray(response.data?.data) ? response.data.data : [],
          meta: normalizeMeta(response.data?.meta, snapshotParamsRef.current, Array.isArray(response.data?.data) ? response.data.data.length : 0),
        };

        const payloadScopeKey = normalizeScopeKey(response.data?.meta?.scopeKey);
        if (payloadScopeKey) {
          if (syncScopeKeyRef.current && syncScopeKeyRef.current !== payloadScopeKey) {
            etagRef.current = "";
          }
          syncScopeKeyRef.current = payloadScopeKey;
        }

        setStudents(result.data);
        setSnapshotMeta(result.meta);
        setTotalCount(result.meta.total);
        setLastSyncedAt(response.headers.get("X-Synced-At") ?? result.meta.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(response.data?.meta?.scope) ?? scopeFromHeaders ?? result.meta.scope);
        setDataVersion((current) => current + 1);
      } catch (err) {
        if (requestGeneration !== syncGenerationRef.current) {
          return;
        }
        await handleApiError(err);
      } finally {
        if (requestGeneration === syncGenerationRef.current) {
          syncInFlightRef.current = false;
        }
        if (!silent && requestGeneration === syncGenerationRef.current) {
          setIsLoading(false);
        }
      }
    },
    [token, handleApiError],
  );

  const refreshStudents = useCallback(async () => {
    await syncStudents(false);
  }, [syncStudents]);

  const listStudents = useCallback(
    async (params?: StudentListParams): Promise<StudentListResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      const normalized = sanitizeParams(params);

      try {
        return await requestStudents(token, normalized);
      } catch (err) {
        await handleApiError(err);
        throw err;
      }
    },
    [token, requestStudents, handleApiError],
  );

  const addStudent = useCallback(
    async (payload: StudentRecordPayload, options?: { revalidate?: boolean }) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<StudentRecordMutationResponse>("/api/dashboard/students", {
          method: "POST",
          token,
          body: payload,
        });

        const nextRecord = response.data?.data;
        if (nextRecord) {
          setStudents((current) => [nextRecord, ...current.filter((item) => item.id !== nextRecord.id)].slice(0, SNAPSHOT_PER_PAGE));
          setTotalCount((current) => current + 1);
          setSnapshotMeta((current) => {
            const perPage = Math.max(1, current.perPage || SNAPSHOT_PER_PAGE);
            const total = current.total + 1;
            const lastPage = Math.max(1, Math.ceil(Math.max(total, 1) / perPage));
            const currentPage = Math.min(Math.max(1, current.currentPage), lastPage);

            return {
              ...current,
              total,
              recordCount: total,
              lastPage,
              currentPage,
              hasMorePages: currentPage < lastPage,
              syncedAt: response.data?.meta?.syncedAt ?? current.syncedAt,
            };
          });
        }

        setLastSyncedAt(response.data?.meta?.syncedAt ?? new Date().toISOString());
        etagRef.current = "";
        const shouldRevalidate = options?.revalidate ?? true;
        if (shouldRevalidate) {
          await syncStudents(true);
        }
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncStudents, handleApiError],
  );

  const updateStudent = useCallback(
    async (id: string, payload: StudentRecordPayload, options?: { revalidate?: boolean }) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<StudentRecordMutationResponse>(`/api/dashboard/students/${id}`, {
          method: "PUT",
          token,
          body: payload,
        });

        const nextRecord = response.data?.data;
        if (nextRecord) {
          setStudents((current) => current.map((item) => (item.id === nextRecord.id ? nextRecord : item)));
        }

        setLastSyncedAt(response.data?.meta?.syncedAt ?? new Date().toISOString());
        setSnapshotMeta((current) => ({
          ...current,
          syncedAt: response.data?.meta?.syncedAt ?? current.syncedAt,
        }));
        etagRef.current = "";
        const shouldRevalidate = options?.revalidate ?? true;
        if (shouldRevalidate) {
          await syncStudents(true);
        }
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncStudents, handleApiError],
  );

  const deleteStudent = useCallback(
    async (id: string, options?: { revalidate?: boolean }) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<StudentRecordDeleteResponse>(`/api/dashboard/students/${id}`, {
          method: "DELETE",
          token,
        });

        setStudents((current) => current.filter((item) => item.id !== id));
        setTotalCount((current) => Math.max(0, current - 1));
        setSnapshotMeta((current) => applyDeleteMetaSnapshot(current, 1, response.data?.meta?.syncedAt ?? null));
        setLastSyncedAt(response.data?.meta?.syncedAt ?? new Date().toISOString());
        etagRef.current = "";
        const shouldRevalidate = options?.revalidate ?? true;
        if (shouldRevalidate) {
          await syncStudents(true);
        }
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncStudents, handleApiError],
  );

  const deleteStudents = useCallback(
    async (ids: string[], options?: { revalidate?: boolean }): Promise<string[]> => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
      if (uniqueIds.length === 0) {
        return [];
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<StudentBatchDeleteResponse>("/api/dashboard/students", {
          method: "DELETE",
          token,
          body: { ids: uniqueIds },
        });

        const deletedIds = Array.isArray(response.data?.data?.deletedIds)
          ? response.data?.data?.deletedIds.filter((id): id is string => typeof id === "string")
          : [];
        const deletedIdSet = new Set(deletedIds);
        const deletedCount = deletedIds.length;

        if (deletedCount > 0) {
          setStudents((current) => current.filter((item) => !deletedIdSet.has(item.id)));
          setTotalCount((current) => Math.max(0, current - deletedCount));
          setSnapshotMeta((current) =>
            applyDeleteMetaSnapshot(current, deletedCount, response.data?.meta?.syncedAt ?? null),
          );
        }

        setLastSyncedAt(response.data?.meta?.syncedAt ?? new Date().toISOString());
        etagRef.current = "";
        const shouldRevalidate = options?.revalidate ?? true;
        if (shouldRevalidate) {
          await syncStudents(true);
        }

        return deletedIds;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncStudents, handleApiError],
  );

  useEffect(() => {
    void syncStudents(false);
  }, [syncStudents]);

  useEffect(() => {
    if (!token) return;

    const interval = window.setInterval(() => {
      void syncStudents(true);
    }, AUTO_SYNC_INTERVAL_MS);

    const syncOnFocus = () => {
      void syncStudents(true);
    };
    const syncOnRealtime = (event: Event) => {
      const payload = (event as CustomEvent<{ entity?: string }>).detail;
      if (!payload?.entity) return;
      if (payload.entity === "students" || payload.entity === "dashboard") {
        void syncStudents(true);
      }
    };

    window.addEventListener("focus", syncOnFocus);
    window.addEventListener("online", syncOnFocus);
    window.addEventListener("cspams:update", syncOnRealtime);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncOnFocus);
      window.removeEventListener("online", syncOnFocus);
      window.removeEventListener("cspams:update", syncOnRealtime);
    };
  }, [token, syncStudents]);

  const value = useMemo<StudentDataContextType>(
    () => ({
      students,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      syncScope,
      totalCount,
      dataVersion,
      refreshStudents,
      listStudents,
      addStudent,
      updateStudent,
      deleteStudent,
      deleteStudents,
    }),
    [
      students,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      syncScope,
      totalCount,
      dataVersion,
      refreshStudents,
      listStudents,
      addStudent,
      updateStudent,
      deleteStudent,
      deleteStudents,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useStudentData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useStudentData must be used within StudentDataProvider");
  }
  return context;
}
