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
import { apiRequestRaw, COOKIE_SESSION_TOKEN, isApiError } from "@/lib/api";
import { subscribeSharedSyncPolling } from "@/lib/sharedSyncPolling";
import type {
  StudentEnrollmentStatus,
  StudentRecord,
  StudentRecordPayload,
  StudentStatusHistoryEntry,
  StudentStatusHistoryMeta,
} from "@/types";

type StudentSyncScope = "division" | "school" | null;

interface StudentSyncMeta {
  syncedAt?: string;
  scope?: string;
  scopeKey?: string;
  academicYearFilter?: string;
  schoolId?: string;
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

interface StudentListCacheEntry {
  etag: string;
  scopeKey: string | null;
  result: StudentListResult;
}

interface StudentRecordMutationResponse {
  data: StudentRecord;
  meta?: StudentSyncMeta;
}

interface StudentRecordDeleteResponse {
  data: {
    id: string;
    schoolId?: string;
    deleted?: boolean;
    deletedCount?: number;
  };
  meta?: StudentSyncMeta;
}

interface StudentHistorySyncMeta extends StudentSyncMeta {
  studentId?: string;
  studentLrn?: string | null;
}

interface StudentHistoryResponse {
  data: StudentStatusHistoryEntry[];
  meta?: StudentHistorySyncMeta;
}

interface StudentBatchDeleteResponse {
  data: {
    deletedIds?: string[];
    missingIds?: string[];
    requestedCount?: number;
  };
  meta?: StudentSyncMeta;
}

export interface StudentBatchDeleteResult {
  deletedIds: string[];
  missingIds: string[];
  requestedCount: number;
}

export interface StudentListParams {
  page?: number;
  perPage?: number;
  search?: string | null;
  teacherName?: string | null;
  status?: StudentEnrollmentStatus | "all" | string | null;
  schoolCode?: string | null;
  schoolCodes?: string[] | null;
  academicYear?: string | number | null;
  signal?: AbortSignal;
}

export interface StudentHistoryParams {
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
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

export interface StudentHistoryResult {
  data: StudentStatusHistoryEntry[];
  meta: StudentStatusHistoryMeta;
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
  queryStudents: (params?: StudentListParams) => Promise<StudentListResult>;
  listStudentHistory: (studentId: string, params?: StudentHistoryParams) => Promise<StudentHistoryResult>;
  addStudent: (payload: StudentRecordPayload, options?: { revalidate?: boolean }) => Promise<void>;
  updateStudent: (id: string, payload: StudentRecordPayload, options?: { revalidate?: boolean }) => Promise<void>;
  deleteStudent: (id: string, options?: { revalidate?: boolean }) => Promise<void>;
  deleteStudents: (ids: string[], options?: { revalidate?: boolean }) => Promise<StudentBatchDeleteResult>;
}

interface NormalizedStudentListParams {
  page: number;
  perPage: number;
  search: string;
  teacherName: string;
  status: string;
  schoolCode: string;
  schoolCodes: string[];
  academicYear: string;
}

const DataContext = createContext<StudentDataContextType | undefined>(undefined);
const SNAPSHOT_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 200;
const DEFAULT_HISTORY_PER_PAGE = 12;
const MAX_HISTORY_PER_PAGE = 50;
const LIST_CACHE_MAX_ENTRIES = 64;

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
  const teacherName = (params?.teacherName ?? "").trim();
  const status = sanitizeStatus(params?.status);
  const schoolCode = sanitizeSchoolCode(params?.schoolCode);
  const schoolCodes = sanitizeSchoolCodes(params?.schoolCodes);
  const academicYear = sanitizeAcademicYear(params?.academicYear);

