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
  SchoolHeadAccountActivationResult,
  SchoolHeadAccountActionVerificationCodeResult,
  SchoolHeadAccountRemovalResult,
  SchoolHeadAccountPayload,
  SchoolHeadAccountProfileUpsertResult,
  SchoolHeadAccountProvisioningReceipt,
  SchoolHeadAccountStatusUpdatePayload,
  SchoolHeadAccountStatusUpdateResult,
  SchoolHeadPasswordResetLinkResult,
  SchoolHeadSetupLinkResult,
  SchoolBulkImportResult,
  SchoolBulkImportRowPayload,
  SchoolReminderReceipt,
  SchoolRecord,
  SchoolRecordDeletePreview,
  SchoolRecordPayload,
  SyncAlert,
  TargetsMetSnapshot,
} from "@/types";

type SyncScope = "division" | "school" | null;
type SyncStatus = "idle" | "updated" | "up_to_date" | "error";

interface SyncMeta {
  syncedAt?: string;
  scope?: string;
  scopeKey?: string;
  recordCount?: number;
  targetsMet?: TargetsMetSnapshot;
  alerts?: SyncAlert[];
}

interface SchoolRecordsResponse {
  data: SchoolRecord[];
  meta?: SyncMeta;
}

interface SchoolRecordMutationResponse {
  data: SchoolRecord;
  meta?: SyncMeta & {
    schoolHeadAccount?: SchoolHeadAccountProvisioningReceipt;
  };
}

interface SchoolRecordDeleteResponse {
  data: {
    id: string;
    schoolId?: string;
    schoolName?: string;
  };
  meta?: SyncMeta;
}

interface SchoolRecordDeletePreviewResponse {
  data: SchoolRecordDeletePreview;
}

interface ArchivedSchoolRecordsResponse {
  data: SchoolRecord[];
  meta?: {
    count?: number;
  };
}

interface SchoolRecordRestoreResponse {
  data: SchoolRecord;
  meta?: SyncMeta;
}

interface SchoolReminderResponse {
  data: SchoolReminderReceipt;
}

interface SchoolRecordBulkImportResponse {
  data: SchoolBulkImportResult;
  meta?: SyncMeta;
}

interface SchoolHeadAccountStatusResponse {
  data: SchoolHeadAccountStatusUpdateResult;
}

interface SchoolHeadAccountActionVerificationCodeResponse {
  data: SchoolHeadAccountActionVerificationCodeResult;
}

interface SchoolHeadAccountActivationResponse {
  data: SchoolHeadAccountActivationResult;
}

interface SchoolHeadSetupLinkResponse {
  data: SchoolHeadSetupLinkResult;
}

interface SchoolHeadPasswordResetLinkResponse {
  data: SchoolHeadPasswordResetLinkResult;
}

interface SchoolHeadAccountProfileResponse {
  data: SchoolHeadAccountProfileUpsertResult;
}

interface SchoolHeadAccountRemovalResponse {
  data: SchoolHeadAccountRemovalResult;
}

