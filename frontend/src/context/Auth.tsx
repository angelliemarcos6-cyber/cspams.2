import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, apiRequestVoid, type ApiRequestAuth, type AuthMode, isApiError } from "@/lib/api";
import { stopRealtimeBridge } from "@/lib/realtime";
import { clearClientSessionArtifacts, readClientAuthToken, writeClientAuthToken } from "@/lib/sessionCleanup";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [requestToken, setRequestToken] = useState<string>(() => readClientAuthToken() ?? "");
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [authError, setAuthError] = useState("");
  const [authErrorCode, setAuthErrorCode] = useState<number | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  const commitAuthenticatedSession = useCallback((payload: AuthenticatedResponse): SessionUser => {
    const resolvedMode = resolveAuthMode(payload);
    const nextUser = normalizeUser(payload.user);

    if (resolvedMode === "token") {
      const bearerToken = typeof payload.token === "string" ? payload.token.trim() : "";
      if (!bearerToken) {
        throw new Error("Bearer-token authentication completed without a token.");
      }

      writeClientAuthToken(bearerToken);
      setRequestToken(bearerToken);
      setAuthMode("token");
    } else {
      writeClientAuthToken(null);
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

          writeClientAuthToken(bearerToken);
          setRequestToken(bearerToken);
          setAuthMode("token");
        } else {
          writeClientAuthToken(null);
          setRequestToken("");
          setAuthMode("cookie");
        }

        setUser(nextUser);
        clearAuthError();

        return true;
      } catch (err) {
        if (isApiError(err) && err.status === 401) {
          if (candidateAuth.authMode === "token") {
            writeClientAuthToken(null);
          }

          return false;
        }

        throw err;
      }
    };

    const restore = async () => {
      try {
        const storedToken = readClientAuthToken();

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
          } else if (err.status === 403) {
            setUser(null);
            setRequestToken("");
            setAuthMode(null);
            setAuthError(err.message || "Your account cannot access the system right now.");
            setAuthErrorCode(403);

            const payload = err.payload as AuthErrorPayload | null;
            setAccountStatus(typeof payload?.accountStatus === "string" ? payload.accountStatus : null);
          } else {
            setUser(null);
            setRequestToken("");
            setAuthMode(null);
            setAuthError(err.message || "Unable to restore your session.");
            setAuthErrorCode(err.status);
            setAccountStatus(null);
          }
        } else if (!(err instanceof DOMException && err.name === "AbortError")) {
          setUser(null);
          setRequestToken("");
          setAuthMode(null);
          setAuthError("Unable to restore your session.");
          setAuthErrorCode(null);
          setAccountStatus(null);
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
    setIsLoggingOut(true);
    try {
      await apiRequestVoid("/api/auth/logout", {
        method: "POST",
        auth: requestAuth ?? COOKIE_AUTH,
      });
      finalizeClientLogout(setUser, setRequestToken, setAuthMode, clearAuthError);
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        finalizeClientLogout(setUser, setRequestToken, setAuthMode, clearAuthError);
        return;
      }

      if (options?.force) {
        finalizeClientLogout(setUser, setRequestToken, setAuthMode, clearAuthError);
        return;
      }

      throw err;
    } finally {
      setIsLoggingOut(false);
    }
  }, [clearAuthError, requestAuth]);

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