  return {
    page,
    perPage,
    search,
    teacherName,
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

  if (params.teacherName) {
    query.set("teacherName", params.teacherName);
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

function buildHistoryPath(studentId: string, page: number, perPage: number): string {
  const query = new URLSearchParams();
  query.set("page", String(page));
  query.set("per_page", String(perPage));
  const serialized = query.toString();
  const base = `/api/dashboard/students/${encodeURIComponent(studentId)}/history`;

  return serialized ? `${base}?${serialized}` : base;
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

function normalizeHistoryMeta(
  meta: StudentHistorySyncMeta | undefined,
  studentId: string,
  page: number,
  perPageFallback: number,
  dataLength: number,
): StudentStatusHistoryMeta {
  const perPage = toPositiveInt(meta?.perPage, perPageFallback);
  const total = toPositiveInt(meta?.total, dataLength);
  const lastPage = Math.max(1, toPositiveInt(meta?.lastPage, Math.ceil(Math.max(total, 1) / perPage)));
  const currentPage = Math.min(Math.max(1, toPositiveInt(meta?.currentPage, page)), lastPage);
  const recordCount = toPositiveInt(meta?.recordCount, total);
  const from = meta?.from ?? (dataLength > 0 ? (currentPage - 1) * perPage + 1 : null);
  const to = meta?.to ?? (dataLength > 0 ? (from ?? 1) + dataLength - 1 : null);

  return {
    syncedAt: meta?.syncedAt ?? new Date().toISOString(),
    scope: normalizeScope(meta?.scope),
    scopeKey: normalizeScopeKey(meta?.scopeKey),
    studentId: (meta?.studentId ?? studentId).toString(),
    studentLrn: meta?.studentLrn ?? null,
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

function buildListCacheKey(params: NormalizedStudentListParams): string {
  return [
    params.page,
    params.perPage,
    params.search.toLowerCase(),
    params.teacherName.toLowerCase(),
    params.status,
    params.schoolCode,
    params.schoolCodes.join(","),
    params.academicYear,
  ].join("|");
}

function storeListCacheEntry(
  cache: Map<string, StudentListCacheEntry>,
  key: string,
  entry: StudentListCacheEntry,
): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, entry);

  while (cache.size > LIST_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
}

function normalizeSchoolId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function emitStudentUpdateEvent(schoolId: unknown): void {
  if (typeof window === "undefined") {
    return;
  }

  const detail: { entity: "students"; schoolId?: string } = { entity: "students" };
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  if (normalizedSchoolId) {
    detail.schoolId = normalizedSchoolId;
  }

  window.dispatchEvent(new CustomEvent("cspams:update", { detail }));
}

export function StudentDataProvider({ children }: { children: ReactNode }) {
  const { logout, role, user } = useAuth();
  const token = user ? COOKIE_SESSION_TOKEN : "";
  const sessionKey = user ? `${user.role}:${user.id}` : "";

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
  const syncQueuedRef = useRef(false);
  const etagRef = useRef<string>("");
  const syncScopeKeyRef = useRef<string>("");
  const listCacheRef = useRef<Map<string, StudentListCacheEntry>>(new Map());
  const historyCacheRef = useRef<Map<string, { etag: string; result: StudentHistoryResult }>>(new Map());
  const previousSessionKeyRef = useRef<string>("");
  const syncGenerationRef = useRef(0);
  const realtimeSyncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (previousSessionKeyRef.current === sessionKey) {
      return;
    }

    previousSessionKeyRef.current = sessionKey;
    syncGenerationRef.current += 1;
    syncInFlightRef.current = false;
    syncQueuedRef.current = false;
    etagRef.current = "";
    syncScopeKeyRef.current = "";
    listCacheRef.current.clear();
    historyCacheRef.current.clear();
    if (realtimeSyncTimerRef.current !== null) {
      window.clearTimeout(realtimeSyncTimerRef.current);
      realtimeSyncTimerRef.current = null;
    }
    setStudents([]);
    setIsLoading(false);
    setIsSaving(false);
    setError("");
    setLastSyncedAt(null);
    setSyncScope(null);
    setTotalCount(0);
    setDataVersion(0);
    setSnapshotMeta(EMPTY_META);
  }, [sessionKey]);

  const handleApiError = useCallback(
    async (err: unknown) => {
      if (isApiError(err) && (err.status === 401 || err.status === 403)) {
        await logout({ force: true });
        return;
      }

      setError(err instanceof Error ? err.message : "Unexpected server error.");
    },
    [logout],
  );

  const requestStudents = useCallback(
    async (tokenValue: string, params: NormalizedStudentListParams, signal?: AbortSignal): Promise<StudentListResult> => {
      const path = buildListPath(params);
      const cacheKey = buildListCacheKey(params);
      const cached = listCacheRef.current.get(cacheKey);
      const hasScopeMismatch = Boolean(
        cached?.scopeKey
          && syncScopeKeyRef.current
          && cached.scopeKey !== syncScopeKeyRef.current,
      );
      if (hasScopeMismatch && cached) {
        listCacheRef.current.delete(cacheKey);
      }
      const cacheEntry = hasScopeMismatch ? null : cached;

      let response = await apiRequestRaw<StudentRecordsResponse>(path, {
        token: tokenValue,
        signal,
        extraHeaders: cacheEntry?.etag ? { "If-None-Match": cacheEntry.etag } : undefined,
      });

      if (response.status === 304) {
        if (cacheEntry) {
          return cacheEntry.result;
        }

        response = await apiRequestRaw<StudentRecordsResponse>(path, {
          token: tokenValue,
          signal,
        });
      }

      const data = Array.isArray(response.data?.data) ? response.data.data : [];
      const meta = normalizeMeta(response.data?.meta, params, data.length);
      const result: StudentListResult = {
        data,
        meta,
      };

      const responseEtag = normalizeEtag(response.headers.get("X-Sync-Etag") || response.headers.get("ETag"));
      const responseScopeKey = normalizeScopeKey(response.headers.get("X-Sync-Scope-Key") || response.data?.meta?.scopeKey);
      storeListCacheEntry(listCacheRef.current, cacheKey, {
        etag: responseEtag,
        scopeKey: responseScopeKey,
        result,
      });

      return result;
    },
    [],
  );

  const syncStudents = useCallback(
    async (silent = false) => {
      if (syncInFlightRef.current) {
        syncQueuedRef.current = true;
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
        listCacheRef.current.clear();
        historyCacheRef.current.clear();
        syncQueuedRef.current = false;
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
            listCacheRef.current.clear();
            historyCacheRef.current.clear();
          }
          syncScopeKeyRef.current = scopeKeyFromHeaders;
        }

        if (response.status === 304) {
          if (!silent) {
            setLastSyncedAt(response.headers.get("X-Synced-At") || new Date().toISOString());
          }
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
            listCacheRef.current.clear();
            historyCacheRef.current.clear();
          }
          syncScopeKeyRef.current = payloadScopeKey;
        }

        setStudents(result.data);
        setSnapshotMeta(result.meta);
        setTotalCount(result.meta.total);
        setLastSyncedAt(response.headers.get("X-Synced-At") ?? result.meta.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(response.data?.meta?.scope) ?? scopeFromHeaders ?? result.meta.scope);
        storeListCacheEntry(listCacheRef.current, buildListCacheKey(snapshotParamsRef.current), {
          etag: nextEtag,
          scopeKey: payloadScopeKey ?? scopeKeyFromHeaders,
          result,
        });
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

        if (requestGeneration === syncGenerationRef.current && syncQueuedRef.current) {
          syncQueuedRef.current = false;
          void syncStudents(true);
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
        return await requestStudents(token, normalized, params?.signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err;
        }

        await handleApiError(err);
        throw err;
      }
    },
    [token, requestStudents, handleApiError],
  );

  const queryStudents = useCallback(
    async (params?: StudentListParams): Promise<StudentListResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      const normalized = sanitizeParams(params);

      try {
        return await requestStudents(token, normalized, params?.signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err;
        }

        await handleApiError(err);
        throw err;
      }
    },
    [token, requestStudents, handleApiError],
  );

