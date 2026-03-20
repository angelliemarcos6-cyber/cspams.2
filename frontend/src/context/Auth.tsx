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
import { apiRequest, isApiError } from "@/lib/api";
import type { ActiveSessionDevice, SessionUser, UserRole } from "@/types";

interface LoginInput {
  role: Exclude<UserRole, null>;
  login: string;
  password: string;
}

interface VerifyMonitorMfaInput {
  role: "monitor";
  login: string;
  challengeId: string;
  code: string;
}

interface CompleteAccountSetupInput {
  token: string;
  password: string;
  confirmPassword: string;
}

interface LoginResultAuthenticated {
  status: "authenticated";
  user: SessionUser;
}

interface LoginResultMfaRequired {
  status: "mfa_required";
  challengeId: string;
  expiresAt: string;
  delivery?: string;
  deliveryMessage?: string;
}

type LoginResult = LoginResultAuthenticated | LoginResultMfaRequired;

interface AuthContextType {
  role: UserRole;
  username: string;
  token: string;
  user: SessionUser | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  isLoggingOut: boolean;
  login: (input: LoginInput) => Promise<LoginResult>;
  verifyMfa: (input: VerifyMonitorMfaInput) => Promise<void>;
  completeAccountSetup: (input: CompleteAccountSetupInput) => Promise<void>;
  resetRequiredPassword: (input: LoginInput & { newPassword: string; confirmPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
  listActiveSessions: () => Promise<ActiveSessionDevice[]>;
  revokeSessionDevice: (sessionId: string) => Promise<void>;
  revokeOtherSessions: () => Promise<{ revokedTokenCount: number; revokedWebSessionCount: number }>;
}

interface StoredSession {
  user: SessionUser;
  token: string;
}

interface AuthenticatedResponse {
  token?: string;
  user: SessionUser;
}

interface LoginMfaRequiredResponse {
  requiresMfa: true;
  mfa: {
    challengeId: string;
    expiresAt: string;
  };
  delivery?: string;
  deliveryMessage?: string;
  message?: string;
}

type LoginResponse = AuthenticatedResponse | LoginMfaRequiredResponse;

interface MeResponse {
  user: SessionUser;
}

interface ResetRequiredPasswordResponse {
  token?: string;
  user: SessionUser;
}

interface CompleteAccountSetupResponse {
  token?: string;
  user: SessionUser;
}

interface ActiveSessionsResponse {
  data: ActiveSessionDevice[];
  meta?: {
    total?: number;
  };
}

interface RevokeOtherSessionsResponse {
  data?: {
    revokedTokenCount?: number;
    revokedWebSessionCount?: number;
  };
}

function isMfaRequiredResponse(payload: LoginResponse): payload is LoginMfaRequiredResponse {
  return (
    "requiresMfa" in payload &&
    payload.requiresMfa === true &&
    typeof payload.mfa?.challengeId === "string" &&
    typeof payload.mfa?.expiresAt === "string"
  );
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_KEY = "cspams.auth.session.v2";
const LEGACY_SESSION_KEY = "cspams.auth.session";
const REMOTE_LOGOUT_QUEUE_KEY = "cspams.auth.pending_remote_logout.v2";
const LEGACY_REMOTE_LOGOUT_QUEUE_KEY = "cspams.auth.pending_remote_logout";
const LOGOUT_REQUEST_TIMEOUT_MS = 4000;
const LOGOUT_RETRY_BASE_MS = 2000;
const LOGOUT_RETRY_MAX_MS = 60000;

interface PendingRemoteLogout {
  token: string;
  queuedAt: number;
  attempts: number;
  lastAttemptAt: number;
}

function readSessionStorageItem(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorageItem(key: string, value: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value === null) {
      window.sessionStorage.removeItem(key);
      return;
    }

    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function readLocalStorageItem(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeLocalStorageItem(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function normalizeRole(role: string): Exclude<UserRole, null> {
  return role === "monitor" ? "monitor" : "school_head";
}

function normalizeUser(user: SessionUser): SessionUser {
  return {
    ...user,
    role: normalizeRole(user.role),
  };
}

function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { user?: SessionUser; token?: unknown };
    if (!parsed || typeof parsed.user !== "object" || !parsed.user) {
      return null;
    }

    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    if (!token) {
      return null;
    }

    return {
      user: normalizeUser(parsed.user),
      token,
    };
  } catch {
    return null;
  }
}

function parsePendingRemoteLogout(raw: string | null): PendingRemoteLogout | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingRemoteLogout>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    const queuedAt = Number(parsed.queuedAt);
    const attempts = Number(parsed.attempts);
    const lastAttemptAt = Number(parsed.lastAttemptAt);
    if (
      !token ||
      !Number.isFinite(queuedAt) ||
      !Number.isFinite(attempts) ||
      !Number.isFinite(lastAttemptAt)
    ) {
      return null;
    }

    return {
      token,
      queuedAt,
      attempts: Math.max(0, Math.floor(attempts)),
      lastAttemptAt,
    };
  } catch {
    return null;
  }
}

function createStoredSession(user: SessionUser, rawToken: unknown): StoredSession {
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!token) {
    throw new Error("Authentication token was not issued. Please sign in again.");
  }

  return {
    user: normalizeUser(user),
    token,
  };
}

function readStoredSession(): StoredSession | null {
  const sessionScoped = parseStoredSession(readSessionStorageItem(SESSION_KEY));
  if (sessionScoped) {
    return sessionScoped;
  }

  const legacyShared = parseStoredSession(readLocalStorageItem(LEGACY_SESSION_KEY));
  if (legacyShared) {
    writeSessionStorageItem(SESSION_KEY, JSON.stringify(legacyShared));
    removeLocalStorageItem(LEGACY_SESSION_KEY);
    return legacyShared;
  }

  return null;
}

function writeStoredSession(session: StoredSession | null) {
  if (!session) {
    writeSessionStorageItem(SESSION_KEY, null);
    removeLocalStorageItem(LEGACY_SESSION_KEY);
    return;
  }

  writeSessionStorageItem(SESSION_KEY, JSON.stringify(session));
  removeLocalStorageItem(LEGACY_SESSION_KEY);
}

function readPendingRemoteLogout(): PendingRemoteLogout | null {
  const sessionScoped = parsePendingRemoteLogout(readSessionStorageItem(REMOTE_LOGOUT_QUEUE_KEY));
  if (sessionScoped) {
    return sessionScoped;
  }

  const legacyShared = parsePendingRemoteLogout(readLocalStorageItem(LEGACY_REMOTE_LOGOUT_QUEUE_KEY));
  if (legacyShared) {
    writeSessionStorageItem(REMOTE_LOGOUT_QUEUE_KEY, JSON.stringify(legacyShared));
    removeLocalStorageItem(LEGACY_REMOTE_LOGOUT_QUEUE_KEY);
    return legacyShared;
  }

  return null;
}

function writePendingRemoteLogout(entry: PendingRemoteLogout | null) {
  if (!entry) {
    writeSessionStorageItem(REMOTE_LOGOUT_QUEUE_KEY, null);
    removeLocalStorageItem(LEGACY_REMOTE_LOGOUT_QUEUE_KEY);
    return;
  }

  writeSessionStorageItem(REMOTE_LOGOUT_QUEUE_KEY, JSON.stringify(entry));
  removeLocalStorageItem(LEGACY_REMOTE_LOGOUT_QUEUE_KEY);
}

function nextLogoutRetryDelayMs(attempts: number): number {
  const safeAttempts = Math.max(0, Math.floor(attempts));
  const multiplier = 2 ** Math.min(safeAttempts, 6);
  return Math.min(LOGOUT_RETRY_BASE_MS * multiplier, LOGOUT_RETRY_MAX_MS);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => readStoredSession());
  // Restore instantly from session storage to avoid blocking the UI on `/api/auth/me`
  // (especially on free-tier hosts that can cold start).
  const [isLoading] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutRetryTimerRef = useRef<number | null>(null);
  const logoutInFlightRef = useRef(false);

