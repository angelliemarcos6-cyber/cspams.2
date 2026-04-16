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
import { apiRequest, apiRequestRaw, COOKIE_SESSION_TOKEN, getApiBaseUrl, isApiError } from "@/lib/api";
import type {
  AcademicYearOption,
  IndicatorMetric,
  IndicatorSubmission,
  IndicatorSubmissionFileType,
  FormSubmissionHistoryEntry,
  IndicatorSubmissionPayload,
} from "@/types";

type ReviewDecision = "validated" | "returned";

export interface IndicatorListParams {
  page?: number;
  perPage?: number;
  schoolId?: string | number | null;
  academicYearId?: string | number | null;
  status?: string | null;
  reportingPeriod?: string | null;
  signal?: AbortSignal;
}

export interface IndicatorListMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  hasMorePages: boolean;
}

export interface IndicatorListResult {
  data: IndicatorSubmission[];
  meta: IndicatorListMeta;
}

export interface LoadAllSubmissionsOptions {
  signal?: AbortSignal;
}

interface IndicatorSubmissionsMeta {
  current_page?: number;
  last_page?: number;
  per_page?: number;
  total?: number;
}

interface IndicatorSubmissionsResponse {
  data: IndicatorSubmission[];
  meta?: IndicatorSubmissionsMeta;
}

interface IndicatorMetricsResponse {
  data: IndicatorMetric[];
}

interface IndicatorAcademicYearsResponse {
  data: AcademicYearOption[];
}

interface IndicatorSubmissionResponse {
  data: IndicatorSubmission;
}

interface IndicatorHistoryResponse {
  data: FormSubmissionHistoryEntry[];
}

export interface IndicatorDataContextType {
  submissions: IndicatorSubmission[];
  allSubmissions: IndicatorSubmission[];
  metrics: IndicatorMetric[];
  academicYears: AcademicYearOption[];
  isLoading: boolean;
  isAllSubmissionsLoading: boolean;
  isSaving: boolean;
  error: string;
  lastSyncedAt: string | null;
  refreshSubmissions: () => Promise<void>;
  refreshAllSubmissions: (options?: LoadAllSubmissionsOptions) => Promise<void>;
  listSubmissions: (params?: IndicatorListParams) => Promise<IndicatorListResult>;
  listSubmissionsForSchool: (schoolId: string, options?: LoadAllSubmissionsOptions) => Promise<IndicatorSubmission[]>;
  loadAllSubmissions: (options?: LoadAllSubmissionsOptions) => Promise<IndicatorSubmission[]>;
  createSubmission: (payload: IndicatorSubmissionPayload) => Promise<IndicatorSubmission>;
  updateSubmission: (id: string, payload: IndicatorSubmissionPayload) => Promise<IndicatorSubmission>;
  uploadSubmissionFile: (id: string, type: IndicatorSubmissionFileType, file: File) => Promise<IndicatorSubmission>;
  downloadSubmissionFile: (id: string, type: IndicatorSubmissionFileType) => Promise<void>;
  submitSubmission: (id: string) => Promise<IndicatorSubmission>;
  reviewSubmission: (id: string, decision: ReviewDecision, notes?: string) => Promise<IndicatorSubmission>;
  loadHistory: (id: string) => Promise<FormSubmissionHistoryEntry[]>;
}

const IndicatorDataContext = createContext<IndicatorDataContextType | undefined>(undefined);
const AUTO_SYNC_INTERVAL_MS = 60_000;
const REFERENCE_DATA_SYNC_INTERVAL_MS = 5 * 60_000;
const SUBMISSION_SNAPSHOT_PER_PAGE = 100;
const DEFAULT_LIST_PER_PAGE = 25;
const MAX_LIST_PER_PAGE = 100;

