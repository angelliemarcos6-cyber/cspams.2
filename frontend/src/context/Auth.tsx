import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  apiRequest,
  apiRequestVoid,
  buildApiUrl,
  TOKEN_EXPIRED_EVENT_NAME,
  type ApiRequestAuth,
  type AuthMode,
  isApiError,
} from "@/lib/api";
import { stopRealtimeBridge } from "@/lib/realtime";
import {
  AUTH_LOGOUT_EVENT_STORAGE_KEY,
  AUTH_STATE_STORAGE_KEY,
  clearClientSessionArtifacts,
  broadcastLogoutEvent,
  enqueuePendingLogoutRevoke,
  readClientAuthState,
  readPendingLogoutRevokes,
  removePendingLogoutRevoke,
  updatePendingLogoutRevoke,
  writeClientAuthState,
} from "@/lib/sessionCleanup";
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

interface RequestMonitorPasswordResetResponse {
  message?: string;
  delivery?: string;
  deliveryMessage?: string;
}

interface RequestSchoolHeadSetupLinkRecoveryResponse {
  message?: string;
}

interface ResetMonitorPasswordInput {
  role?: Exclude<UserRole, null>;
  email: string;
  token: string;
  password: string;
  confirmPassword: string;
}

interface ResetMonitorPasswordResponse {
  message?: string;
}

interface RequestMonitorMfaResetInput {
  login: string;
  password: string;
  reason?: string;
}

interface RequestMonitorMfaResetResponse {
  status: string;
  requestId: number;
  expiresAt: string;
  message?: string;
}

interface CompleteMonitorMfaResetInput {
  login: string;
  password: string;
  requestId: number;
  approvalToken: string;
}

interface CompleteMonitorMfaResetResponse extends BearerTokenAuthPayload {
  user: SessionUser;
  backupCodes?: string[];
  message?: string;
}

interface CompleteMonitorMfaResetResult {
  backupCodes: string[];
  message: string;
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

interface BearerTokenAuthPayload {
  token?: string | null;
  expiresAt?: string | null;
  refreshAfter?: string | null;
}

interface AuthContextType {
  role: UserRole;
  username: string;
  user: SessionUser | null;
  requestAuth: ApiRequestAuth | null;
  requestToken: string;
  authMode: AuthMode | null;
  authError: string;
  authErrorCode: number | null;
  accountStatus: string | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  isLoggingOut: boolean;
  clearAuthError: () => void;
  login: (input: LoginInput) => Promise<LoginResult>;
  verifyMfa: (input: VerifyMonitorMfaInput) => Promise<void>;
  requestMonitorPasswordReset: (
    email: string,
    role?: Exclude<UserRole, null>,
  ) => Promise<RequestMonitorPasswordResetResponse>;
  requestSchoolHeadSetupLinkRecovery: (schoolCode: string) => Promise<RequestSchoolHeadSetupLinkRecoveryResponse>;
  resetMonitorPassword: (input: ResetMonitorPasswordInput) => Promise<ResetMonitorPasswordResponse>;
  requestMonitorMfaReset: (input: RequestMonitorMfaResetInput) => Promise<RequestMonitorMfaResetResponse>;
  completeMonitorMfaReset: (input: CompleteMonitorMfaResetInput) => Promise<CompleteMonitorMfaResetResult>;
  completeAccountSetup: (input: CompleteAccountSetupInput) => Promise<string>;
  resetRequiredPassword: (input: LoginInput & { newPassword: string; confirmPassword: string }) => Promise<void>;
  logout: (options?: { force?: boolean }) => Promise<void>;
  listActiveSessions: () => Promise<ActiveSessionDevice[]>;
  revokeSessionDevice: (sessionId: string) => Promise<void>;
  revokeOtherSessions: () => Promise<{ revokedTokenCount: number; revokedWebSessionCount: number }>;
}

interface AuthenticatedResponse extends BearerTokenAuthPayload {
  mode?: AuthMode | null;
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
  mode?: AuthMode | null;
  user: SessionUser;
}

type ResetRequiredPasswordResponse = AuthenticatedResponse;

interface CompleteAccountSetupResponse {
  message?: string;
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

interface AuthErrorPayload {
  accountStatus?: string;
}

const COOKIE_AUTH: ApiRequestAuth = { authMode: "cookie" };
const LOGOUT_REVOKE_MAX_ATTEMPTS = 3;
const LOGOUT_REVOKE_BACKOFF_MS = [300, 1000, 2000] as const;

function isMfaRequiredResponse(payload: LoginResponse): payload is LoginMfaRequiredResponse {
  return (
    "requiresMfa" in payload &&
    payload.requiresMfa === true &&
    typeof payload.mfa?.challengeId === "string" &&
    typeof payload.mfa?.expiresAt === "string"
  );
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeRole(role: string): Exclude<UserRole, null> {
  return role === "monitor" ? "monitor" : "school_head";
}

function normalizeUser(user: SessionUser): SessionUser {
  return {
    ...user,
    role: normalizeRole(user.role),
  };
}

function resolveAuthMode(
  payload: Partial<BearerTokenAuthPayload> & { mode?: AuthMode | null },
  fallbackMode: AuthMode = "cookie",
): AuthMode {
  if (payload.mode === "token" || payload.mode === "cookie") {
    return payload.mode;
  }

  if (typeof payload.token === "string" && payload.token.trim().length > 0) {
    return "token";
  }

  return fallbackMode;
}

function finalizeClientLogout(
  setUser: (user: SessionUser | null) => void,
  setRequestToken: (token: string) => void,
  setAuthMode: (authMode: AuthMode | null) => void,
  clearAuthError: () => void,
): void {
  stopRealtimeBridge();
  clearClientSessionArtifacts();
  setUser(null);
  setRequestToken("");
  setAuthMode(null);
  clearAuthError();
}

async function postLogoutRevoke(token: string): Promise<void> {
  const response = await fetch(buildApiUrl("/api/auth/logout"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      logout_token: token,
    }),
  });