interface DataContextType {
  records: SchoolRecord[];
  recordCount: number;
  targetsMet: TargetsMetSnapshot | null;
  syncAlerts: SyncAlert[];
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  lastSyncedAt: string | null;
  syncScope: SyncScope;
  syncStatus: SyncStatus;
  refreshRecords: () => Promise<void>;
  addRecord: (record: SchoolRecordPayload) => Promise<SchoolHeadAccountProvisioningReceipt | null>;
  updateRecord: (id: string, updates: SchoolRecordPayload) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  previewDeleteRecord: (id: string) => Promise<SchoolRecordDeletePreview>;
  listArchivedRecords: () => Promise<SchoolRecord[]>;
  restoreRecord: (id: string) => Promise<void>;
  sendReminder: (id: string, notes?: string | null) => Promise<SchoolReminderReceipt>;
  updateSchoolHeadAccountStatus: (
    schoolId: string,
    payload: SchoolHeadAccountStatusUpdatePayload,
  ) => Promise<SchoolHeadAccountStatusUpdateResult>;
  activateSchoolHeadAccount: (
    schoolId: string,
    payload?: { reason?: string | null },
  ) => Promise<SchoolHeadAccountActivationResult>;
  issueSchoolHeadAccountActionVerificationCode: (
    schoolId: string,
    targetStatus: "suspended" | "locked" | "archived" | "deleted" | "email_change" | "password_reset",
  ) => Promise<SchoolHeadAccountActionVerificationCodeResult>;
  issueSchoolHeadSetupLink: (
    schoolId: string,
    reason?: string | null,
  ) => Promise<SchoolHeadSetupLinkResult>;
  issueSchoolHeadPasswordResetLink: (
    schoolId: string,
    payload: { reason: string; verificationChallengeId: string; verificationCode: string },
  ) => Promise<SchoolHeadPasswordResetLinkResult>;
  upsertSchoolHeadAccountProfile: (
    schoolId: string,
    payload: SchoolHeadAccountPayload,
  ) => Promise<SchoolHeadAccountProfileUpsertResult>;
  removeSchoolHeadAccount: (
    schoolId: string,
    payload: { reason: string; verificationChallengeId: string; verificationCode: string },
  ) => Promise<SchoolHeadAccountRemovalResult>;
  bulkImportRecords: (
    rows: SchoolBulkImportRowPayload[],
    options?: { updateExisting?: boolean; restoreArchived?: boolean },
  ) => Promise<SchoolBulkImportResult>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

function normalizeScope(value: string | undefined): SyncScope {
  if (value === "division" || value === "school") return value;
  return null;
}

function normalizeScopeKey(value: string | undefined): string | null {
  const normalized = value?.trim() || "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeEtag(value: string | null): string {
  return (value || "").replace(/^W\//, "").replace(/"/g, "");
}

function normalizeRecordCount(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const token = user ? COOKIE_SESSION_TOKEN : "";
  const sessionKey = user ? `${user.role}:${user.id}` : "";

  const [records, setRecords] = useState<SchoolRecord[]>([]);
  const [recordCount, setRecordCount] = useState(0);
  const [targetsMet, setTargetsMet] = useState<TargetsMetSnapshot | null>(null);
  const [syncAlerts, setSyncAlerts] = useState<SyncAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncScope, setSyncScope] = useState<SyncScope>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
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
    setRecords([]);
    setRecordCount(0);
    setTargetsMet(null);
    setSyncAlerts([]);
    setIsLoading(false);
    setIsSaving(false);
    setError("");
    setLastSyncedAt(null);
    setSyncScope(null);
    setSyncStatus("idle");
  }, [sessionKey]);

  const handleApiError = useCallback(
    async (err: unknown) => {
      if (isApiError(err)) {
        if (err.status === 401) {
          setError("Authentication check failed. Please refresh and sign in again if needed.");
          setSyncStatus("error");
          return;
        }

        if (err.status === 403) {
          setError(err.message || "You do not have permission to access this data.");
          setSyncStatus("error");
          return;
        }
      }

      setError(err instanceof Error ? err.message : "Unexpected server error.");
      setSyncStatus("error");
    },
    [],
  );

  const syncRecords = useCallback(
    async (silent = false) => {
      if (syncInFlightRef.current) {
        syncQueuedRef.current = true;
        return;
      }

      if (!token) {
        setRecords([]);
        setRecordCount(0);
        setTargetsMet(null);
        setSyncAlerts([]);
        setIsLoading(false);
        setIsSaving(false);
        setError("");
        setLastSyncedAt(null);
        setSyncScope(null);
        setSyncStatus("idle");
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
        const response = await apiRequestRaw<SchoolRecordsResponse>("/api/dashboard/records", {
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
            setTargetsMet(null);
            setSyncAlerts([]);
          }
          syncScopeKeyRef.current = scopeKeyFromHeaders;
        }

        if (response.status === 304) {
          setRecordCount((current) =>
            normalizeRecordCount(response.headers.get("X-Sync-Record-Count"), current),
          );
          if (!silent) {
            setLastSyncedAt(response.headers.get("X-Synced-At") || new Date().toISOString());
          }
          if (scopeFromHeaders) {
            setSyncScope(scopeFromHeaders);
          }
          setSyncStatus("up_to_date");
          return;
        }

        const payload = response.data;
        const payloadScopeKey = normalizeScopeKey(payload?.meta?.scopeKey);
        if (payloadScopeKey) {
          if (syncScopeKeyRef.current && syncScopeKeyRef.current !== payloadScopeKey) {
            etagRef.current = "";
            setTargetsMet(null);
            setSyncAlerts([]);
          }
          syncScopeKeyRef.current = payloadScopeKey;
        }

        setRecords(Array.isArray(payload?.data) ? payload.data : []);
        setRecordCount(normalizeRecordCount(payload?.meta?.recordCount, payload?.data?.length ?? 0));
        setTargetsMet(payload?.meta?.targetsMet ?? null);
        setSyncAlerts(Array.isArray(payload?.meta?.alerts) ? payload.meta.alerts : []);
        setLastSyncedAt(response.headers.get("X-Synced-At") ?? payload?.meta?.syncedAt ?? new Date().toISOString());
        setSyncScope(normalizeScope(payload?.meta?.scope) ?? scopeFromHeaders);
        setSyncStatus("updated");
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
          void syncRecords(true);
        }
      }
    },
    [token, handleApiError],
  );

  const refreshRecords = useCallback(async () => {
    await syncRecords(false);
  }, [syncRecords]);

  const addRecord = useCallback(
    async (record: SchoolRecordPayload): Promise<SchoolHeadAccountProvisioningReceipt | null> => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        setSyncStatus("error");
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolRecordMutationResponse>("/api/dashboard/records", {
          method: "POST",
          token,
          body: record,
        });

        const nextRecord = response.data?.data;
        if (nextRecord) {
          setRecords((current) => [nextRecord, ...current.filter((item) => item.id !== nextRecord.id)]);
        }
        setRecordCount((current) =>
          normalizeRecordCount(response.data?.meta?.recordCount ?? response.headers.get("X-Sync-Record-Count"), current),
        );

        const scope = normalizeScope(response.data?.meta?.scope) ?? normalizeScope(response.headers.get("X-Sync-Scope") || undefined);
        if (scope) {
          setSyncScope(scope);
        }

        const scopeKey = normalizeScopeKey(response.data?.meta?.scopeKey ?? (response.headers.get("X-Sync-Scope-Key") || undefined));
        if (scopeKey) {
          syncScopeKeyRef.current = scopeKey;
        }

        const nextEtag = normalizeEtag(response.headers.get("X-Sync-Etag") || response.headers.get("ETag"));
        if (nextEtag) {
          etagRef.current = nextEtag;
        }

        setLastSyncedAt(response.headers.get("X-Synced-At") ?? response.data?.meta?.syncedAt ?? new Date().toISOString());
        setTargetsMet(response.data?.meta?.targetsMet ?? null);
        setSyncAlerts(Array.isArray(response.data?.meta?.alerts) ? response.data.meta.alerts : []);
        setSyncStatus("updated");

        return response.data?.meta?.schoolHeadAccount ?? null;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, handleApiError],
  );

  const updateRecord = useCallback(
    async (id: string, updates: SchoolRecordPayload) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        setSyncStatus("error");
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolRecordMutationResponse>(`/api/dashboard/records/${id}`, {
          method: "PUT",
          token,
          body: updates,
        });

        const nextRecord = response.data?.data;
        if (nextRecord) {
          setRecords((current) => [nextRecord, ...current.filter((item) => item.id !== nextRecord.id)]);
        }
        setRecordCount((current) =>
          normalizeRecordCount(response.data?.meta?.recordCount ?? response.headers.get("X-Sync-Record-Count"), current),
        );

        const scope = normalizeScope(response.data?.meta?.scope) ?? normalizeScope(response.headers.get("X-Sync-Scope") || undefined);
        if (scope) {
          setSyncScope(scope);
        }

        const scopeKey = normalizeScopeKey(response.data?.meta?.scopeKey ?? (response.headers.get("X-Sync-Scope-Key") || undefined));
        if (scopeKey) {
          syncScopeKeyRef.current = scopeKey;
        }

        const nextEtag = normalizeEtag(response.headers.get("X-Sync-Etag") || response.headers.get("ETag"));
        if (nextEtag) {
          etagRef.current = nextEtag;
        }

        setLastSyncedAt(response.headers.get("X-Synced-At") ?? response.data?.meta?.syncedAt ?? new Date().toISOString());
        setTargetsMet(response.data?.meta?.targetsMet ?? null);
        setSyncAlerts(Array.isArray(response.data?.meta?.alerts) ? response.data.meta.alerts : []);
        setSyncStatus("updated");
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, handleApiError],
  );

  const deleteRecord = useCallback(
    async (id: string) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        setSyncStatus("error");
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolRecordDeleteResponse>(`/api/dashboard/records/${id}`, {
          method: "DELETE",
          token,
        });

        setRecords((current) => current.filter((item) => item.id !== id));
        setRecordCount((current) =>
          normalizeRecordCount(response.data?.meta?.recordCount ?? response.headers.get("X-Sync-Record-Count"), current),
        );

        const scope = normalizeScope(response.data?.meta?.scope) ?? normalizeScope(response.headers.get("X-Sync-Scope") || undefined);
        if (scope) {
          setSyncScope(scope);
        }

        const scopeKey = normalizeScopeKey(response.data?.meta?.scopeKey ?? (response.headers.get("X-Sync-Scope-Key") || undefined));
        if (scopeKey) {
          syncScopeKeyRef.current = scopeKey;
        }

        const nextEtag = normalizeEtag(response.headers.get("X-Sync-Etag") || response.headers.get("ETag"));
        if (nextEtag) {
          etagRef.current = nextEtag;
        }

        setLastSyncedAt(response.headers.get("X-Synced-At") ?? response.data?.meta?.syncedAt ?? new Date().toISOString());
        setTargetsMet(response.data?.meta?.targetsMet ?? null);
        setSyncAlerts(Array.isArray(response.data?.meta?.alerts) ? response.data.meta.alerts : []);
        setSyncStatus("updated");
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, handleApiError],
  );

  const previewDeleteRecord = useCallback(
    async (id: string): Promise<SchoolRecordDeletePreview> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      try {
        const response = await apiRequestRaw<SchoolRecordDeletePreviewResponse>(`/api/dashboard/records/${id}/delete-preview`, {
          method: "GET",
          token,
        });

        if (!response.data?.data) {
          throw new Error("Unable to load delete preview.");
        }

        return response.data.data;
      } catch (err) {
        await handleApiError(err);
        throw err;
      }
    },
    [token, handleApiError],
  );

  const listArchivedRecords = useCallback(
    async (): Promise<SchoolRecord[]> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      try {
        const response = await apiRequestRaw<ArchivedSchoolRecordsResponse>("/api/dashboard/records/archived", {
          method: "GET",
          token,
        });

        return Array.isArray(response.data?.data) ? response.data.data : [];
      } catch (err) {
        await handleApiError(err);
        throw err;
      }
    },
    [token, handleApiError],
  );

  const restoreRecord = useCallback(
    async (id: string) => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        setSyncStatus("error");
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolRecordRestoreResponse>(`/api/dashboard/records/${id}/restore`, {
          method: "POST",
          token,
        });

        const nextRecord = response.data?.data;
        if (nextRecord) {
          setRecords((current) => [nextRecord, ...current.filter((item) => item.id !== nextRecord.id)]);
        }
        setRecordCount((current) =>
          normalizeRecordCount(response.data?.meta?.recordCount ?? response.headers.get("X-Sync-Record-Count"), current),
        );

        const scope = normalizeScope(response.data?.meta?.scope) ?? normalizeScope(response.headers.get("X-Sync-Scope") || undefined);
        if (scope) {
          setSyncScope(scope);
        }

        const scopeKey = normalizeScopeKey(response.data?.meta?.scopeKey ?? (response.headers.get("X-Sync-Scope-Key") || undefined));
        if (scopeKey) {
          syncScopeKeyRef.current = scopeKey;
        }

        const nextEtag = normalizeEtag(response.headers.get("X-Sync-Etag") || response.headers.get("ETag"));
        if (nextEtag) {
          etagRef.current = nextEtag;
        }

        setLastSyncedAt(response.headers.get("X-Synced-At") ?? response.data?.meta?.syncedAt ?? new Date().toISOString());
        setTargetsMet(response.data?.meta?.targetsMet ?? null);
        setSyncAlerts(Array.isArray(response.data?.meta?.alerts) ? response.data.meta.alerts : []);
        setSyncStatus("updated");
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, handleApiError],
  );

  const sendReminder = useCallback(
    async (id: string, notes?: string | null): Promise<SchoolReminderReceipt> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolReminderResponse>(`/api/dashboard/records/${id}/send-reminder`, {
          method: "POST",
          token,
          body: {
            notes: notes?.trim() || undefined,
          },
        });

        if (!response.data?.data) {
          throw new Error("Reminder response is empty.");
        }

        return response.data.data;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, handleApiError],
  );

  const updateSchoolHeadAccountStatus = useCallback(
    async (
      schoolId: string,
      payload: SchoolHeadAccountStatusUpdatePayload,
    ): Promise<SchoolHeadAccountStatusUpdateResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolHeadAccountStatusResponse>(
          `/api/dashboard/records/${encodeURIComponent(schoolId)}/school-head-account`,
          {
            method: "PATCH",
            token,
            body: payload,
          },
        );

        const result = response.data?.data;
        if (!result?.account) {
          throw new Error("Account update response is empty.");
        }

        setRecords((current) =>
          current.map((record) =>
            record.id === schoolId
              ? {
                  ...record,
                  schoolHeadAccount: result.account,
                }
              : record,
          ),
        );
        setLastSyncedAt(new Date().toISOString());
        setSyncStatus("updated");
        etagRef.current = "";
        await syncRecords(true);

        return result;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, handleApiError, syncRecords],
  );

  const issueSchoolHeadAccountActionVerificationCode = useCallback(
    async (
      schoolId: string,
      targetStatus: "suspended" | "locked" | "archived" | "deleted" | "email_change" | "password_reset",
    ): Promise<SchoolHeadAccountActionVerificationCodeResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      try {
        const response = await apiRequestRaw<SchoolHeadAccountActionVerificationCodeResponse>(
          `/api/dashboard/records/${encodeURIComponent(schoolId)}/school-head-account/verification-code`,
          {
            method: "POST",
            token,
            body: {
              targetStatus,
            },
          },
        );

        const result = response.data?.data;
        if (!result?.challengeId || !result.expiresAt) {
          throw new Error("Verification code response is empty.");
        }

        return result;
      } catch (err) {
        await handleApiError(err);
        throw err;
      }
    },
    [token, handleApiError],
  );

  const activateSchoolHeadAccount = useCallback(
    async (
      schoolId: string,
      payload?: { reason?: string | null },
    ): Promise<SchoolHeadAccountActivationResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolHeadAccountActivationResponse>(
          `/api/dashboard/records/${encodeURIComponent(schoolId)}/school-head-account/activate`,
          {
            method: "POST",
            token,
            body: {
              reason: payload?.reason?.trim() || undefined,
            },
          },
        );

        const result = response.data?.data;
        if (!result?.account) {
          throw new Error("Account activation response is empty.");
        }

        setRecords((current) =>
          current.map((record) =>
            record.id === schoolId
              ? {
                  ...record,
                  schoolHeadAccount: result.account,
                }
              : record,
          ),
        );
        setLastSyncedAt(new Date().toISOString());
        setSyncStatus("updated");
        etagRef.current = "";
        await syncRecords(true);

        return result;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, handleApiError, syncRecords],
  );

  const issueSchoolHeadSetupLink = useCallback(
    async (schoolId: string, reason?: string | null): Promise<SchoolHeadSetupLinkResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolHeadSetupLinkResponse>(
          `/api/dashboard/records/${encodeURIComponent(schoolId)}/school-head-account/setup-link`,
          {
            method: "POST",
            token,
            body: {
              reason: reason?.trim() || undefined,
            },
          },
        );

        const result = response.data?.data;
        if (!result?.account) {
          throw new Error("Setup link response is empty.");
        }

        setRecords((current) =>
          current.map((record) =>
            record.id === schoolId
              ? {
                  ...record,
                  schoolHeadAccount: result.account,
                }
              : record,
          ),
        );
        setLastSyncedAt(new Date().toISOString());
        setSyncStatus("updated");
        etagRef.current = "";
        await syncRecords(true);

        return result;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, handleApiError, syncRecords],
  );

  const issueSchoolHeadPasswordResetLink = useCallback(
    async (
      schoolId: string,
      payload: { reason: string; verificationChallengeId: string; verificationCode: string },
    ): Promise<SchoolHeadPasswordResetLinkResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      const trimmedReason = payload.reason.trim();
      const verificationChallengeId = payload.verificationChallengeId.trim();
      const verificationCode = payload.verificationCode.trim();

      if (trimmedReason.length < 5) {
        throw new Error("Reason must be at least 5 characters.");
      }

      if (!verificationChallengeId) {
        throw new Error("Verification challenge is required.");
      }

      if (!/^\d{6}$/.test(verificationCode)) {
        throw new Error("Verification code must be a 6-digit number.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolHeadPasswordResetLinkResponse>(
          `/api/dashboard/records/${encodeURIComponent(schoolId)}/school-head-account/password-reset-link`,
          {
            method: "POST",
            token,
            body: {
              reason: trimmedReason,
              verificationChallengeId,
              verificationCode,
            },
          },
        );

        const result = response.data?.data;
        if (!result?.account) {
          throw new Error("Password reset link response is empty.");
        }

        setRecords((current) =>
          current.map((record) =>
            record.id === schoolId
              ? {
                  ...record,
                  schoolHeadAccount: result.account,
                }
              : record,
          ),
        );
        setLastSyncedAt(new Date().toISOString());
        setSyncStatus("updated");
        etagRef.current = "";
        await syncRecords(true);

        return result;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, handleApiError, syncRecords],
  );

  const upsertSchoolHeadAccountProfile = useCallback(
    async (schoolId: string, payload: SchoolHeadAccountPayload): Promise<SchoolHeadAccountProfileUpsertResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      const name = payload.name?.trim() ?? "";
      const email = payload.email?.trim() ?? "";
      const reason = payload.reason?.trim() || undefined;
      const verificationChallengeId = payload.verificationChallengeId?.trim() || undefined;
      const verificationCode = payload.verificationCode?.trim() || undefined;
      if (!name || !email) {
        throw new Error("Account name and email are required.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolHeadAccountProfileResponse>(
          `/api/dashboard/records/${encodeURIComponent(schoolId)}/school-head-account/profile`,
          {
            method: "PUT",
            token,
            body: {
              name,
              email,
              reason,
              verificationChallengeId,
              verificationCode,
            },
          },
        );

        const result = response.data?.data;
        if (!result?.account) {
          throw new Error("Account update response is empty.");
        }

        setRecords((current) =>
          current.map((record) =>
            record.id === schoolId
              ? {
                  ...record,
                  schoolHeadAccount: result.account,
                }
              : record,
          ),
        );
        setLastSyncedAt(new Date().toISOString());
        setSyncStatus("updated");
        etagRef.current = "";
        await syncRecords(true);

        return result;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, handleApiError, syncRecords],
  );

  const removeSchoolHeadAccount = useCallback(
    async (
      schoolId: string,
      payload: { reason: string; verificationChallengeId: string; verificationCode: string },
    ): Promise<SchoolHeadAccountRemovalResult> => {
      if (!token) {
        throw new Error("You are signed out. Please sign in again.");
      }

      const reason = payload.reason?.trim() ?? "";
      const verificationChallengeId = payload.verificationChallengeId?.trim() ?? "";
      const verificationCode = payload.verificationCode?.trim() ?? "";

      if (reason.length < 5) {
        throw new Error("Reason must be at least 5 characters.");
      }

      if (!verificationChallengeId || !verificationCode) {
        throw new Error("Verification challenge and code are required.");
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolHeadAccountRemovalResponse>(
          `/api/dashboard/records/${encodeURIComponent(schoolId)}/school-head-account`,
          {
            method: "DELETE",
            token,
            body: {
              reason,
              verificationChallengeId,
              verificationCode,
            },
          },
        );

        const result = response.data?.data;
        if (!result?.message) {
          throw new Error("Account removal response is empty.");
        }

        setRecords((current) =>
          current.map((record) =>
            record.id === schoolId
              ? {
                  ...record,
                  schoolHeadAccount: null,
                }
              : record,
          ),
        );
        setLastSyncedAt(new Date().toISOString());
        setSyncStatus("updated");
        etagRef.current = "";
        await syncRecords(true);

        return result;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, handleApiError, syncRecords],
  );

  const bulkImportRecords = useCallback(
    async (
      rows: SchoolBulkImportRowPayload[],
      options?: { updateExisting?: boolean; restoreArchived?: boolean },
    ): Promise<SchoolBulkImportResult> => {
      if (!token) {
        const authError = new Error("You are signed out. Please sign in again.");
        setError(authError.message);
        setSyncStatus("error");
        throw authError;
      }

      setIsSaving(true);
      setError("");

      try {
        const response = await apiRequestRaw<SchoolRecordBulkImportResponse>("/api/dashboard/records/bulk-import", {
          method: "POST",
          token,
          body: {
            rows,
            options: {
              updateExisting: options?.updateExisting ?? true,
              restoreArchived: options?.restoreArchived ?? true,
            },
          },
        });

        const scope = normalizeScope(response.data?.meta?.scope) ?? normalizeScope(response.headers.get("X-Sync-Scope") || undefined);
        if (scope) {
          setSyncScope(scope);
        }

        const scopeKey = normalizeScopeKey(response.data?.meta?.scopeKey ?? (response.headers.get("X-Sync-Scope-Key") || undefined));
        if (scopeKey) {
          syncScopeKeyRef.current = scopeKey;
        }

        const nextEtag = normalizeEtag(response.headers.get("X-Sync-Etag") || response.headers.get("ETag"));
        if (nextEtag) {
          etagRef.current = nextEtag;
        }

        setLastSyncedAt(response.headers.get("X-Synced-At") ?? response.data?.meta?.syncedAt ?? new Date().toISOString());
        setTargetsMet(response.data?.meta?.targetsMet ?? null);
        setSyncAlerts(Array.isArray(response.data?.meta?.alerts) ? response.data.meta.alerts : []);
        setSyncStatus("updated");

        etagRef.current = "";
        await syncRecords(true);

        if (!response.data?.data) {
          throw new Error("Bulk import response is empty.");
        }

        return response.data.data;
      } catch (err) {
        await handleApiError(err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [token, syncRecords, handleApiError],
  );

  useEffect(() => {
    void syncRecords(false);
  }, [syncRecords]);

  useEffect(() => {
    if (!token) return;

    const scheduleSync = (delayMs: number) => {
      if (typeof window === "undefined") {
        return;
      }

      clearRealtimeSyncTimer();
      realtimeSyncTimerRef.current = window.setTimeout(() => {
        realtimeSyncTimerRef.current = null;
        void syncRecords(true);
      }, delayMs);
    };

    const unsubscribe = subscribeSharedSyncPolling((trigger, payload) => {
      if (trigger === "realtime") {
        const entity = payload?.entity ?? "";
        if (!["dashboard", "students", "teachers", "forms", "indicators"].includes(entity)) {
          return;
        }

        if (role === "school_head" && (entity === "students" || entity === "teachers")) {
          const incomingSchoolCode = String(payload?.schoolCode ?? "").trim().toUpperCase();
          const userSchoolCode = String(user?.schoolCode ?? "").trim().toUpperCase();
          if (incomingSchoolCode && userSchoolCode) {
            if (incomingSchoolCode !== userSchoolCode) {
              return;
            }
          } else if (
            user?.schoolId !== null
            && user?.schoolId !== undefined
            && payload?.schoolId !== null
            && payload?.schoolId !== undefined
            && String(payload.schoolId) !== String(user.schoolId)
          ) {
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
  }, [token, syncRecords, role, user?.schoolId, user?.schoolCode]);

  const value = useMemo<DataContextType>(
    () => ({
      records,
      recordCount,
      targetsMet,
      syncAlerts,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      syncScope,
      syncStatus,
      refreshRecords,
      addRecord,
      updateRecord,
      deleteRecord,
      previewDeleteRecord,
      listArchivedRecords,
      restoreRecord,
      sendReminder,
      updateSchoolHeadAccountStatus,
      activateSchoolHeadAccount,
      issueSchoolHeadAccountActionVerificationCode,
      issueSchoolHeadSetupLink,
      issueSchoolHeadPasswordResetLink,
      upsertSchoolHeadAccountProfile,
      removeSchoolHeadAccount,
      bulkImportRecords,
    }),
    [
      records,
      recordCount,
      targetsMet,
      syncAlerts,
      isLoading,
      isSaving,
      error,
      lastSyncedAt,
      syncScope,
      syncStatus,
      refreshRecords,
      addRecord,
      updateRecord,
      deleteRecord,
      previewDeleteRecord,
      listArchivedRecords,
      restoreRecord,
      sendReminder,
      updateSchoolHeadAccountStatus,
      activateSchoolHeadAccount,
      issueSchoolHeadAccountActionVerificationCode,
      issueSchoolHeadSetupLink,
      issueSchoolHeadPasswordResetLink,
      upsertSchoolHeadAccountProfile,
      removeSchoolHeadAccount,
      bulkImportRecords,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within DataProvider");
  }
  return context;
}