function normalizeEtag(value: string | null): string {
  return (value || "").replace(/^W\//, "").replace(/"/g, "");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

interface NormalizedIndicatorListParams {
  page: number;
  perPage: number;
  schoolId: string;
  academicYearId: string;
  status: string;
  reportingPeriod: string;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  return Math.trunc(numeric);
}

function normalizeFilterValue(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function sanitizeIndicatorListParams(params?: IndicatorListParams): NormalizedIndicatorListParams {
  return {
    page: toPositiveInt(params?.page, 1),
    perPage: Math.min(toPositiveInt(params?.perPage, DEFAULT_LIST_PER_PAGE), MAX_LIST_PER_PAGE),
    schoolId: normalizeFilterValue(params?.schoolId),
    academicYearId: normalizeFilterValue(params?.academicYearId),
    status: normalizeFilterValue(params?.status),
    reportingPeriod: normalizeFilterValue(params?.reportingPeriod),
  };
}

function buildSubmissionsPath(params: NormalizedIndicatorListParams): string {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("per_page", String(params.perPage));

  if (params.schoolId) {
    query.set("school_id", params.schoolId);
  }

  if (params.academicYearId) {
    query.set("academic_year_id", params.academicYearId);
  }

  if (params.status) {
    query.set("status", params.status);
  }

  if (params.reportingPeriod) {
    query.set("reporting_period", params.reportingPeriod);
  }

  return `/api/indicators/submissions?${query.toString()}`;
}

function readSubmissionRows(payload: IndicatorSubmissionsResponse | null | undefined): IndicatorSubmission[] {
  return Array.isArray(payload?.data) ? payload.data : [];
}

function normalizeSubmissionListMeta(
  meta: IndicatorSubmissionsMeta | undefined,
  params: NormalizedIndicatorListParams,
  dataLength: number,
): IndicatorListMeta {
  const perPage = toPositiveInt(meta?.per_page, params.perPage);
  const total = toPositiveInt(meta?.total, dataLength);
  const lastPage = Math.max(1, toPositiveInt(meta?.last_page, Math.ceil(Math.max(total, 1) / perPage)));
  const currentPage = Math.min(Math.max(1, toPositiveInt(meta?.current_page, params.page)), lastPage);

  return {
    currentPage,
    lastPage,
    perPage,
    total,
    hasMorePages: currentPage < lastPage,
  };
}

function toSubmissionSortTime(submission: IndicatorSubmission): number {
  return new Date(submission.updatedAt ?? submission.submittedAt ?? submission.createdAt ?? 0).getTime();
}

function parseDownloadFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]).trim();
    } catch {
      return utf8Match[1].trim();
    }
  }

  const basicMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
  if (basicMatch?.[1]) {
    return basicMatch[1].trim();
  }

  return null;
}

