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
import { apiRequest, COOKIE_SESSION_TOKEN } from "@/lib/api";
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

interface LoginResultAuthenticated {
  status: "authenticated";
  user: SessionUser;
}

interface LoginResultMfaRequired {
  status: "mfa_required";
  challengeId: string;
  expiresAt: string;
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
  resetRequiredPassword: (input: LoginInput & { newPassword: string; confirmPassword: string }) => Promise<void>;
  logout: () => Promise<void>;
  listActiveSessions: () => Promise<ActiveSessionDevice[]>;
  revokeSessionDevice: (sessionId: string) => Promise<void>;
  revokeOtherSessions: () => Promise<{ revokedTokenCount: number; revokedWebSessionCount: number }>;
}

interface StoredSession {
  user: SessionUser;
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
}

type LoginResponse = AuthenticatedResponse | LoginMfaRequiredResponse;

interface MeResponse {
  user: SessionUser;
}

interface ResetRequiredPasswordResponse {
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
const SESSION_KEY = "cspams.auth.session";
const REMOTE_LOGOUT_QUEUE_KEY = "cspams.auth.pending_remote_logout";
const LOGOUT_REQUEST_TIMEOUT_MS = 4000;
const LOGOUT_RETRY_BASE_MS = 2000;
const LOGOUT_RETRY_MAX_MS = 60000;

interface PendingRemoteLogout {
  queuedAt: number;
  attempts: number;
  lastAttemptAt: number;
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

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { user?: SessionUser };
    if (!parsed || typeof parsed.user !== "object" || !parsed.user) {
      return null;
    }

    return {
      user: normalizeUser(parsed.user),
    };
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession | null) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function readPendingRemoteLogout(): PendingRemoteLogout | null {
  try {
    const raw = localStorage.getItem(REMOTE_LOGOUT_QUEUE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingRemoteLogout>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const queuedAt = Number(parsed.queuedAt);
    const attempts = Number(parsed.attempts);
    const lastAttemptAt = Number(parsed.lastAttemptAt);
    if (!Number.isFinite(queuedAt) || !Number.isFinite(attempts) || !Number.isFinite(lastAttemptAt)) {
      return null;
    }

    return {
      queuedAt,
      attempts: Math.max(0, Math.floor(attempts)),
      lastAttemptAt,
    };
  } catch {
    return null;
  }
}

function writePendingRemoteLogout(entry: PendingRemoteLogout | null) {
  if (!entry) {
    localStorage.removeItem(REMOTE_LOGOUT_QUEUE_KEY);
    return;
  }

  localStorage.setItem(REMOTE_LOGOUT_QUEUE_KEY, JSON.stringify(entry));
}

function nextLogoutRetryDelayMs(attempts: number): number {
  const safeAttempts = Math.max(0, Math.floor(attempts));
  const multiplier = 2 ** Math.min(safeAttempts, 6);
  return Math.min(LOGOUT_RETRY_BASE_MS * multiplier, LOGOUT_RETRY_MAX_MS);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => readStoredSession());
  const [isLoading, setIsLoading] = useState<boolean>(() => readStoredSession() !== null);
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
      });

      writePendingRemoteLogout(null);
      return true;
    } catch {
      writePendingRemoteLogout({
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
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const restoreSession = async () => {
      try {
        const payload = await apiRequest<MeResponse>("/api/auth/me", {
          signal: controller.signal,
        });

        if (!active) return;

        const normalizedSession: StoredSession = {
          user: normalizeUser(payload.user),
        };

        setSession(normalizedSession);
        writeStoredSession(normalizedSession);
      } catch {
        if (!active) return;
        clearSession();
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void restoreSession();

    return () => {
      active = false;
      controller.abort();
    };
  }, [clearSession]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== SESSION_KEY) return;
      setSession(readStoredSession());
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      void flushPendingRemoteLogout();
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      void flushPendingRemoteLogout();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== REMOTE_LOGOUT_QUEUE_KEY || !event.newValue) return;
      void flushPendingRemoteLogout();
    };

    void flushPendingRemoteLogout();

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("storage", handleStorage);

    return () => {
      clearLogoutRetryTimer();
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("storage", handleStorage);
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
        };
      }

      const nextSession: StoredSession = {
        user: normalizeUser(payload.user),
      };

      setSession(nextSession);
      writeStoredSession(nextSession);
      return {
        status: "authenticated",
        user: nextSession.user,
      };
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

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

        const nextSession: StoredSession = {
          user: normalizeUser(payload.user),
        };

        setSession(nextSession);
        writeStoredSession(nextSession);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [],
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

        const nextSession: StoredSession = {
          user: normalizeUser(payload.user),
        };

        setSession(nextSession);
        writeStoredSession(nextSession);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    clearSession();
    setIsLoggingOut(true);

    const now = Date.now();
    const existing = readPendingRemoteLogout();
    writePendingRemoteLogout({
      queuedAt: existing?.queuedAt ?? now,
      attempts: existing?.attempts ?? 0,
      lastAttemptAt: now,
    });

    try {
      await flushPendingRemoteLogout();
    } finally {
      setIsLoggingOut(false);
    }
  }, [clearSession, flushPendingRemoteLogout]);

  const listActiveSessions = useCallback(async (): Promise<ActiveSessionDevice[]> => {
    const payload = await apiRequest<ActiveSessionsResponse>("/api/auth/sessions");

    return Array.isArray(payload.data) ? payload.data : [];
  }, []);

  const revokeSessionDevice = useCallback(async (sessionId: string): Promise<void> => {
    const normalized = sessionId.trim();
    if (normalized.length === 0) {
      throw new Error("Session identifier is required.");
    }

    await apiRequest<void>(`/api/auth/sessions/${encodeURIComponent(normalized)}`, {
      method: "DELETE",
    });
  }, []);

  const revokeOtherSessions = useCallback(async (): Promise<{ revokedTokenCount: number; revokedWebSessionCount: number }> => {
    const payload = await apiRequest<RevokeOtherSessionsResponse>("/api/auth/sessions/revoke-others", {
      method: "POST",
    });

    return {
      revokedTokenCount: Number(payload.data?.revokedTokenCount ?? 0),
      revokedWebSessionCount: Number(payload.data?.revokedWebSessionCount ?? 0),
    };
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      role: session?.user.role ?? null,
      username: session?.user.name ?? "",
      token: session?.user ? COOKIE_SESSION_TOKEN : "",
      user: session?.user ?? null,
      isLoading,
      isAuthenticating,
      isLoggingOut,
      login,
      verifyMfa,
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
