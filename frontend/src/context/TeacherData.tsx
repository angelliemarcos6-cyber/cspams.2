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
import type { TeacherRecord, TeacherRecordPayload } from "@/types";

type TeacherSyncScope = "division" | "school" | null;

interface TeacherSyncMeta {
  syncedAt?: string;
  scope?: string;
  scopeKey?: string;
  recordCount?: number;
  currentPage?: number;
  lastPage?: number;
  perPage?: number;
  total?: number;
  from?: number | null;
  to?: number | null;
  hasMorePages?: boolean;
}

interface TeacherRecordsResponse {
  data: TeacherRecord[];
  meta?: TeacherSyncMeta;
}

interface TeacherRecordMutationResponse {
  data: TeacherRecord;
  meta?: TeacherSyncMeta;
}

interface TeacherRecordDeleteResponse {
  data: {
    id: string;
  };
  meta?: TeacherSyncMeta;
}

export interface TeacherListParams {
  page?: number;
  perPage?: number;
  search?: string | null;
  sex?: "all" | "male" | "female" | string | null;
  schoolCode?: string | null;
  schoolCodes?: string[] | null;
  signal?: AbortSignal;
}

export interface TeacherListMeta {
  syncedAt: string | null;
  scope: TeacherSyncScope;
  recordCount: number;
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  from: number | null;
  to: number | null;
  hasMorePages: boolean;
}

export interface TeacherListResult {
  data: TeacherRecord[];
  meta: TeacherListMeta;
}

interface TeacherDataContextType {
  teachers: TeacherRecord[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  lastSyncedAt: string | null;
  syncScope: TeacherSyncScope;
  totalCount: number;
  refreshTeachers: () => Promise<void>;
  listTeachers: (params?: TeacherListParams) => Promise<TeacherListResult>;
  addTeacher: (payload: TeacherRecordPayload) => Promise<void>;
  updateTeacher: (id: string, payload: TeacherRecordPayload) => Promise<void>;
  deleteTeacher: (id: string) => Promise<void>;
}

interface NormalizedTeacherListParams {
  page: number;
  perPage: number;
  search: string;
  sex: string;
  schoolCode: string;
  schoolCodes: string[];
}

const DataContext = createContext<TeacherDataContextType | undefined>(undefined);
const SNAPSHOT_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 200;

const EMPTY_META: TeacherListMeta = {
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

function normalizeScope(value: string | undefined): TeacherSyncScope {
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

function sanitizeSex(value: TeacherListParams["sex"]): string {
  const normalized = (value ?? "").toString().trim().toLowerCase();
  if (normalized === "male" || normalized === "female") {
    return normalized;
  }

  return "";
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

function sanitizeParams(params?: TeacherListParams): NormalizedTeacherListParams {
  const page = toPositiveInt(params?.page, 1);
  const perPage = Math.min(toPositiveInt(params?.perPage, DEFAULT_PER_PAGE), MAX_PER_PAGE);
  const search = (params?.search ?? "").trim();
  const sex = sanitizeSex(params?.sex);
  const schoolCode = sanitizeSchoolCode(params?.schoolCode);
  const schoolCodes = sanitizeSchoolCodes(params?.schoolCodes);

  return {
    page,
    perPage,
    search,
    sex,
    schoolCode,
    schoolCodes,
  };
}

function buildListPath(params: NormalizedTeacherListParams): string {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("per_page", String(params.perPage));

  if (params.search) {
    query.set("search", params.search);
  }

  if (params.sex) {
    query.set("sex", params.sex);
  }

  if (params.schoolCodes.length > 0) {
    query.set("schoolCodes", params.schoolCodes.join(","));
  } else if (params.schoolCode) {
    query.set("schoolCode", params.schoolCode);
  }

  const serialized = query.toString();
  return serialized ? `/api/dashboard/teachers?${serialized}` : "/api/dashboard/teachers";
}

function normalizeMeta(meta: TeacherSyncMeta | undefined, params: NormalizedTeacherListParams, dataLength: number): TeacherListMeta {
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

export function TeacherDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const token = user ? COOKIE_SESSION_TOKEN : "";
  const sessionKey = user ? `${user.role}:${user.id}` : "";

  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncScope, setSyncScope] = useState<TeacherSyncScope>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [snapshotMeta, setSnapshotMeta] = useState<TeacherListMeta>(EMPTY_META);

  const snapshotParamsRef = useRef<NormalizedTeacherListParams>(
    sanitizeParams({ page: 1, perPage: SNAPSHOT_PER_PAGE }),
  );
  const syncInFlightRef = useRef(false);
  const syncQueuedRef = useRef(false);
  const etagRef = useRef<string>("");
  const syncScopeKeyRef = useRef<string>("");
  const previousSessionKeyRef = useRef<string>("");
  const syncGenerationRef = useRef(0);
  const realtimeSyncTimerRef = useRef<number | null>(null);

  const clearRealtimeSyncTimer = () => {
    if (typeof window === "undefined") {
      realtimeSyncTimerRef.current = null;
      return;
    }

    if (realtimeSyncTimerRef.current !== null) {
      window.clearTimeout(realtimeSyncTimerRef.current);
      realtimeSyncTimerRef.current = null;
    }
  };

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
    clearRealtimeSyncTimer();
    setTeachers([]);
    setIsLoading(false);
    setIsSaving(false);
    setError("");
    setLastSyncedAt(null);
    setSyncScope(null);
    setTotalCount(0);
    setSnapshotMeta(EMPTY_META);
  }, [sessionKey]);

  const handleApiError = useCallback(
    (err: unknown) => {
      if (isApiError(err) && (err.status === 401 || err.status === 403)) {
        return; // Auth.tsx heartbeat handles session expiry.
      }

      setError(err instanceof Error ? err.message : "Unexpected server error.");
    },
    [],
  );

  const requestTeachers = useCallback(
    async (tokenValue: string, params: NormalizedTeacherListParams, signal?: AbortSignal): Promise<TeacherListResult> => {
      const response = await apiRequestRaw<TeacherRecordsResponse>(buildListPath(params), { token: tokenValue, signal });
      const data = Array.isArray(response.data?.data) ? response.data.data : [];
      const meta = normalizeMeta(response.data?.meta, params, data.length);

      return {
        data,
        meta,
      };
    },
    [],
  );

  const syncTeachers = useCallback(
    async (silent = false) => {
      if (syncInFlightRef.current) {
        syncQueuedRef.current = true;
        return;
      }

      if (!token) {
        setTeachers([]);
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
      syncQueuedRef.current = false;
      const requestGeneration = syncGenerationRef.current;

      if (!silent) {
        setIsLoading(true);
      }

      setError("");

      try {
        const response = await apiRequestRaw<TeacherRecordsResponse>(buildListPath(snapshotParamsRef.current), {
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
          }
          syncScopeKeyRef.current = payloadScopeKey;
        }

        setTeachers(result.data);
        setSnapshotMeta(result.meta);
        setTotalCount(result.meta.total);
        setLastSyncedAt(response.headers.get("X-Synced-At") ?? result.meta.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(response.data?.meta?.scope) ?? scopeFromHeaders ?? result.meta.scope);
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
          void syncTeachers(true);
        }
      }
    },
    [token, requestTeachers, handleApiError],
  );

  const refreshTeachers = useCallback(async () => {
    await syncTeachers(false);
  }, [syncTeachers]);

  const listTeachers = useCallback(
    async (params?: TeacherListParams): Promise<TeacherListResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      const normalized = sanitizeParams(params);

      try {
        return await requestTeachers(token, normalized, params?.signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err;
        }
        await handleApiError(err);
        throw err;
      }
    },
    [token, requestTeachers, handleApiError],
  );