  if (response.ok || response.status === 401) {
    return;
  }

  throw new Error(`Logout revoke failed with status ${response.status}.`);
}

function sendLogoutRevokeBeacon(token: string): boolean {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return false;
  }

  try {
    const body = new URLSearchParams({
      logout_token: token,
    });

    return navigator.sendBeacon(buildApiUrl("/api/auth/logout"), body);
  } catch {
    return false;
  }
}

async function waitForBackoff(attempt: number): Promise<void> {
  const delay = LOGOUT_REVOKE_BACKOFF_MS[Math.min(attempt, LOGOUT_REVOKE_BACKOFF_MS.length - 1)] ?? 2000;

  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialStoredAuth = readClientAuthState();
  const [user, setUser] = useState<SessionUser | null>(initialStoredAuth?.user ?? null);
  const [requestToken, setRequestToken] = useState<string>(initialStoredAuth?.token ?? "");
  const [authMode, setAuthMode] = useState<AuthMode | null>(initialStoredAuth?.authMode ?? null);
  const [authError, setAuthError] = useState("");
  const [authErrorCode, setAuthErrorCode] = useState<number | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutQueueFlushRef = useRef(false);

  const clearAuthError = useCallback(() => {
    setAuthError("");
    setAuthErrorCode(null);
    setAccountStatus(null);
  }, []);

  const requestAuth = useMemo<ApiRequestAuth | null>(() => {
    if (!user || !authMode) {
      return null;
    }

    if (authMode === "token") {
      const bearerToken = requestToken.trim();
      return bearerToken ? { authMode: "token", token: bearerToken } : null;
    }

    return COOKIE_AUTH;
  }, [authMode, requestToken, user]);

  const applyStoredAuthState = useCallback((state: ReturnType<typeof readClientAuthState>) => {
    if (!state) {
      finalizeClientLogout(setUser, setRequestToken, setAuthMode, clearAuthError);
      return;
    }

    setUser(normalizeUser(state.user));
    setAuthMode(state.authMode);
    setRequestToken(state.authMode === "token" ? (state.token ?? "") : "");
    clearAuthError();
  }, [clearAuthError]);

  const flushPendingLogoutRevokes = useCallback(async () => {
    if (logoutQueueFlushRef.current) {
      return;
    }

    logoutQueueFlushRef.current = true;

    try {
      const queuedItems = readPendingLogoutRevokes()
        .sort((left, right) => left.createdAt - right.createdAt);

      for (const item of queuedItems) {
        let succeeded = false;
        let lastError: unknown = null;

        for (let attempt = item.attempts; attempt < LOGOUT_REVOKE_MAX_ATTEMPTS; attempt += 1) {
          try {
            await postLogoutRevoke(item.token);
            removePendingLogoutRevoke(item.token);
            succeeded = true;
            break;
          } catch (error) {
            lastError = error;
            const nextAttempt = attempt + 1;
            updatePendingLogoutRevoke({
              ...item,
              attempts: nextAttempt,
              nextRetryAt: Date.now() + (LOGOUT_REVOKE_BACKOFF_MS[Math.min(attempt, LOGOUT_REVOKE_BACKOFF_MS.length - 1)] ?? 2000),
              lastError: error instanceof Error ? error.message : "Unknown revoke error.",
            });

            if (nextAttempt < LOGOUT_REVOKE_MAX_ATTEMPTS) {
              await waitForBackoff(attempt);
            }
          }
        }

        if (!succeeded) {
          console.error("Failed to revoke logout token after retries. It remains queued for the next app load.", lastError);
        }
      }
    } finally {
      logoutQueueFlushRef.current = false;
    }
  }, []);

  const commitAuthenticatedSession = useCallback((payload: AuthenticatedResponse): SessionUser => {
    const resolvedMode = resolveAuthMode(payload);
    const nextUser = normalizeUser(payload.user);

    if (resolvedMode === "token") {
      const bearerToken = typeof payload.token === "string" ? payload.token.trim() : "";
      if (!bearerToken) {
        throw new Error("Bearer-token authentication completed without a token.");
      }

      writeClientAuthState({
        user: nextUser,
        authMode: "token",
        token: bearerToken,
      });
      setRequestToken(bearerToken);
      setAuthMode("token");
    } else {
      writeClientAuthState({
        user: nextUser,
        authMode: "cookie",
        token: null,
      });
      setRequestToken("");
      setAuthMode("cookie");
    }

    setUser(nextUser);
    clearAuthError();

    return nextUser;
  }, [clearAuthError]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const restoreWithAuth = async (candidateAuth: ApiRequestAuth): Promise<boolean> => {
      try {
        const payload = await apiRequest<MeResponse>("/api/auth/me", {
          auth: candidateAuth,
          signal: controller.signal,
        });

        if (!active) return true;

        const resolvedMode = resolveAuthMode(payload, candidateAuth.authMode);
        const nextUser = normalizeUser(payload.user);
        if (resolvedMode === "token") {
          const bearerToken = candidateAuth.authMode === "token"
            ? candidateAuth.token.trim()
            : (typeof payload.token === "string" ? payload.token.trim() : "");

          if (!bearerToken) {
            throw new Error("Token-mode session restore completed without a bearer token.");
          }

          writeClientAuthState({
            user: nextUser,
            authMode: "token",
            token: bearerToken,
          });
          setRequestToken(bearerToken);
          setAuthMode("token");
        } else {
          writeClientAuthState({
            user: nextUser,
            authMode: "cookie",
            token: null,
          });
          setRequestToken("");
          setAuthMode("cookie");
        }

        setUser(nextUser);
        clearAuthError();

        return true;
      } catch (err) {
        if (isApiError(err) && err.status === 401) {
          if (candidateAuth.authMode === "token") {
            writeClientAuthState(null);
          }

          return false;
        }

        throw err;
      }
    };

    const restore = async () => {
      try {
        await flushPendingLogoutRevokes();
        const storedToken = readClientAuthState()?.token ?? "";

        if (storedToken && await restoreWithAuth({ authMode: "token", token: storedToken })) {
          return;
        }

        if (await restoreWithAuth(COOKIE_AUTH)) {
          return;
        }

        if (!active) return;
        setUser(null);
        setRequestToken("");
        setAuthMode(null);
        setAuthError("");
        setAuthErrorCode(401);
        setAccountStatus(null);
        writeClientAuthState(null);
      } catch (err) {
        if (!active) return;
        if (isApiError(err)) {
          if (err.status === 401) {
            setUser(null);
            setRequestToken("");
            setAuthMode(null);
            setAuthError("");
            setAuthErrorCode(401);
            setAccountStatus(null);
            writeClientAuthState(null);
          } else if (err.status === 403) {
            setUser(null);
            setRequestToken("");
            setAuthMode(null);
            setAuthError(err.message || "Your account cannot access the system right now.");
            setAuthErrorCode(403);

            const payload = err.payload as AuthErrorPayload | null;
            setAccountStatus(typeof payload?.accountStatus === "string" ? payload.accountStatus : null);
            writeClientAuthState(null);
          } else {
            setUser(null);
            setRequestToken("");
            setAuthMode(null);
            setAuthError(err.message || "Unable to restore your session.");
            setAuthErrorCode(err.status);
            setAccountStatus(null);
            writeClientAuthState(null);
          }
        } else if (!(err instanceof DOMException && err.name === "AbortError")) {
          setUser(null);
          setRequestToken("");
          setAuthMode(null);
          setAuthError("Unable to restore your session.");
          setAuthErrorCode(null);
          setAccountStatus(null);
          writeClientAuthState(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void restore();

    return () => {
      active = false;
      controller.abort();
    };
  }, [clearAuthError, flushPendingLogoutRevokes]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (event.key === AUTH_LOGOUT_EVENT_STORAGE_KEY) {
        finalizeClientLogout(setUser, setRequestToken, setAuthMode, clearAuthError);
        return;
      }

      if (event.key === AUTH_STATE_STORAGE_KEY) {
        applyStoredAuthState(readClientAuthState());
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [applyStoredAuthState, clearAuthError]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleTokenExpired = () => {
      finalizeClientLogout(setUser, setRequestToken, setAuthMode, clearAuthError);
      broadcastLogoutEvent("token_expired");
    };

    window.addEventListener(TOKEN_EXPIRED_EVENT_NAME, handleTokenExpired);
    return () => window.removeEventListener(TOKEN_EXPIRED_EVENT_NAME, handleTokenExpired);
  }, [clearAuthError]);

  const login = useCallback(async ({ role, login: loginValue, password }: LoginInput): Promise<LoginResult> => {
    setIsAuthenticating(true);
    try {
      const body = {
        role,
        login: loginValue,
        password,
      };

      const payload = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        auth: COOKIE_AUTH,
        body,
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

      const normalizedUser = commitAuthenticatedSession(payload);

      return {
        status: "authenticated",
        user: normalizedUser,
      };
    } finally {
      setIsAuthenticating(false);
    }
  }, [commitAuthenticatedSession]);

  const verifyMfa = useCallback(async ({ role, login: loginValue, challengeId, code }: VerifyMonitorMfaInput) => {
    setIsAuthenticating(true);
    try {
      const payload = await apiRequest<AuthenticatedResponse>("/api/auth/verify-mfa", {
        method: "POST",
        auth: COOKIE_AUTH,
        body: {
          role,
          login: loginValue,
          challenge_id: challengeId,
          code,
        },
      });

      commitAuthenticatedSession(payload);
    } finally {
      setIsAuthenticating(false);
    }
  }, [commitAuthenticatedSession]);

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
          auth: COOKIE_AUTH,
          body: {
            role,
            login: loginValue,
            current_password: password,
            new_password: newPassword,
            new_password_confirmation: confirmPassword,
          },
        });

        commitAuthenticatedSession(payload);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [commitAuthenticatedSession],
  );

  const requestMonitorPasswordReset = useCallback(async (email: string, role: Exclude<UserRole, null> = "monitor") => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error("Email address is required.");
    }

    setIsAuthenticating(true);
    try {
      return await apiRequest<RequestMonitorPasswordResetResponse>("/api/auth/forgot-password", {
        method: "POST",
        auth: COOKIE_AUTH,
        body: {
          role,
          email: normalizedEmail,
        },
      });
    } finally {
      setIsAuthenticating(false);
    }
  }, [clearAuthError]);

  const requestSchoolHeadSetupLinkRecovery = useCallback(async (schoolCode: string) => {
    const normalizedSchoolCode = schoolCode.replace(/\D/g, "").slice(0, 6);
    if (normalizedSchoolCode.length !== 6) {
      throw new Error("School code must be exactly 6 digits.");
    }

    setIsAuthenticating(true);
    try {
      return await apiRequest<RequestSchoolHeadSetupLinkRecoveryResponse>("/api/auth/setup-link/recovery", {
        method: "POST",
        auth: COOKIE_AUTH,
        body: {
          school_code: normalizedSchoolCode,
        },
      });
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const resetMonitorPassword = useCallback(
    async ({ role, email, token, password, confirmPassword }: ResetMonitorPasswordInput) => {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedToken = token.trim();
      if (!normalizedEmail || !normalizedToken) {
        throw new Error("Reset link is missing required details. Please request a new one.");
      }

      setIsAuthenticating(true);
      try {
        return await apiRequest<ResetMonitorPasswordResponse>("/api/auth/reset-password", {
          method: "POST",
          auth: COOKIE_AUTH,
          body: {
            role: role ?? undefined,
            email: normalizedEmail,
            token: normalizedToken,
            password,
            password_confirmation: confirmPassword,
          },
        });
      } finally {
        setIsAuthenticating(false);
      }
    },
    [],
  );

  const requestMonitorMfaReset = useCallback(async ({ login, password, reason }: RequestMonitorMfaResetInput) => {
    const normalizedLogin = login.trim().toLowerCase();
    if (!normalizedLogin) {
      throw new Error("Monitor email is required.");
    }

    setIsAuthenticating(true);
    try {
      return await apiRequest<RequestMonitorMfaResetResponse>("/api/auth/mfa/reset/request", {
        method: "POST",
        auth: COOKIE_AUTH,
        body: {
          role: "monitor",
          login: normalizedLogin,
          password,
          reason: reason?.trim() || undefined,
        },
      });
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const completeMonitorMfaReset = useCallback(
    async ({ login, password, requestId, approvalToken }: CompleteMonitorMfaResetInput) => {
      const normalizedLogin = login.trim().toLowerCase();
      const normalizedToken = approvalToken.trim().toUpperCase();
      if (!normalizedLogin) {
        throw new Error("Monitor email is required.");
      }

      if (!Number.isFinite(requestId) || requestId <= 0) {
        throw new Error("Request ID is invalid. Submit a new MFA reset request.");
      }

      setIsAuthenticating(true);
      try {
        const payload = await apiRequest<CompleteMonitorMfaResetResponse>("/api/auth/mfa/reset/complete", {
          method: "POST",
          auth: COOKIE_AUTH,
          body: {
            role: "monitor",
            login: normalizedLogin,
            password,
            request_id: requestId,
            approval_token: normalizedToken,
          },
        });

        commitAuthenticatedSession(payload);

        return {
          backupCodes: Array.isArray(payload.backupCodes) ? payload.backupCodes : [],
          message: payload.message?.trim() || "MFA reset completed. Store your backup codes securely.",
        };
      } finally {
        setIsAuthenticating(false);
      }
    },
    [commitAuthenticatedSession],
  );

  const completeAccountSetup = useCallback(
    async ({ token, password, confirmPassword }: CompleteAccountSetupInput) => {
      setIsAuthenticating(true);
      try {
        const payload = await apiRequest<CompleteAccountSetupResponse>("/api/auth/setup-account", {
          method: "POST",
          auth: COOKIE_AUTH,
          body: {
            token,
            password,
            password_confirmation: confirmPassword,
          },
        });

        clearAuthError();

        return payload.message?.trim() || "Account setup completed. Await Division Monitor approval before sign-in.";
      } finally {
        setIsAuthenticating(false);
      }
    },
    [clearAuthError],
  );

  const logout = useCallback(async (options?: { force?: boolean }) => {
    const activeMode = authMode;
    const bearerToken = activeMode === "token" ? requestToken.trim() : "";
    const requestAuthSnapshot = requestAuth ?? COOKIE_AUTH;

    setIsLoggingOut(true);
    if (bearerToken) {
      enqueuePendingLogoutRevoke(bearerToken);
      sendLogoutRevokeBeacon(bearerToken);
    }

    finalizeClientLogout(setUser, setRequestToken, setAuthMode, clearAuthError);
    broadcastLogoutEvent("logout");

    try {
      if (bearerToken) {
        void flushPendingLogoutRevokes();
        return;
      }

      await apiRequestVoid("/api/auth/logout", {
        method: "POST",
        auth: requestAuthSnapshot,
      });
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        return;
      }

      if (!options?.force) {
        console.error("Logout request failed after local session cleanup.", err);
      }
    } finally {
      setIsLoggingOut(false);
    }
  }, [authMode, clearAuthError, flushPendingLogoutRevokes, requestAuth, requestToken]);

  const listActiveSessions = useCallback(async (): Promise<ActiveSessionDevice[]> => {
    if (!user) {
      throw new Error("You are signed out. Please sign in again.");
    }

    if (!requestAuth) {
      throw new Error("You are signed out. Please sign in again.");
    }

    const payload = await apiRequest<ActiveSessionsResponse>("/api/auth/sessions", { auth: requestAuth });

    return Array.isArray(payload.data) ? payload.data : [];
  }, [requestAuth, user]);

  const revokeSessionDevice = useCallback(
    async (sessionId: string): Promise<void> => {
      const normalized = sessionId.trim();
      if (normalized.length === 0) {
        throw new Error("Session identifier is required.");
      }

      if (!user) {
        throw new Error("You are signed out. Please sign in again.");
      }

      await apiRequestVoid(`/api/auth/sessions/${encodeURIComponent(normalized)}`, {
        method: "DELETE",
        auth: requestAuth,
      });
    },
    [requestAuth, user],
  );

  const revokeOtherSessions = useCallback(async (): Promise<{ revokedTokenCount: number; revokedWebSessionCount: number }> => {
    if (!user) {
      throw new Error("You are signed out. Please sign in again.");
    }

    const payload = await apiRequest<RevokeOtherSessionsResponse>("/api/auth/sessions/revoke-others", {
      method: "POST",
      auth: requestAuth,
    });

    return {
      revokedTokenCount: Number(payload.data?.revokedTokenCount ?? 0),
      revokedWebSessionCount: Number(payload.data?.revokedWebSessionCount ?? 0),
    };
  }, [requestAuth, user]);

  const value = useMemo<AuthContextType>(
    () => ({
      role: user?.role ?? null,
      username: user?.name ?? "",
      user,
      requestAuth,
      requestToken,
      authMode,
      authError,
      authErrorCode,
      accountStatus,
      isLoading,
      isAuthenticating,
      isLoggingOut,
      clearAuthError,
      login,
      verifyMfa,
      requestMonitorPasswordReset,
      requestSchoolHeadSetupLinkRecovery,
      resetMonitorPassword,
      requestMonitorMfaReset,
      completeMonitorMfaReset,
      completeAccountSetup,
      resetRequiredPassword,
      logout,
      listActiveSessions,
      revokeSessionDevice,
      revokeOtherSessions,
    }),
    [
      user,
      requestAuth,
      requestToken,
      authMode,
      authError,
      authErrorCode,
      accountStatus,
      isLoading,
      isAuthenticating,
      isLoggingOut,
      clearAuthError,
      login,
      verifyMfa,
      requestMonitorPasswordReset,
      requestSchoolHeadSetupLinkRecovery,
      resetMonitorPassword,
      requestMonitorMfaReset,
      completeMonitorMfaReset,
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