export function IndicatorDataProvider({ children }: { children: ReactNode }) {
  const { user, logout, isLoggingOut } = useAuth();
  const token = user ? COOKIE_SESSION_TOKEN : "";
  const sessionKey = user ? `${user.role}:${user.id}` : "";

  const [submissions, setSubmissions] = useState<IndicatorSubmission[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<IndicatorSubmission[]>([]);
  const [metrics, setMetrics] = useState<IndicatorMetric[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAllSubmissionsLoading, setIsAllSubmissionsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const syncInFlightRef = useRef(false);
  const syncQueuedRef = useRef(false);
  const submissionsEtagRef = useRef<string>("");
  const schoolSubmissionsCacheRef = useRef<Map<string, { versionKey: string; rows: IndicatorSubmission[] }>>(new Map());
  const allSubmissionsCacheRef = useRef<{ versionKey: string; rows: IndicatorSubmission[] } | null>(null);
  const allSubmissionsInFlightRef = useRef<{ versionKey: string; promise: Promise<IndicatorSubmission[]> } | null>(null);
  const previousSessionKeyRef = useRef<string>("");
  const syncGenerationRef = useRef(0);
  const referenceDataSyncedAtRef = useRef(0);
  const allSubmissionsLoadingCountRef = useRef(0);

  useEffect(() => {
    if (previousSessionKeyRef.current === sessionKey) {
      return;
    }

    previousSessionKeyRef.current = sessionKey;
    syncGenerationRef.current += 1;
    syncInFlightRef.current = false;
    syncQueuedRef.current = false;
    referenceDataSyncedAtRef.current = 0;
    submissionsEtagRef.current = "";
    schoolSubmissionsCacheRef.current.clear();
    allSubmissionsCacheRef.current = null;
    allSubmissionsInFlightRef.current = null;
    setSubmissions([]);
    setAllSubmissions([]);
    setMetrics([]);
    setAcademicYears([]);
    setIsLoading(false);
    allSubmissionsLoadingCountRef.current = 0;
    setIsAllSubmissionsLoading(false);
    setIsSaving(false);
    setError("");
    setLastSyncedAt(null);
  }, [sessionKey]);

  const handleApiError = useCallback(
    async (err: unknown) => {
      if (isApiError(err)) {
        if (err.status === 401) {
          setError("Your session expired. Please sign in again.");
          if (!isLoggingOut) {
            await logout({ force: true });
          }
          return;
        }

        if (err.status === 403) {
          setError(err.message || "You do not have permission to access indicator data.");
          return;
        }
      }

      setError(err instanceof Error ? err.message : "Unexpected server error.");
    },
    [isLoggingOut, logout],
  );

  const listSubmissions = useCallback(
    async (params?: IndicatorListParams): Promise<IndicatorListResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      const normalized = sanitizeIndicatorListParams(params);

      try {
        const response = await apiRequestRaw<IndicatorSubmissionsResponse>(buildSubmissionsPath(normalized), {
          token,
          signal: params?.signal,
        });

        const data = readSubmissionRows(response.data);
        const meta = normalizeSubmissionListMeta(response.data?.meta, normalized, data.length);

        return {
          data,
          meta,
        };
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

  const buildAllSubmissionsVersionKey = useCallback(
    () => `${sessionKey}|${submissionsEtagRef.current || lastSyncedAt || "pending"}`,
    [lastSyncedAt, sessionKey],
  );

  const listSubmissionsForSchool = useCallback(
    async (schoolId: string, options?: LoadAllSubmissionsOptions): Promise<IndicatorSubmission[]> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      const normalizedSchoolId = normalizeFilterValue(schoolId);
      if (!normalizedSchoolId) {
        return [];
      }

      const signal = options?.signal;
      throwIfAborted(signal);

      const versionKey = `${buildAllSubmissionsVersionKey()}|school:${normalizedSchoolId}`;
      const cached = schoolSubmissionsCacheRef.current.get(normalizedSchoolId);
      if (cached && cached.versionKey === versionKey) {
        return cached.rows;
      }

      const rows: IndicatorSubmission[] = [];
      let nextPage = 1;

      while (true) {
        throwIfAborted(signal);

        const result = await listSubmissions({
          schoolId: normalizedSchoolId,
          page: nextPage,
          perPage: MAX_LIST_PER_PAGE,
          signal,
        });

        throwIfAborted(signal);
        rows.push(...result.data);

        if (!result.meta.hasMorePages || nextPage >= result.meta.lastPage) {
          break;
        }

        nextPage += 1;
      }

      const sortedRows = [...rows].sort((a, b) => toSubmissionSortTime(b) - toSubmissionSortTime(a));
      schoolSubmissionsCacheRef.current.set(normalizedSchoolId, {
        versionKey,
        rows: sortedRows,
      });

      return sortedRows;
    },
    [buildAllSubmissionsVersionKey, listSubmissions, token],
  );

  const readAllSubmissions = useCallback(
    async (signal?: AbortSignal): Promise<IndicatorSubmission[]> => {
      const allRows: IndicatorSubmission[] = [];
      let nextPage = 1;

      while (true) {
        throwIfAborted(signal);

        const result = await listSubmissions({
          page: nextPage,
          perPage: MAX_LIST_PER_PAGE,
          signal,
        });

        throwIfAborted(signal);
        allRows.push(...result.data);

        if (!result.meta.hasMorePages || nextPage >= result.meta.lastPage) {
          return allRows;
        }

        nextPage += 1;
      }
    },
    [listSubmissions],
  );

  const loadAllSubmissions = useCallback(
    async (options?: LoadAllSubmissionsOptions): Promise<IndicatorSubmission[]> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      const signal = options?.signal;
      throwIfAborted(signal);

      const versionKey = buildAllSubmissionsVersionKey();
      const cached = allSubmissionsCacheRef.current;
      if (cached && cached.versionKey === versionKey) {
        return cached.rows;
      }

      if (signal) {
        const rows = await readAllSubmissions(signal);
        throwIfAborted(signal);
        allSubmissionsCacheRef.current = {
          versionKey,
          rows,
        };
        return rows;
      }

      const inFlight = allSubmissionsInFlightRef.current;
      if (inFlight && inFlight.versionKey === versionKey) {
        const rows = await inFlight.promise;
        throwIfAborted(signal);
        return rows;
      }

      const promise = readAllSubmissions()
        .then((rows) => {
          allSubmissionsCacheRef.current = {
            versionKey,
            rows,
          };

          return rows;
        })
        .finally(() => {
          if (allSubmissionsInFlightRef.current?.versionKey === versionKey) {
            allSubmissionsInFlightRef.current = null;
          }
        });

      allSubmissionsInFlightRef.current = {
        versionKey,
        promise,
      };

      const rows = await promise;
      throwIfAborted(signal);
      return rows;
    },
    [buildAllSubmissionsVersionKey, readAllSubmissions, token],
  );

  const refreshAllSubmissions = useCallback(
    async (options?: LoadAllSubmissionsOptions): Promise<void> => {
      const signal = options?.signal;
      const requestVersionKey = buildAllSubmissionsVersionKey();

      allSubmissionsLoadingCountRef.current += 1;
      setIsAllSubmissionsLoading(true);

      try {
        const rows = await loadAllSubmissions({ signal });
        throwIfAborted(signal);

        if (buildAllSubmissionsVersionKey() === requestVersionKey) {
          setAllSubmissions(rows);
        }
      } finally {
        allSubmissionsLoadingCountRef.current = Math.max(0, allSubmissionsLoadingCountRef.current - 1);
        setIsAllSubmissionsLoading(allSubmissionsLoadingCountRef.current > 0);
      }
    },
    [buildAllSubmissionsVersionKey, loadAllSubmissions],
  );

  const syncSubmissions = useCallback(
    async (silent = false) => {
      if (syncInFlightRef.current) {
        syncQueuedRef.current = true;
        return;
      }

      if (!token) {
        setSubmissions([]);
        setAllSubmissions([]);
        setMetrics([]);
        setAcademicYears([]);
        referenceDataSyncedAtRef.current = 0;
        submissionsEtagRef.current = "";
        allSubmissionsCacheRef.current = null;
        allSubmissionsInFlightRef.current = null;
        setIsLoading(false);
        allSubmissionsLoadingCountRef.current = 0;
        setIsAllSubmissionsLoading(false);
        setIsSaving(false);
        setError("");
        setLastSyncedAt(null);
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
        const snapshotParams = sanitizeIndicatorListParams({ page: 1, perPage: SUBMISSION_SNAPSHOT_PER_PAGE });
        const shouldRefreshReferenceData =
          metrics.length === 0 ||
          academicYears.length === 0 ||
          Date.now() - referenceDataSyncedAtRef.current > REFERENCE_DATA_SYNC_INTERVAL_MS;

        const [submissionsResponse, metricPayload, yearPayload] = await Promise.all([
          apiRequestRaw<IndicatorSubmissionsResponse>(buildSubmissionsPath(snapshotParams), {
            token,
            extraHeaders: submissionsEtagRef.current ? { "If-None-Match": submissionsEtagRef.current } : undefined,
          }),
          shouldRefreshReferenceData
            ? apiRequest<IndicatorMetricsResponse>("/api/indicators/metrics", { token })
            : Promise.resolve<IndicatorMetricsResponse | null>(null),
          shouldRefreshReferenceData
            ? apiRequest<IndicatorAcademicYearsResponse>("/api/indicators/academic-years", { token })
            : Promise.resolve<IndicatorAcademicYearsResponse | null>(null),
        ]);

        if (requestGeneration !== syncGenerationRef.current) {
          return;
        }

        const nextEtag = normalizeEtag(
          submissionsResponse.headers.get("X-Sync-Etag") || submissionsResponse.headers.get("ETag"),
        );
        if (nextEtag) {
          submissionsEtagRef.current = nextEtag;
        }

        const submissionsChanged = submissionsResponse.status !== 304;
        if (submissionsChanged) {
          schoolSubmissionsCacheRef.current.clear();
          allSubmissionsCacheRef.current = null;
          allSubmissionsInFlightRef.current = null;
          setAllSubmissions([]);
          setSubmissions(readSubmissionRows(submissionsResponse.data));
        }
        if (shouldRefreshReferenceData) {
          setMetrics(Array.isArray(metricPayload?.data) ? metricPayload?.data : []);
          setAcademicYears(Array.isArray(yearPayload?.data) ? yearPayload?.data : []);
          referenceDataSyncedAtRef.current = Date.now();
        }
        if (!silent || submissionsChanged || shouldRefreshReferenceData) {
          setLastSyncedAt(submissionsResponse.headers.get("X-Synced-At") || new Date().toISOString());
        }
      } catch (err) {
        if (requestGeneration !== syncGenerationRef.current) {
          return;
        }
        await handleApiError(err);
      } finally {
        if (requestGeneration === syncGenerationRef.current) {
          syncInFlightRef.current = false;
          if (!silent) {
            setIsLoading(false);
          }
        }

        if (requestGeneration === syncGenerationRef.current && syncQueuedRef.current) {
          syncQueuedRef.current = false;
          void syncSubmissions(true);
        }
      }
    },
    [academicYears.length, handleApiError, metrics.length, token],
  );

  const refreshSubmissions = useCallback(async () => {
    await syncSubmissions(false);
  }, [syncSubmissions]);

  const createSubmission = useCallback(
    async (payload: IndicatorSubmissionPayload): Promise<IndicatorSubmission> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequest<IndicatorSubmissionResponse>("/api/indicators/submissions", {
          method: "POST",
          token,
          body: {
            academic_year_id: payload.academicYearId,
            reporting_period: payload.reportingPeriod ?? null,
            notes: payload.notes ?? null,
            indicators: payload.indicators.map((entry) => ({
              metric_id: entry.metricId,
              target_value: entry.targetValue ?? null,
              actual_value: entry.actualValue ?? null,
              target: entry.target ?? null,
              actual: entry.actual ?? null,
              remarks: entry.remarks ?? null,
            })),
          },
        });

        allSubmissionsCacheRef.current = null;
        await syncSubmissions(true);
        return response.data;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncSubmissions, handleApiError],
  );

  const submitSubmission = useCallback(
    async (id: string): Promise<IndicatorSubmission> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequest<IndicatorSubmissionResponse>(`/api/indicators/submissions/${id}/submit`, {
          method: "POST",
          token,
        });

        allSubmissionsCacheRef.current = null;
        await syncSubmissions(true);
        return response.data;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncSubmissions, handleApiError],
  );

  const updateSubmission = useCallback(
    async (id: string, payload: IndicatorSubmissionPayload): Promise<IndicatorSubmission> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequest<IndicatorSubmissionResponse>(`/api/indicators/submissions/${id}`, {
          method: "PUT",
          token,
          body: {
            academic_year_id: payload.academicYearId,
            reporting_period: payload.reportingPeriod ?? null,
            notes: payload.notes ?? null,
            indicators: payload.indicators.map((entry) => ({
              metric_id: entry.metricId,
              target_value: entry.targetValue ?? null,
              actual_value: entry.actualValue ?? null,
              target: entry.target ?? null,
              actual: entry.actual ?? null,
              remarks: entry.remarks ?? null,
            })),
          },
        });

        allSubmissionsCacheRef.current = null;
        await syncSubmissions(true);
        return response.data;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncSubmissions, handleApiError],
  );

  const uploadSubmissionFile = useCallback(
    async (id: string, type: IndicatorSubmissionFileType, file: File): Promise<IndicatorSubmission> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const formData = new FormData();
        formData.append("type", type);
        formData.append("file", file);

        const response = await apiRequest<IndicatorSubmissionResponse>(`/api/submissions/${id}/upload-file`, {
          method: "POST",
          token,
          body: formData,
        });

        allSubmissionsCacheRef.current = null;
        await syncSubmissions(true);
        return response.data;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncSubmissions, handleApiError],
  );

  const downloadSubmissionFile = useCallback(
    async (id: string, type: IndicatorSubmissionFileType): Promise<void> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setError("");

      try {
        const endpoint = `${getApiBaseUrl()}/api/submissions/${id}/download/${type}`;
        const headers = new Headers({ Accept: "*/*" });
        if (token !== COOKIE_SESSION_TOKEN) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        const response = await fetch(endpoint, {
          method: "GET",
          credentials: token === COOKIE_SESSION_TOKEN ? "include" : "omit",
          headers,
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { message?: string } | null;
          throw new Error(payload?.message?.trim() || `Request failed with status ${response.status}.`);
        }

        const blob = await response.blob();
        const filename = parseDownloadFilename(response.headers.get("Content-Disposition")) ?? `${type}-${id}`;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      } catch (err) {
        await handleApiError(err);
        throw err;
      }
    },
    [token, handleApiError],
  );

  const reviewSubmission = useCallback(
    async (id: string, decision: ReviewDecision, notes?: string): Promise<IndicatorSubmission> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequest<IndicatorSubmissionResponse>(`/api/indicators/submissions/${id}/review`, {
          method: "POST",
          token,
          body: {
            decision,
            notes: notes?.trim() || null,
          },
        });

        allSubmissionsCacheRef.current = null;
        await syncSubmissions(true);
        return response.data;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncSubmissions, handleApiError],
  );

  const loadHistory = useCallback(
    async (id: string): Promise<FormSubmissionHistoryEntry[]> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      try {
        const response = await apiRequest<IndicatorHistoryResponse>(`/api/indicators/submissions/${id}/history`, { token });
        return Array.isArray(response.data) ? response.data : [];
      } catch (err) {
        await handleApiError(err);
        throw err;
      }
    },
    [token, handleApiError],
  );

  useEffect(() => {
    if (!token) return;

    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void syncSubmissions(true);
    }, AUTO_SYNC_INTERVAL_MS);

    const syncOnFocus = () => {
      void syncSubmissions(true);
    };
    const syncOnRealtime = (event: Event) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      const payload = (event as CustomEvent<{ entity?: string }>).detail;
      if (!payload?.entity) return;
      if (payload.entity === "indicators") {
        void syncSubmissions(true);
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
  }, [token, syncSubmissions]);

  const value = useMemo<IndicatorDataContextType>(
    () => ({
      submissions,
      allSubmissions,
      metrics,
      academicYears,
      isLoading,
      isAllSubmissionsLoading,
      isSaving,
      error,
      lastSyncedAt,
      refreshSubmissions,
      refreshAllSubmissions,
      listSubmissions,
      listSubmissionsForSchool,
      loadAllSubmissions,
      createSubmission,
      updateSubmission,
      uploadSubmissionFile,
      downloadSubmissionFile,
      submitSubmission,
      reviewSubmission,
      loadHistory,
    }),
    [
      submissions,
      allSubmissions,
      metrics,
      academicYears,
      isLoading,
      isAllSubmissionsLoading,
      isSaving,
      error,
      lastSyncedAt,
      refreshSubmissions,
      refreshAllSubmissions,
      listSubmissions,
      listSubmissionsForSchool,
      loadAllSubmissions,
      createSubmission,
      updateSubmission,
      uploadSubmissionFile,
      downloadSubmissionFile,
      submitSubmission,
      reviewSubmission,
      loadHistory,
    ],
  );

  return <IndicatorDataContext.Provider value={value}>{children}</IndicatorDataContext.Provider>;
}

export function useIndicatorData() {
  const context = useContext(IndicatorDataContext);
  if (!context) {
    throw new Error("useIndicatorData must be used within IndicatorDataProvider");
  }
  return context;
}