  const listStudentHistory = useCallback(
    async (studentId: string, params?: StudentHistoryParams): Promise<StudentHistoryResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      const normalizedStudentId = studentId.trim();
      if (!normalizedStudentId) {
        throw new Error("Student history request is missing a student identifier.");
      }

      const page = toPositiveInt(params?.page, 1);
      const perPage = Math.min(toPositiveInt(params?.perPage, DEFAULT_HISTORY_PER_PAGE), MAX_HISTORY_PER_PAGE);
      const cacheKey = `${normalizedStudentId}|${page}|${perPage}`;
      const cached = historyCacheRef.current.get(cacheKey);

      try {
        const response = await apiRequestRaw<StudentHistoryResponse>(buildHistoryPath(normalizedStudentId, page, perPage), {
          token,
          signal: params?.signal,
          extraHeaders: cached?.etag ? { "If-None-Match": cached.etag } : undefined,
        });

        if (response.status === 304 && cached) {
          return cached.result;
        }

        const responseData = Array.isArray(response.data?.data) ? response.data.data : [];
        const responseMeta = normalizeHistoryMeta(response.data?.meta, normalizedStudentId, page, perPage, responseData.length);
        const result: StudentHistoryResult = {
          data: responseData,
          meta: responseMeta,
        };

        const responseEtag = normalizeEtag(response.headers.get("X-Sync-Etag") || response.headers.get("ETag"));
        historyCacheRef.current.set(cacheKey, {
          etag: responseEtag,
          result,
        });

        return result;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err;
        }

        await handleApiError(err);
        throw err;
      }
    },
    [token, handleApiError],
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
        listCacheRef.current.clear();
        historyCacheRef.current.clear();
        setDataVersion((current) => current + 1);
        emitStudentUpdateEvent(nextRecord?.school?.id ?? response.data?.meta?.schoolId ?? user?.schoolId ?? null);
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
    [token, syncStudents, handleApiError, user?.schoolId],
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
        listCacheRef.current.clear();
        historyCacheRef.current.clear();
        setDataVersion((current) => current + 1);
        emitStudentUpdateEvent(nextRecord?.school?.id ?? response.data?.meta?.schoolId ?? user?.schoolId ?? null);
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
    [token, syncStudents, handleApiError, user?.schoolId],
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
        listCacheRef.current.clear();
        historyCacheRef.current.clear();
        setDataVersion((current) => current + 1);
        emitStudentUpdateEvent(response.data?.data?.schoolId ?? response.data?.meta?.schoolId ?? user?.schoolId ?? null);
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
    [token, syncStudents, handleApiError, user?.schoolId],
  );

  const deleteStudents = useCallback(
    async (ids: string[], options?: { revalidate?: boolean }): Promise<StudentBatchDeleteResult> => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
      if (uniqueIds.length === 0) {
        return {
          deletedIds: [],
          missingIds: [],
          requestedCount: 0,
        };
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
          ? response.data?.data?.deletedIds
            .map((value) => String(value).trim())
            .filter((value): value is string => value.length > 0)
          : [];
        const missingIds = Array.isArray(response.data?.data?.missingIds)
          ? response.data?.data?.missingIds
            .map((value) => String(value).trim())
            .filter((value): value is string => value.length > 0)
          : [];
        const normalizedDeletedIds = [...new Set(deletedIds)];
        const normalizedMissingIds = [...new Set(missingIds)];
        const requestedCount = toPositiveInt(response.data?.data?.requestedCount, uniqueIds.length);
        const deletedIdSet = new Set(normalizedDeletedIds);
        const deletedCount = normalizedDeletedIds.length;

        if (deletedCount > 0) {
          setStudents((current) => current.filter((item) => !deletedIdSet.has(item.id)));
          setTotalCount((current) => Math.max(0, current - deletedCount));
          setSnapshotMeta((current) =>
            applyDeleteMetaSnapshot(current, deletedCount, response.data?.meta?.syncedAt ?? null),
          );
        }

        setLastSyncedAt(response.data?.meta?.syncedAt ?? new Date().toISOString());
        etagRef.current = "";
        listCacheRef.current.clear();
        historyCacheRef.current.clear();
        setDataVersion((current) => current + 1);
        emitStudentUpdateEvent(response.data?.meta?.schoolId ?? user?.schoolId ?? null);
        const shouldRevalidate = options?.revalidate ?? true;
        if (shouldRevalidate) {
          await syncStudents(true);
        }

        return {
          deletedIds: normalizedDeletedIds,
          missingIds: normalizedMissingIds,
          requestedCount,
        };
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncStudents, handleApiError, user?.schoolId],
  );

  useEffect(() => {
    void syncStudents(false);
  }, [syncStudents]);

  useEffect(() => {
    const clearRealtimeSyncTimer = () => {
      if (realtimeSyncTimerRef.current !== null) {
        window.clearTimeout(realtimeSyncTimerRef.current);
        realtimeSyncTimerRef.current = null;
      }
    };

    if (!token) {
      clearRealtimeSyncTimer();
      return;
    }

    const scheduleSync = (delayMs = 0) => {
      clearRealtimeSyncTimer();
      realtimeSyncTimerRef.current = window.setTimeout(() => {
        realtimeSyncTimerRef.current = null;
        void syncStudents(true);
      }, delayMs);
    };

    const unsubscribe = subscribeSharedSyncPolling((trigger, payload) => {
      if (trigger === "realtime") {
        if (!payload?.entity) return;
        if (payload.entity !== "students" && payload.entity !== "dashboard") return;

        if (
          role === "school_head"
          && user?.schoolId !== null
          && user?.schoolId !== undefined
          && payload.schoolId !== undefined
          && payload.schoolId !== null
        ) {
          if (String(payload.schoolId) !== String(user.schoolId)) {
            return;
          }
        }

        scheduleSync(220);
        return;
      }

      scheduleSync(0);
    });

    return () => {
      unsubscribe();
      clearRealtimeSyncTimer();
    };
  }, [token, syncStudents, role, user?.schoolId]);

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
      queryStudents,
      listStudentHistory,
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
      queryStudents,
      listStudentHistory,
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