  const addTeacher = useCallback(
    async (payload: TeacherRecordPayload) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<TeacherRecordMutationResponse>("/api/dashboard/teachers", {
          method: "POST",
          token,
          body: payload,
        });

        const nextRecord = response.data?.data;
        if (nextRecord) {
          setTeachers((current) => [nextRecord, ...current.filter((item) => item.id !== nextRecord.id)].slice(0, SNAPSHOT_PER_PAGE));
        }

        etagRef.current = "";
        await syncTeachers(true);
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncTeachers, handleApiError],
  );

  const updateTeacher = useCallback(
    async (id: string, payload: TeacherRecordPayload) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<TeacherRecordMutationResponse>(`/api/dashboard/teachers/${id}`, {
          method: "PUT",
          token,
          body: payload,
        });

        const nextRecord = response.data?.data;
        if (nextRecord) {
          setTeachers((current) => current.map((item) => (item.id === nextRecord.id ? nextRecord : item)));
        }

        etagRef.current = "";
        await syncTeachers(true);
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncTeachers, handleApiError],
  );

  const deleteTeacher = useCallback(
    async (id: string) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        await apiRequestRaw<TeacherRecordDeleteResponse>(`/api/dashboard/teachers/${id}`, {
          method: "DELETE",
          token,
        });

        setTeachers((current) => current.filter((item) => item.id !== id));
        etagRef.current = "";
        await syncTeachers(true);
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncTeachers, handleApiError],
  );

  useEffect(() => {
    void syncTeachers(false);
  }, [syncTeachers]);

  useEffect(() => {
    if (!token) return;

    const scheduleSync = (delayMs: number) => {
      if (typeof window === "undefined") {
        return;
      }

      clearRealtimeSyncTimer();
      realtimeSyncTimerRef.current = window.setTimeout(() => {
        realtimeSyncTimerRef.current = null;
        void syncTeachers(true);
      }, delayMs);
    };

    const unsubscribe = subscribeSharedSyncPolling((trigger, payload) => {
      if (trigger === "realtime") {
        const entity = payload?.entity ?? "";
        if (entity === "teachers" || entity === "dashboard" || entity === "students") {
          scheduleSync(220);
        }
        return;
      }

      scheduleSync(0);
    });

    return () => {
      unsubscribe();
      clearRealtimeSyncTimer();
    };
  }, [token, syncTeachers]);

  const value = useMemo<TeacherDataContextType>(
    () => ({
      teachers,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      syncScope,
      totalCount,
      refreshTeachers,
      listTeachers,
      addTeacher,
      updateTeacher,
      deleteTeacher,
    }),
    [
      teachers,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      syncScope,
      totalCount,
      refreshTeachers,
      listTeachers,
      addTeacher,
      updateTeacher,
      deleteTeacher,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useTeacherData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useTeacherData must be used within TeacherDataProvider");
  }
  return context;
}