  const clearSession = useCallback(() => {
    setSession(null);
    writeStoredSession(null);
  }, []);

  const clearLogoutRetryTimer = useCallback(() => {
    if (logoutRetryTimerRef.current !== null) {
      window.clearTimeout(logoutRetryTimerRef.current);
      logoutRetryTimerRef.current = null;
    }
  }, []);

  const attemptRemoteLogout = useCallback(async (): Promise<boolean> => {
    const pending = readPendingRemoteLogout();
    if (!pending) {
      return true;
    }

    if (logoutInFlightRef.current) {
      return false;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      writePendingRemoteLogout({
        token: pending.token,
        queuedAt: pending.queuedAt,
        attempts: pending.attempts + 1,
        lastAttemptAt: Date.now(),
      });
      return false;
    }

    logoutInFlightRef.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), LOGOUT_REQUEST_TIMEOUT_MS);

    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
        signal: controller.signal,
        token: pending.token,
      });

      writePendingRemoteLogout(null);
      return true;
    } catch (error) {
      // If the server already considers this client logged out,
      // clear the queue so stale retries cannot revoke a new session later.
      if (isApiError(error) && (error.status === 401 || error.status === 419)) {
        writePendingRemoteLogout(null);
        return true;
      }

      writePendingRemoteLogout({
        token: pending.token,
        queuedAt: pending.queuedAt,
        attempts: pending.attempts + 1,
        lastAttemptAt: Date.now(),
      });
      return false;
    } finally {
      window.clearTimeout(timeout);
      logoutInFlightRef.current = false;
    }
  }, []);

  const flushPendingRemoteLogout = useCallback(async (): Promise<boolean> => {
    clearLogoutRetryTimer();

    const pending = readPendingRemoteLogout();
    if (!pending) {
      return true;
    }

    const success = await attemptRemoteLogout();
    if (success) {
      return true;
    }

    const nextPending = readPendingRemoteLogout();
    if (!nextPending) {
      return true;
    }

    const delay = nextLogoutRetryDelayMs(nextPending.attempts);
    logoutRetryTimerRef.current = window.setTimeout(() => {
      void flushPendingRemoteLogout();
    }, delay);

    return false;
  }, [attemptRemoteLogout, clearLogoutRetryTimer]);

  useEffect(() => {
    const initialSession = readStoredSession();
    if (!initialSession) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    const restoreSession = async () => {
      try {
        const payload = await apiRequest<MeResponse>("/api/auth/me", {
          signal: controller.signal,
          token: initialSession.token,
        });

        if (!active) return;

        const normalizedSession: StoredSession = {
          user: normalizeUser(payload.user),
          token: initialSession.token,
        };

        setSession(normalizedSession);
        writeStoredSession(normalizedSession);
      } catch {
        if (!active) return;
        clearSession();
      }
    };

    void restoreSession();

    return () => {
      active = false;
      controller.abort();
    };
  }, [clearSession]);

  useEffect(() => {
    const handleOnline = () => {
      void flushPendingRemoteLogout();
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void flushPendingRemoteLogout();
    };

    void flushPendingRemoteLogout();

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearLogoutRetryTimer();
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [clearLogoutRetryTimer, flushPendingRemoteLogout]);

  const login = useCallback(async ({ role, login: loginValue, password }: LoginInput): Promise<LoginResult> => {
    setIsAuthenticating(true);
    try {
      const payload = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: {
          role,
          login: loginValue,
          password,
        },
      });

      if (isMfaRequiredResponse(payload)) {
        return {
          status: "mfa_required",
          challengeId: payload.mfa.challengeId,
          expiresAt: payload.mfa.expiresAt,
          delivery: typeof payload.delivery === "string" ? payload.delivery : undefined,
          deliveryMessage:
            typeof payload.deliveryMessage === "string"
              ? payload.deliveryMessage
              : typeof payload.message === "string"
                ? payload.message
                : undefined,
        };
      }

      const nextSession = createStoredSession(payload.user, payload.token);

      setSession(nextSession);
      writeStoredSession(nextSession);
      writePendingRemoteLogout(null);
      clearLogoutRetryTimer();
      return {
        status: "authenticated",
        user: nextSession.user,
      };
    } finally {
      setIsAuthenticating(false);
    }
  }, [clearLogoutRetryTimer]);

  const verifyMfa = useCallback(
    async ({ role, login: loginValue, challengeId, code }: VerifyMonitorMfaInput) => {
      setIsAuthenticating(true);
      try {
        const payload = await apiRequest<AuthenticatedResponse>("/api/auth/verify-mfa", {
          method: "POST",
          body: {
            role,
            login: loginValue,
            challenge_id: challengeId,
            code,
          },
        });

        const nextSession = createStoredSession(payload.user, payload.token);

        setSession(nextSession);
        writeStoredSession(nextSession);
        writePendingRemoteLogout(null);
        clearLogoutRetryTimer();
      } finally {
        setIsAuthenticating(false);
      }
    },
    [clearLogoutRetryTimer],
  );

  const resetRequiredPassword = useCallback(
    async ({
      role,
      login: loginValue,
      password,
      newPassword,
      confirmPassword,
    }: LoginInput & { newPassword: string; confirmPassword: string }) => {
      setIsAuthenticating(true);
      try {
        const payload = await apiRequest<ResetRequiredPasswordResponse>("/api/auth/reset-required-password", {
          method: "POST",
          body: {
            role,
            login: loginValue,
            current_password: password,
            new_password: newPassword,
            new_password_confirmation: confirmPassword,
          },
        });

        const nextSession = createStoredSession(payload.user, payload.token);

        setSession(nextSession);
        writeStoredSession(nextSession);
        writePendingRemoteLogout(null);
        clearLogoutRetryTimer();
      } finally {
        setIsAuthenticating(false);
      }
    },
    [clearLogoutRetryTimer],
  );

  const completeAccountSetup = useCallback(
    async ({ token, password, confirmPassword }: CompleteAccountSetupInput) => {
      setIsAuthenticating(true);
      try {
        const payload = await apiRequest<CompleteAccountSetupResponse>("/api/auth/setup-account", {
          method: "POST",
          body: {
            token,
            password,
            password_confirmation: confirmPassword,
          },
        });

        const nextSession = createStoredSession(payload.user, payload.token);

        setSession(nextSession);
        writeStoredSession(nextSession);
        writePendingRemoteLogout(null);
        clearLogoutRetryTimer();
      } finally {
        setIsAuthenticating(false);
      }
    },
    [clearLogoutRetryTimer],
  );

  const logout = useCallback(async () => {
    const token = session?.token.trim() ?? "";
    setIsLoggingOut(true);
    clearSession();
    if (!token) {
      writePendingRemoteLogout(null);
      setIsLoggingOut(false);
      return;
    }

    const now = Date.now();
    const existing = readPendingRemoteLogout();
    writePendingRemoteLogout({
      token,
      queuedAt: existing?.token === token ? existing.queuedAt : now,
      attempts: existing?.token === token ? existing.attempts : 0,
      lastAttemptAt: now,
    });

    // Fire-and-forget remote logout so the UI can transition instantly.
    void flushPendingRemoteLogout();
    setIsLoggingOut(false);
  }, [clearSession, flushPendingRemoteLogout, session?.token]);

  const listActiveSessions = useCallback(async (): Promise<ActiveSessionDevice[]> => {
    const token = session?.token.trim() ?? "";
    if (!token) {
      throw new Error("You are signed out. Please sign in again.");
    }

    const payload = await apiRequest<ActiveSessionsResponse>("/api/auth/sessions", { token });

    return Array.isArray(payload.data) ? payload.data : [];
  }, [session?.token]);

  const revokeSessionDevice = useCallback(async (sessionId: string): Promise<void> => {
    const normalized = sessionId.trim();
    if (normalized.length === 0) {
      throw new Error("Session identifier is required.");
    }

    const token = session?.token.trim() ?? "";
    if (!token) {
      throw new Error("You are signed out. Please sign in again.");
    }

    await apiRequest<void>(`/api/auth/sessions/${encodeURIComponent(normalized)}`, {
      method: "DELETE",
      token,
    });
  }, [session?.token]);

  const revokeOtherSessions = useCallback(async (): Promise<{ revokedTokenCount: number; revokedWebSessionCount: number }> => {
    const token = session?.token.trim() ?? "";
    if (!token) {
      throw new Error("You are signed out. Please sign in again.");
    }

    const payload = await apiRequest<RevokeOtherSessionsResponse>("/api/auth/sessions/revoke-others", {
      method: "POST",
      token,
    });

    return {
      revokedTokenCount: Number(payload.data?.revokedTokenCount ?? 0),
      revokedWebSessionCount: Number(payload.data?.revokedWebSessionCount ?? 0),
    };
  }, [session?.token]);

  const value = useMemo<AuthContextType>(
    () => ({
      role: session?.user.role ?? null,
      username: session?.user.name ?? "",
      token: session?.token ?? "",
      user: session?.user ?? null,
      isLoading,
      isAuthenticating,
      isLoggingOut,
      login,
      verifyMfa,
      completeAccountSetup,
      resetRequiredPassword,
      logout,
      listActiveSessions,
      revokeSessionDevice,
      revokeOtherSessions,
    }),
    [
      session,
      isLoading,
      isAuthenticating,
      isLoggingOut,
      login,
      verifyMfa,
      completeAccountSetup,
      resetRequiredPassword,
      logout,
      listActiveSessions,
      revokeSessionDevice,
      revokeOtherSessions,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
